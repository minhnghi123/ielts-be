import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  USER_HEADERS,
  classifyErrorCause,
  normalizeQuestionType,
} from '@app/common';
import type { ErrorCause } from '@app/common';
import { Question } from '../entities/question.entity';
import { QuestionAnswer } from '../entities/question-answer.entity';
import { TestServiceService } from '../test-service.service';
import { BuildDrillDto, CheckDrillAnswerDto } from './drills.dto';

export interface DrillItem {
  question: Omit<
    Question,
    'answer' | 'explanation' | 'evidenceAnchor' | 'questionGroup'
  >;
  instructions: string | null;
  /** Reading: passage text; Listening: null. */
  passage: string | null;
  audioUrl: string | null;
  /** Listening: start the clip a few seconds before the evidence. */
  startMs: number | null;
  /** Came from the learner's mistake notebook (review) vs fresh practice. */
  fromNotebook: boolean;
  testTitle: string | null;
}

export interface DrillCheckResult {
  isCorrect: boolean;
  correctAnswers: string[];
  explanation: string | null;
  evidenceAnchor: Question['evidenceAnchor'];
  errorCause: ErrorCause | null;
  fromNotebook: boolean;
}

interface NotebookRow {
  questionId: string;
  errorCause: string | null;
  questionType: string | null;
}

/**
 * Targeted practice sets ("drills"). No test_attempts rows are created so band
 * statistics stay clean; outcomes flow into the mistake notebook (SRS) instead.
 */
@Injectable()
export class DrillsService {
  private readonly logger = new Logger(DrillsService.name);
  private readonly analyticsUrl =
    process.env.ANALYTICS_SERVICE_URL || 'http://localhost:5004';

  constructor(
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(QuestionAnswer)
    private readonly answerRepo: Repository<QuestionAnswer>,
    private readonly tests: TestServiceService,
  ) {}

  private systemHeaders(): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      [USER_HEADERS.ROLE]: 'system',
    };
    if (process.env.INTERNAL_API_KEY)
      h[USER_HEADERS.INTERNAL_KEY] = process.env.INTERNAL_API_KEY;
    return h;
  }

  private async notebook(
    learnerId: string,
    skill: string,
  ): Promise<NotebookRow[]> {
    try {
      const res = await fetch(
        `${this.analyticsUrl}/analytics/mistakes/${learnerId}?skill=${skill}`,
        { headers: this.systemHeaders() },
      );
      if (!res.ok) return [];
      const json = await res.json();
      const rows = (json?.data ?? json) as Array<Record<string, any>>;
      return rows
        .filter((r) => r.status !== 'fixed')
        .map((r) => ({
          questionId: r.questionId,
          errorCause: r.errorCause ?? null,
          questionType: r.questionType ?? r.mistakeType ?? null,
        }));
    } catch (e) {
      this.logger.warn(`notebook fetch failed: ${String(e)}`);
      return [];
    }
  }

  async build(
    learnerId: string,
    dto: BuildDrillDto,
  ): Promise<{
    items: DrillItem[];
    meta: {
      skill: string;
      questionType: string | null;
      errorCause: string | null;
      fromNotebook: number;
    };
  }> {
    const limit = dto.limit ?? 8;
    const wantType = dto.questionType ?? null;
    const notebook = await this.notebook(learnerId, dto.skill);
    const notebookIds = new Set(notebook.map((n) => n.questionId));

    // 1. Review first: notebook questions matching the requested type / cause.
    const prioritised = notebook
      .filter(
        (n) => !wantType || normalizeQuestionType(n.questionType) === wantType,
      )
      .sort(
        (a, b) =>
          Number(b.errorCause === dto.errorCause) -
          Number(a.errorCause === dto.errorCause),
      )
      .map((n) => n.questionId)
      .slice(0, Math.ceil(limit / 2));

    // 2. Fill with fresh questions of the same type from published tests of this skill.
    const qb = this.questionRepo
      .createQueryBuilder('q')
      .innerJoinAndSelect('q.questionGroup', 'g')
      .innerJoinAndSelect('g.section', 's')
      .innerJoin('s.test', 't')
      .addSelect(['t.title'])
      .where('t.skill = :skill', { skill: dto.skill })
      .andWhere("t.status = 'published'")
      .andWhere("t.visibility = 'public'");
    if (wantType) qb.andWhere('q.question_type = :qt', { qt: wantType });
    if (notebookIds.size > 0)
      qb.andWhere('q.id NOT IN (:...ids)', { ids: [...notebookIds] });
    const fresh = await qb
      .orderBy('RANDOM()')
      .limit(limit * 3)
      .getMany();

    const reviewQs = prioritised.length
      ? await this.questionRepo.find({
          where: { id: In(prioritised) },
          relations: [
            'questionGroup',
            'questionGroup.section',
            'questionGroup.section.test',
          ],
        })
      : [];

    // Spread difficulty: easy → hard so the learner warms up.
    const byDifficulty = (a: Question, b: Question) =>
      (a.difficulty ?? 3) - (b.difficulty ?? 3);
    const picked: Array<{ q: Question; fromNotebook: boolean }> = [
      ...reviewQs.sort(byDifficulty).map((q) => ({ q, fromNotebook: true })),
      ...fresh.sort(byDifficulty).map((q) => ({ q, fromNotebook: false })),
    ].slice(0, limit);

    const items: DrillItem[] = picked.map(({ q, fromNotebook }) => {
      const section = q.questionGroup?.section as any;
      const anchor = q.evidenceAnchor;
      const {
        answer: _a,
        explanation: _e,
        evidenceAnchor: _ev,
        questionGroup: _g,
        ...safe
      } = q as any;
      return {
        question: safe,
        instructions: q.questionGroup?.instructions ?? null,
        passage: dto.skill === 'reading' ? (section?.passage ?? null) : null,
        audioUrl:
          dto.skill === 'listening' ? (section?.audioUrl ?? null) : null,
        startMs:
          anchor?.kind === 'audio' && typeof anchor.startMs === 'number'
            ? Math.max(0, anchor.startMs - 5000)
            : null,
        fromNotebook,
        testTitle: section?.test?.title ?? null,
      };
    });

    return {
      items,
      meta: {
        skill: dto.skill,
        questionType: wantType,
        errorCause: dto.errorCause ?? null,
        fromNotebook: items.filter((i) => i.fromNotebook).length,
      },
    };
  }

  async check(
    learnerId: string,
    skill: string | undefined,
    dto: CheckDrillAnswerDto,
  ): Promise<DrillCheckResult> {
    const question = await this.questionRepo.findOne({
      where: { id: dto.questionId },
      relations: [
        'questionGroup',
        'questionGroup.section',
        'questionGroup.section.test',
      ],
    });
    if (!question) throw new NotFoundException('Question not found');
    const key = await this.answerRepo.findOne({
      where: { questionId: dto.questionId },
    });
    const correctAnswers = key?.correctAnswers ?? [];
    const caseSensitive = key?.caseSensitive ?? false;
    const given = dto.answer.trim();
    const acceptable = this.tests.buildAcceptableAnswers(
      correctAnswers,
      caseSensitive,
    );
    const isCorrect =
      !!given &&
      this.tests
        .candidateForms(given, caseSensitive)
        .some((f) => acceptable.has(f));
    const resolvedSkill =
      skill ??
      (question.questionGroup?.section as any)?.test?.skill ??
      'reading';

    const notebook = await this.notebook(learnerId, resolvedSkill);
    const fromNotebook = notebook.some((n) => n.questionId === dto.questionId);
    const errorCause: ErrorCause | null = isCorrect
      ? null
      : classifyErrorCause({
          questionType: question.questionType,
          userAnswer: given,
          correctAnswers,
          instructions: question.questionGroup?.instructions,
        });

    // Fire-and-forget bookkeeping: notebook (SRS) and new mistakes.
    void (async () => {
      try {
        if (fromNotebook) {
          await fetch(`${this.analyticsUrl}/analytics/mistakes/review`, {
            method: 'POST',
            headers: this.systemHeaders(),
            body: JSON.stringify({
              learnerId,
              questionId: dto.questionId,
              correct: isCorrect,
            }),
          });
        } else if (!isCorrect) {
          await fetch(`${this.analyticsUrl}/analytics/mistakes`, {
            method: 'POST',
            headers: this.systemHeaders(),
            body: JSON.stringify({
              learnerId,
              questionId: dto.questionId,
              skill: resolvedSkill,
              questionType: question.questionType,
              mistakeType: question.questionType,
              userAnswer: given,
              correctAnswers,
              instructions: question.questionGroup?.instructions ?? null,
              errorCause,
            }),
          });
        }
      } catch (e) {
        this.logger.warn(`drill bookkeeping failed: ${String(e)}`);
      }
    })();

    return {
      isCorrect,
      correctAnswers,
      explanation: question.explanation ?? null,
      evidenceAnchor: question.evidenceAnchor ?? null,
      errorCause,
      fromNotebook,
    };
  }
}
