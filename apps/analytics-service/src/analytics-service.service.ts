import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { LearnerBandProfile } from './entities/learner-band-profile.entity';
import { LearnerMistake } from './entities/learner-mistake.entity';
import { LearnerProgressSnapshot } from './entities/learner-progress-snapshot.entity';
import { LearnerGoal } from './entities/learner-goal.entity';
import {
  UpsertBandProfileDto,
  CreateSnapshotDto,
  CreateMistakeDto,
} from './dto/analytics.dto';
import { UpsertLearnerGoalsDto } from './dto/learner-goals.dto';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { classifyErrorCause, normalizeQuestionType } from '@app/common';
import type { ErrorCause } from '@app/common';
import { QuestionExplanation } from './entities/question-explanation.entity';
import { UpsertExplanationDto } from './dto/analytics.dto';
import type { MistakeStatus } from './entities/learner-mistake.entity';

export const normalizeAnswerKey = (s: string | null | undefined) =>
  (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export const GOAL_SKILLS = [
  'listening',
  'reading',
  'writing',
  'speaking',
] as const;
export type GoalSkill = (typeof GOAL_SKILLS)[number];

/** Goals plus everything the UI needs to say "còn X tuần, cần +Y band". */
export type LearnerGoalsView = {
  learnerId: string;
  targetOverall: number;
  targets: Record<
    GoalSkill,
    {
      target: number;
      explicit: boolean;
      current: number | null;
      gap: number | null;
    }
  >;
  examDate: string | null;
  daysLeft: number | null;
  weeksLeft: number | null;
  minutesPerDay: number;
  daysPerWeek: number;
  weeklyMinutes: number;
  purpose: string | null;
  updatedAt: Date;
};

/** Local calendar date (YYYY-MM-DD) in the learner's assumed timezone (Asia/Ho_Chi_Minh). */
export function todayIsoDate(
  now: Date = new Date(),
  tz = 'Asia/Ho_Chi_Minh',
): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(now); // en-CA yields YYYY-MM-DD
}

export function daysBetweenIso(fromIso: string, toIso: string): number {
  const a = Date.UTC(
    +fromIso.slice(0, 4),
    +fromIso.slice(5, 7) - 1,
    +fromIso.slice(8, 10),
  );
  const b = Date.UTC(
    +toIso.slice(0, 4),
    +toIso.slice(5, 7) - 1,
    +toIso.slice(8, 10),
  );
  return Math.round((b - a) / 86_400_000);
}

export function isValidIsoDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

type QuestionTypeMastery = {
  questionType: string;
  correct: number;
  total: number;
  accuracy: number;
  masteryLevel: 'beginner' | 'developing' | 'proficient' | 'advanced';
};

type StudyPlanTask = {
  title: string;
  focusArea: string;
  priority: 'high' | 'medium' | 'low';
  dueInDays: number;
  recommendation: string;
};

@Injectable()
export class AnalyticsServiceService {
  private readonly logger = new Logger(AnalyticsServiceService.name);

  constructor(
    @InjectRepository(LearnerBandProfile)
    private readonly bandProfileRepo: Repository<LearnerBandProfile>,
    @InjectRepository(LearnerMistake)
    private readonly mistakeRepo: Repository<LearnerMistake>,
    @InjectRepository(LearnerProgressSnapshot)
    private readonly snapshotRepo: Repository<LearnerProgressSnapshot>,
    @InjectRepository(LearnerGoal)
    private readonly goalRepo: Repository<LearnerGoal>,
    @InjectRepository(QuestionExplanation)
    private readonly explanationRepo: Repository<QuestionExplanation>,
    private readonly dataSource: DataSource,
  ) {}

  // ─── Mistake notebook ─────────────────────────────────────────────────────────

  async listMistakes(
    learnerId: string,
    filters: {
      status?: string;
      skill?: string;
      questionType?: string;
      attemptId?: string;
      dueOnly?: boolean;
    } = {},
  ): Promise<LearnerMistake[]> {
    const qb = this.mistakeRepo
      .createQueryBuilder('m')
      .where('m.learner_id = :learnerId', { learnerId });
    if (filters.status)
      qb.andWhere('m.status = :status', { status: filters.status });
    if (filters.skill)
      qb.andWhere('m.skill = :skill', { skill: filters.skill });
    if (filters.questionType) {
      const qt =
        normalizeQuestionType(filters.questionType) ?? filters.questionType;
      qb.andWhere('(m.question_type = :qt OR m.mistake_type = :qt)', { qt });
    }
    if (filters.attemptId)
      qb.andWhere('m.attempt_id = :attemptId', {
        attemptId: filters.attemptId,
      });
    if (filters.dueOnly)
      qb.andWhere(
        "m.status <> 'fixed' AND (m.next_review_at IS NULL OR m.next_review_at <= now())",
      );
    return qb.orderBy('m.created_at', 'DESC').limit(500).getMany();
  }

  async updateMistakeStatus(
    id: string,
    learnerId: string,
    status: MistakeStatus,
  ): Promise<LearnerMistake> {
    const m = await this.mistakeRepo.findOne({ where: { id } });
    if (!m) throw new NotFoundException('Mistake not found');
    if (m.learnerId !== learnerId)
      throw new ForbiddenException('Not your mistake');
    m.status = status;
    m.updatedAt = new Date();
    if (status === 'fixed') m.lastReviewedAt = new Date();
    return this.mistakeRepo.save(m);
  }

  /**
   * Spaced-repetition step after a drill answer. Correct twice in a row → fixed;
   * interval grows ×ease (SM-2 light). Wrong → back to new, review tomorrow.
   */
  async reviewMistake(
    learnerId: string,
    questionId: string,
    correct: boolean,
  ): Promise<LearnerMistake | null> {
    const rows = await this.mistakeRepo.find({
      where: { learnerId, questionId },
      order: { createdAt: 'DESC' },
    });
    if (rows.length === 0) return null;
    const now = new Date();
    for (const m of rows) {
      m.reviewCount += 1;
      m.lastReviewedAt = now;
      m.updatedAt = now;
      if (correct) {
        const consecutive = m.status === 'reviewing' ? 2 : 1;
        m.srsIntervalDays = Math.max(
          1,
          Math.round(m.srsIntervalDays * (m.status === 'new' ? 1 : m.srsEase)),
        );
        if (m.status === 'new') m.srsIntervalDays = 2;
        m.status = consecutive >= 2 ? 'fixed' : 'reviewing';
        m.nextReviewAt = new Date(
          now.getTime() + m.srsIntervalDays * 86_400_000,
        );
      } else {
        m.status = 'new';
        m.srsIntervalDays = 1;
        m.srsEase = Math.max(1.3, Number(m.srsEase) - 0.2);
        m.nextReviewAt = new Date(now.getTime() + 86_400_000);
      }
    }
    await this.mistakeRepo.save(rows);
    return rows[0];
  }

  /** Counts per error cause / question type, optionally for one attempt — feeds "mẫu hình lỗi". */
  async mistakeSummary(learnerId: string, attemptId?: string) {
    const params: unknown[] = [learnerId];
    let where = 'learner_id = $1';
    if (attemptId) {
      params.push(attemptId);
      where += ' AND attempt_id = $2';
    }
    const [byCause, byType, statusRows] = await Promise.all([
      this.mistakeRepo.query(
        `SELECT COALESCE(error_cause,'unknown') AS k, COUNT(*)::int AS n FROM learner_mistakes WHERE ${where} GROUP BY 1 ORDER BY n DESC`,
        params,
      ),
      this.mistakeRepo.query(
        `SELECT COALESCE(question_type, mistake_type, 'unknown') AS k, COUNT(*)::int AS n FROM learner_mistakes WHERE ${where} GROUP BY 1 ORDER BY n DESC`,
        params,
      ),
      this.mistakeRepo.query(
        `SELECT status AS k, COUNT(*)::int AS n FROM learner_mistakes WHERE ${where} GROUP BY 1`,
        params,
      ),
    ]);
    const toRec = (rows: Array<{ k: string; n: number }>) =>
      Object.fromEntries(rows.map((r) => [r.k, Number(r.n)]));
    const total = byCause.reduce(
      (a: number, r: { n: number }) => a + Number(r.n),
      0,
    );
    return {
      total,
      byCause: toRec(byCause),
      byQuestionType: toRec(byType),
      byStatus: toRec(statusRows),
    };
  }

  // ─── Explanation cache ────────────────────────────────────────────────────────

  async findExplanation(
    questionId: string,
    userAnswer: string | null | undefined,
  ): Promise<QuestionExplanation | null> {
    const key = normalizeAnswerKey(userAnswer);
    const specific = await this.explanationRepo.findOne({
      where: { questionId, userAnswerNorm: key },
    });
    if (specific || key === '') return specific;
    return this.explanationRepo.findOne({
      where: { questionId, userAnswerNorm: '' },
    });
  }

  async upsertExplanation(
    dto: UpsertExplanationDto,
  ): Promise<QuestionExplanation> {
    const key = normalizeAnswerKey(dto.userAnswer);
    const existing = await this.explanationRepo.findOne({
      where: { questionId: dto.questionId, userAnswerNorm: key },
    });
    // Teacher/author text always wins over AI; AI never overwrites a human-written row.
    if (existing && existing.source !== 'ai' && (dto.source ?? 'ai') === 'ai')
      return existing;
    const row =
      existing ??
      this.explanationRepo.create({
        questionId: dto.questionId,
        userAnswerNorm: key,
      });
    row.errorCause = (dto.errorCause ?? null) as ErrorCause | null;
    row.evidenceQuote = dto.evidenceQuote?.trim() || null;
    row.explanationVi = dto.explanationVi.trim();
    row.tipVi = dto.tipVi?.trim() || null;
    row.model = dto.model ?? null;
    row.source = dto.source ?? 'ai';
    return this.explanationRepo.save(row);
  }

  async voteExplanation(
    id: string,
    helpful: boolean,
  ): Promise<QuestionExplanation> {
    const row = await this.explanationRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Explanation not found');
    if (helpful) row.helpfulVotes += 1;
    else row.unhelpfulVotes += 1;
    return this.explanationRepo.save(row);
  }

  // ─── Learner Goals ────────────────────────────────────────────────────────────

  async getGoals(learnerId: string): Promise<LearnerGoalsView | null> {
    const goal = await this.goalRepo.findOne({ where: { learnerId } });
    if (!goal) return null;
    return this.buildGoalsView(goal, await this.getBandProfiles(learnerId));
  }

  /**
   * Creates or replaces the learner's goals. Also pushes the effective per-skill
   * targets into `learner_band_profiles.target_band` so every existing report
   * (dashboard, analysis, AI coach context) shows the learner's real target
   * instead of the synthetic "current + 0.5".
   */
  async upsertGoals(
    learnerId: string,
    dto: UpsertLearnerGoalsDto,
  ): Promise<LearnerGoalsView> {
    const today = todayIsoDate();
    let examDate: string | null = null;
    if (dto.examDate) {
      if (!isValidIsoDate(dto.examDate))
        throw new BadRequestException('examDate is not a valid calendar date');
      if (daysBetweenIso(today, dto.examDate) < 0)
        throw new BadRequestException(
          'examDate must be today or in the future',
        );
      if (daysBetweenIso(today, dto.examDate) > 730)
        throw new BadRequestException(
          'examDate must be within the next 2 years',
        );
      examDate = dto.examDate;
    }
    for (const skill of GOAL_SKILLS) {
      const v = dto[
        `target${skill[0].toUpperCase()}${skill.slice(1)}` as keyof UpsertLearnerGoalsDto
      ] as number | null | undefined;
      if (v != null && Math.abs(v - dto.targetOverall) > 2) {
        throw new BadRequestException(
          `target for ${skill} is more than 2 bands away from the overall target`,
        );
      }
    }

    const existing = await this.goalRepo.findOne({ where: { learnerId } });
    const goal = existing ?? this.goalRepo.create({ learnerId });
    goal.targetOverall = dto.targetOverall;
    goal.targetListening = dto.targetListening ?? null;
    goal.targetReading = dto.targetReading ?? null;
    goal.targetWriting = dto.targetWriting ?? null;
    goal.targetSpeaking = dto.targetSpeaking ?? null;
    goal.examDate = examDate;
    goal.minutesPerDay = dto.minutesPerDay;
    goal.daysPerWeek = dto.daysPerWeek;
    goal.purpose = dto.purpose ?? null;
    goal.updatedAt = new Date();
    const saved = await this.goalRepo.save(goal);

    const effective = this.effectiveTargets(saved);
    for (const skill of GOAL_SKILLS) {
      await this.upsertBandProfile({
        learnerId,
        skill,
        targetBand: effective[skill].target,
      });
    }
    await this.upsertBandProfile({
      learnerId,
      skill: 'overall',
      targetBand: saved.targetOverall,
    });

    return this.buildGoalsView(saved, await this.getBandProfiles(learnerId));
  }

  private effectiveTargets(
    goal: LearnerGoal,
  ): Record<GoalSkill, { target: number; explicit: boolean }> {
    return {
      listening: {
        target: goal.targetListening ?? goal.targetOverall,
        explicit: goal.targetListening != null,
      },
      reading: {
        target: goal.targetReading ?? goal.targetOverall,
        explicit: goal.targetReading != null,
      },
      writing: {
        target: goal.targetWriting ?? goal.targetOverall,
        explicit: goal.targetWriting != null,
      },
      speaking: {
        target: goal.targetSpeaking ?? goal.targetOverall,
        explicit: goal.targetSpeaking != null,
      },
    };
  }

  private buildGoalsView(
    goal: LearnerGoal,
    profiles: LearnerBandProfile[],
  ): LearnerGoalsView {
    const effective = this.effectiveTargets(goal);
    const targets = {} as LearnerGoalsView['targets'];
    for (const skill of GOAL_SKILLS) {
      const profile = profiles.find((p) => p.skill === skill);
      const current =
        profile?.currentBand != null ? Number(profile.currentBand) : null;
      targets[skill] = {
        ...effective[skill],
        current,
        gap:
          current == null
            ? null
            : Number((effective[skill].target - current).toFixed(1)),
      };
    }
    const daysLeft = goal.examDate
      ? Math.max(0, daysBetweenIso(todayIsoDate(), goal.examDate))
      : null;
    return {
      learnerId: goal.learnerId,
      targetOverall: goal.targetOverall,
      targets,
      examDate: goal.examDate,
      daysLeft,
      weeksLeft: daysLeft == null ? null : Math.ceil(daysLeft / 7),
      minutesPerDay: goal.minutesPerDay,
      daysPerWeek: goal.daysPerWeek,
      weeklyMinutes: goal.minutesPerDay * goal.daysPerWeek,
      purpose: goal.purpose,
      updatedAt: goal.updatedAt,
    };
  }

  // ─── Band Profiles ────────────────────────────────────────────────────────────

  async getBandProfiles(learnerId: string): Promise<LearnerBandProfile[]> {
    return this.bandProfileRepo.find({
      where: { learnerId },
      order: { skill: 'ASC' },
    });
  }

  async upsertBandProfile(
    dto: UpsertBandProfileDto,
  ): Promise<LearnerBandProfile> {
    let profile = await this.bandProfileRepo.findOne({
      where: { learnerId: dto.learnerId, skill: dto.skill as any },
    });

    if (profile) {
      if (dto.currentBand !== undefined) profile.currentBand = dto.currentBand;
      if (dto.targetBand !== undefined) profile.targetBand = dto.targetBand;
      profile.assessedAt = new Date();
    } else {
      profile = this.bandProfileRepo.create({
        learnerId: dto.learnerId,
        skill: dto.skill as any,
        currentBand: dto.currentBand,
        targetBand: dto.targetBand,
        assessedAt: new Date(),
      });
    }

    return this.bandProfileRepo.save(profile);
  }

  // ─── Progress Snapshots ───────────────────────────────────────────────────────

  async getProgressSnapshots(
    learnerId: string,
  ): Promise<LearnerProgressSnapshot[]> {
    return this.snapshotRepo.find({
      where: { learnerId },
      order: { snapshotAt: 'ASC' },
    });
  }

  async createSnapshot(
    dto: CreateSnapshotDto,
  ): Promise<LearnerProgressSnapshot> {
    const snapshot = this.snapshotRepo.create({
      learnerId: dto.learnerId,
      overallBand: dto.overallBand,
      snapshotAt: new Date(),
    });
    return this.snapshotRepo.save(snapshot);
  }

  // ─── Mistakes ─────────────────────────────────────────────────────────────────

  async getMistakes(learnerId: string): Promise<LearnerMistake[]> {
    return this.mistakeRepo.find({
      where: { learnerId },
      order: { createdAt: 'DESC' },
    });
  }

  async recordMistake(dto: CreateMistakeDto): Promise<LearnerMistake> {
    const questionType =
      normalizeQuestionType(dto.questionType ?? dto.mistakeType) ??
      dto.questionType ??
      null;
    const errorCause: ErrorCause =
      dto.errorCause ??
      classifyErrorCause({
        questionType,
        userAnswer: dto.userAnswer,
        correctAnswers: dto.correctAnswers ?? [],
        instructions: dto.instructions,
        trailingSkipped: dto.trailingSkipped,
      });
    const existing = dto.attemptId
      ? await this.mistakeRepo.findOne({
          where: { attemptId: dto.attemptId, questionId: dto.questionId },
        })
      : null;
    const mistake =
      existing ??
      this.mistakeRepo.create({
        learnerId: dto.learnerId,
        questionId: dto.questionId,
        createdAt: new Date(),
        status: 'new',
        nextReviewAt: new Date(Date.now() + 86_400_000),
      });
    mistake.mistakeType = dto.mistakeType ?? questionType ?? 'wrong_answer';
    mistake.attemptId = dto.attemptId ?? mistake.attemptId ?? null;
    mistake.skill = dto.skill ?? mistake.skill ?? null;
    mistake.questionType = questionType;
    mistake.errorCause = errorCause;
    mistake.userAnswer = dto.userAnswer ?? null;
    mistake.correctAnswer = dto.correctAnswers?.[0] ?? null;
    mistake.updatedAt = new Date();
    return this.mistakeRepo.save(mistake);
  }

  // ─── Full sync ────────────────────────────────────────────────────────────────

  async fullSyncLearnerAnalytics(learnerId: string): Promise<{
    bandProfiles: number;
    snapshots: number;
    mistakes: number;
  }> {
    const db = this.dataSource;

    await db.query(`DELETE FROM learner_band_profiles  WHERE learner_id = $1`, [
      learnerId,
    ]);
    await db.query(
      `DELETE FROM learner_progress_snapshots WHERE learner_id = $1`,
      [learnerId],
    );
    await db.query(
      `DELETE FROM learner_mistakes WHERE learner_id = $1 AND attempt_id IS NULL`,
      [learnerId],
    );

    const skillRows: Array<{ skill: string; avg_band: string }> =
      await db.query(
        `
            SELECT t.skill, AVG(ta.band_score)::float AS avg_band
            FROM   test_attempts ta
            INNER  JOIN tests t ON t.id = ta.test_id
            WHERE  ta.learner_id = $1
              AND  ta.submitted_at IS NOT NULL
              AND  ta.band_score   IS NOT NULL
            GROUP  BY t.skill
            `,
        [learnerId],
      );

    let bandProfilesInserted = 0;
    const skillBands: number[] = [];

    for (const row of skillRows) {
      const band = Number(Number(row.avg_band ?? 0).toFixed(1));
      if (!band) continue;
      skillBands.push(band);
      await this.upsertBandProfile({
        learnerId,
        skill: row.skill,
        currentBand: band,
      });
      bandProfilesInserted++;
    }

    if (skillBands.length > 0) {
      const overallBand = Number(
        (skillBands.reduce((s, b) => s + b, 0) / skillBands.length).toFixed(1),
      );
      await this.upsertBandProfile({
        learnerId,
        skill: 'overall',
        currentBand: overallBand,
      });
      bandProfilesInserted++;
    }

    const attemptRows: Array<{ submitted_at: Date; band_score: string }> =
      await db.query(
        `
            SELECT ta.submitted_at, ta.band_score
            FROM   test_attempts ta
            WHERE  ta.learner_id  = $1
              AND  ta.submitted_at IS NOT NULL
              AND  ta.band_score   IS NOT NULL
            ORDER  BY ta.submitted_at ASC
            `,
        [learnerId],
      );

    let snapshotsInserted = 0;
    const bandAccum: number[] = [];

    for (const row of attemptRows) {
      bandAccum.push(Number(row.band_score));
      const runningAvg = Number(
        (bandAccum.reduce((s, b) => s + b, 0) / bandAccum.length).toFixed(1),
      );
      const snap = this.snapshotRepo.create({
        learnerId,
        overallBand: runningAvg,
        snapshotAt: new Date(row.submitted_at),
      });
      await this.snapshotRepo.save(snap);
      snapshotsInserted++;
    }

    const wrongRows: Array<{ question_id: string; question_type: string }> =
      await db.query(
        `
            SELECT qa.question_id, q.question_type, ta.id AS attempt_id, qa.answer AS user_answer,
                   t.skill, ans.correct_answers, g.instructions
            FROM   question_attempts qa
            INNER  JOIN test_attempts ta ON ta.id  = qa.test_attempt_id
            INNER  JOIN questions      q  ON q.id  = qa.question_id
            LEFT   JOIN question_groups g ON g.id = q.question_group_id
            LEFT   JOIN question_answers ans ON ans.question_id = q.id
            LEFT   JOIN tests t ON t.id = ta.test_id
            WHERE  ta.learner_id   = $1
              AND  ta.submitted_at IS NOT NULL
              AND  qa.is_correct   = false
              AND  NOT EXISTS (SELECT 1 FROM learner_mistakes lm WHERE lm.attempt_id = ta.id AND lm.question_id = qa.question_id)
            `,
        [learnerId],
      );

    let mistakesInserted = 0;
    for (const row of wrongRows as Array<Record<string, any>>) {
      await this.recordMistake({
        learnerId,
        questionId: row.question_id,
        mistakeType: row.question_type ?? 'wrong_answer',
        attemptId: row.attempt_id,
        skill: row.skill ?? null,
        questionType: row.question_type ?? null,
        userAnswer: row.user_answer ?? '',
        correctAnswers: Array.isArray(row.correct_answers)
          ? row.correct_answers
          : [],
        instructions: row.instructions ?? null,
      });
      mistakesInserted++;
    }

    this.logger.log(
      `Sync done for learner ${learnerId}: ` +
        `${bandProfilesInserted} band profiles, ${snapshotsInserted} snapshots, ${mistakesInserted} mistakes`,
    );

    return {
      bandProfiles: bandProfilesInserted,
      snapshots: snapshotsInserted,
      mistakes: mistakesInserted,
    };
  }

  async syncAllLearnersAnalytics(): Promise<{
    synced: number;
    results: Array<{
      learnerId: string;
      bandProfiles: number;
      snapshots: number;
      mistakes: number;
    }>;
  }> {
    const learnerRows: Array<{ learner_id: string }> =
      await this.dataSource.query(
        `
            SELECT DISTINCT ta.learner_id
            FROM   test_attempts ta
            WHERE  ta.submitted_at IS NOT NULL
              AND  ta.band_score   IS NOT NULL
            `,
      );

    const results: Array<{
      learnerId: string;
      bandProfiles: number;
      snapshots: number;
      mistakes: number;
    }> = [];

    for (const { learner_id } of learnerRows) {
      try {
        const counts = await this.fullSyncLearnerAnalytics(learner_id);
        results.push({ learnerId: learner_id, ...counts });
      } catch (err) {
        this.logger.warn(
          `Sync failed for learner ${learner_id}: ${String(err)}`,
        );
      }
    }

    return { synced: results.length, results };
  }

  // ─── Dashboard Summary ────────────────────────────────────────────────────────

  private async backfillIfEmpty(learnerId: string): Promise<void> {
    const profileCount = await this.bandProfileRepo.count({
      where: { learnerId },
    });
    const snapshotCount = await this.snapshotRepo.count({
      where: { learnerId },
    });
    if (profileCount === 0 || snapshotCount === 0) {
      await this.fullSyncLearnerAnalytics(learnerId);
    }
  }

  private async getAttemptStats(learnerId: string): Promise<{
    totalAttempts: number;
    averageBand: number;
    practiceHours: number;
  }> {
    const rows = await this.snapshotRepo.query(
      `
            SELECT
                COUNT(*)::int AS total_attempts,
                COALESCE(AVG(ta.band_score), 0)::float AS average_band,
                COALESCE(
                    SUM(
                        EXTRACT(
                            EPOCH FROM (
                                COALESCE(ta.submitted_at, ta.started_at) - ta.started_at
                            )
                        )
                    ) / 3600,
                    0
                )::float AS practice_hours
            FROM test_attempts ta
            WHERE ta.learner_id = $1
            `,
      [learnerId],
    );

    const row = rows?.[0] ?? {};
    return {
      totalAttempts: Number(row.total_attempts ?? 0),
      averageBand: Number(row.average_band ?? 0),
      practiceHours: Math.max(0, Number(row.practice_hours ?? 0)),
    };
  }

  private async getQuestionTypeMastery(
    learnerId: string,
  ): Promise<QuestionTypeMastery[]> {
    const rows = await this.snapshotRepo.query(
      `
            SELECT
                q.question_type AS question_type,
                COUNT(*)::int AS total,
                SUM(CASE WHEN qa.is_correct = true THEN 1 ELSE 0 END)::int AS correct
            FROM question_attempts qa
            INNER JOIN test_attempts ta ON ta.id = qa.test_attempt_id
            INNER JOIN questions q ON q.id = qa.question_id
            WHERE ta.learner_id = $1
              AND ta.submitted_at IS NOT NULL
              AND qa.is_correct IS NOT NULL
            GROUP BY q.question_type
            ORDER BY total DESC
            `,
      [learnerId],
    );

    // Legacy rows may still carry non-canonical spellings; merge them into one bucket.
    const merged = new Map<string, { total: number; correct: number }>();
    for (const row of rows ?? []) {
      const key =
        normalizeQuestionType(row.question_type) ??
        String(row.question_type ?? 'unknown');
      const acc = merged.get(key) ?? { total: 0, correct: 0 };
      acc.total += Number(row.total ?? 0);
      acc.correct += Number(row.correct ?? 0);
      merged.set(key, acc);
    }
    return [...merged.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([question_type, agg]) => {
        const row = { question_type, ...agg };
        const total = Number(row.total ?? 0);
        const correct = Number(row.correct ?? 0);
        const accuracy =
          total > 0 ? Number(((correct / total) * 100).toFixed(1)) : 0;
        const masteryLevel: QuestionTypeMastery['masteryLevel'] =
          accuracy >= 85
            ? 'advanced'
            : accuracy >= 70
              ? 'proficient'
              : accuracy >= 50
                ? 'developing'
                : 'beginner';
        return {
          questionType: String(row.question_type ?? 'unknown'),
          total,
          correct,
          accuracy,
          masteryLevel,
        };
      });
  }

  private buildAdaptiveStudyPlan(
    bandProfiles: LearnerBandProfile[],
    mastery: QuestionTypeMastery[],
  ): StudyPlanTask[] {
    const tasks: StudyPlanTask[] = [];
    const sortedSkills = [...bandProfiles]
      .filter((p) => p.skill !== 'overall')
      .sort((a, b) => Number(a.currentBand ?? 0) - Number(b.currentBand ?? 0));

    for (const profile of sortedSkills.slice(0, 2)) {
      const current = Number(profile.currentBand ?? 0);
      const target = Number(profile.targetBand ?? Math.min(9, current + 0.5));
      tasks.push({
        title: `${profile.skill} band boost`,
        focusArea: profile.skill,
        priority: 'high',
        dueInDays: 7,
        recommendation: `Run 3 focused ${profile.skill} sessions this week and move from band ${current.toFixed(1)} toward ${target.toFixed(1)}.`,
      });
    }

    const weakestQuestionTypes = mastery
      .filter((m) => m.total >= 3)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 3);

    for (const weak of weakestQuestionTypes) {
      tasks.push({
        title: `Improve ${weak.questionType}`,
        focusArea: weak.questionType,
        priority: weak.accuracy < 50 ? 'high' : 'medium',
        dueInDays: weak.accuracy < 50 ? 5 : 10,
        recommendation: `Current accuracy ${weak.accuracy}%. Complete 2 drills/day and review mistakes before the next full test.`,
      });
    }

    if (tasks.length === 0) {
      tasks.push({
        title: 'Build consistency',
        focusArea: 'overall',
        priority: 'medium',
        dueInDays: 7,
        recommendation:
          'Take at least 2 timed practice tests this week and review all wrong answers.',
      });
    }

    return tasks;
  }

  private async getRubricBreakdown(learnerId: string): Promise<{
    writing: null | {
      submissionId: string;
      submittedAt: string;
      overallBand: number | null;
      criteria: Array<{
        criterion: string;
        band: number;
        feedback: string | null;
      }>;
    };
    speaking: null | {
      submissionId: string;
      submittedAt: string;
      overallBand: number | null;
      criteria: Array<{
        criterion: string;
        band: number;
        feedback: string | null;
      }>;
    };
  }> {
    const writingRows = await this.snapshotRepo.query(
      `
            SELECT
                wsub.id AS submission_id,
                wsub.submitted_at,
                wsub.overall_band,
                ws.criterion,
                ws.band,
                ws.feedback
            FROM writing_submissions wsub
            INNER JOIN writing_scores ws ON ws.submission_id = wsub.id
            WHERE wsub.learner_id = $1
              AND wsub.submitted_at = (
                  SELECT MAX(submitted_at)
                  FROM writing_submissions
                  WHERE learner_id = $1
              )
            ORDER BY ws.criterion ASC
            `,
      [learnerId],
    );

    const speakingRows = await this.snapshotRepo.query(
      `
            SELECT
                ssub.id AS submission_id,
                ssub.submitted_at,
                ssub.overall_band,
                ss.criterion,
                ss.band,
                ss.feedback
            FROM speaking_submissions ssub
            INNER JOIN speaking_scores ss ON ss.submission_id = ssub.id
            WHERE ssub.learner_id = $1
              AND ssub.submitted_at = (
                  SELECT MAX(submitted_at)
                  FROM speaking_submissions
                  WHERE learner_id = $1
              )
            ORDER BY ss.criterion ASC
            `,
      [learnerId],
    );

    const writing = writingRows.length
      ? {
          submissionId: String(writingRows[0].submission_id),
          submittedAt: new Date(writingRows[0].submitted_at).toISOString(),
          overallBand:
            writingRows[0].overall_band != null
              ? Number(writingRows[0].overall_band)
              : null,
          criteria: writingRows.map((row: any) => ({
            criterion: String(row.criterion),
            band: Number(row.band),
            feedback: row.feedback ? String(row.feedback) : null,
          })),
        }
      : null;

    const speaking = speakingRows.length
      ? {
          submissionId: String(speakingRows[0].submission_id),
          submittedAt: new Date(speakingRows[0].submitted_at).toISOString(),
          overallBand:
            speakingRows[0].overall_band != null
              ? Number(speakingRows[0].overall_band)
              : null,
          criteria: speakingRows.map((row: any) => ({
            criterion: String(row.criterion),
            band: Number(row.band),
            feedback: row.feedback ? String(row.feedback) : null,
          })),
        }
      : null;

    return { writing, speaking };
  }

  async getDashboardSummary(learnerId: string) {
    await this.backfillIfEmpty(learnerId);

    const [
      bandProfiles,
      snapshots,
      mistakes,
      attemptStats,
      mastery,
      rubricBreakdown,
    ] = await Promise.all([
      this.getBandProfiles(learnerId),
      this.getProgressSnapshots(learnerId),
      this.getMistakes(learnerId),
      this.getAttemptStats(learnerId),
      this.getQuestionTypeMastery(learnerId),
      this.getRubricBreakdown(learnerId),
    ]);

    const latestSnapshot = snapshots[snapshots.length - 1];
    const mistakesByType = mistakes.reduce(
      (acc, m) => {
        const type = m.mistakeType || 'unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const adaptiveStudyPlan = this.buildAdaptiveStudyPlan(
      bandProfiles,
      mastery,
    );
    const avgBand = Number(attemptStats.averageBand ?? 0);
    const examReadiness = Math.max(
      0,
      Math.min(100, Math.round((avgBand / 9) * 100)),
    );

    return {
      bandProfiles,
      latestOverallBand: latestSnapshot?.overallBand ?? null,
      progressHistory: snapshots,
      totalMistakes: mistakes.length,
      mistakesByType,
      totalAttempts: attemptStats.totalAttempts,
      averageBand: avgBand,
      practiceHours: Number(attemptStats.practiceHours.toFixed(1)),
      examReadiness,
      questionTypeMastery: mastery,
      adaptiveStudyPlan,
      rubricBreakdown,
    };
  }

  // ─── Leaderboard ──────────────────────────────────────────────────────────────

  /**
   * Ranks learners by average band over their submitted attempts (ties broken by
   * attempt count). Emails are masked — only the learner's display name is shown.
   */
  async getLeaderboard(limit: number, meLearnerId: string | null) {
    const rows: Array<{
      learner_id: string;
      full_name: string | null;
      email: string;
      avatar_url: string | null;
      avg_band: number;
      best_band: number;
      total_attempts: number;
    }> = await this.dataSource.query(
      `
            SELECT lp.id AS learner_id,
                   a.full_name,
                   a.email,
                   a.avatar_url,
                   ROUND(AVG(ta.band_score)::numeric, 1)::float AS avg_band,
                   MAX(ta.band_score)::float AS best_band,
                   COUNT(ta.id)::int AS total_attempts
            FROM test_attempts ta
            JOIN learner_profiles lp ON lp.id = ta.learner_id
            JOIN accounts a ON a.id = lp.account_id
            WHERE ta.submitted_at IS NOT NULL
              AND ta.band_score IS NOT NULL
              AND a.status = 'active'
            GROUP BY lp.id, a.full_name, a.email, a.avatar_url
            ORDER BY avg_band DESC, total_attempts DESC, lp.id
            LIMIT $1
            `,
      [limit],
    );

    return rows.map((r, i) => ({
      rank: i + 1,
      learnerId: r.learner_id,
      displayName: r.full_name?.trim() || this.maskEmail(r.email),
      avatarUrl: r.avatar_url,
      avgBand: Number(r.avg_band),
      bestBand: Number(r.best_band),
      totalAttempts: Number(r.total_attempts),
      isMe: meLearnerId !== null && r.learner_id === meLearnerId,
    }));
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return 'Learner';
    const visible = local.slice(0, 2);
    return `${visible}${'*'.repeat(Math.max(2, local.length - 2))}@${domain}`;
  }

  // ─── Admin Global Stats ───────────────────────────────────────────────────────

  async getAdminGlobalStats(): Promise<{
    totalLearners: number;
    totalAttempts: number;
    completedAttempts: number;
    averageBand: number;
    attemptsPerDay: Array<{ date: string; count: number }>;
    bandDistribution: Array<{ range: string; count: number; color: string }>;
    skillBreakdown: Array<{
      skill: string;
      avgBand: number;
      totalAttempts: number;
    }>;
    topLearners: Array<{
      learnerId: string;
      email: string;
      avgBand: number;
      totalAttempts: number;
    }>;
    recentActivity: Array<{
      email: string;
      testTitle: string;
      bandScore: number | null;
      submittedAt: string;
    }>;
  }> {
    const db = this.dataSource;

    // Total learners
    const [learnerCountRow] = await db.query(
      `SELECT COUNT(*)::int AS cnt FROM learner_profiles`,
    );
    const totalLearners = Number(learnerCountRow?.cnt ?? 0);

    // Total & completed attempts + avg band
    const [attemptsRow] = await db.query(`
            SELECT
                COUNT(*)::int AS total,
                COUNT(submitted_at)::int AS completed,
                COALESCE(AVG(band_score) FILTER (WHERE band_score IS NOT NULL), 0)::float AS avg_band
            FROM test_attempts
        `);
    const totalAttempts = Number(attemptsRow?.total ?? 0);
    const completedAttempts = Number(attemptsRow?.completed ?? 0);
    const averageBand = Number(Number(attemptsRow?.avg_band ?? 0).toFixed(2));

    // Attempts per day — last 30 days
    const attemptsPerDayRows: Array<{ day: string; cnt: string }> =
      await db.query(`
            SELECT
                TO_CHAR(started_at::date, 'YYYY-MM-DD') AS day,
                COUNT(*)::int AS cnt
            FROM test_attempts
            WHERE started_at >= NOW() - INTERVAL '30 days'
            GROUP BY day
            ORDER BY day ASC
        `);
    const attemptsPerDay = attemptsPerDayRows.map((r) => ({
      date: r.day,
      count: Number(r.cnt),
    }));

    // Band distribution buckets
    const bandDistRows: Array<{ bucket: string; cnt: string }> =
      await db.query(`
            SELECT
                CASE
                    WHEN band_score < 4   THEN '0–4'
                    WHEN band_score < 5.5 THEN '4–5.5'
                    WHEN band_score < 6.5 THEN '5.5–6.5'
                    WHEN band_score < 7.5 THEN '6.5–7.5'
                    ELSE '7.5–9'
                END AS bucket,
                COUNT(*)::int AS cnt
            FROM test_attempts
            WHERE band_score IS NOT NULL
              AND submitted_at IS NOT NULL
            GROUP BY bucket
            ORDER BY MIN(band_score)
        `);
    const bucketColors: Record<string, string> = {
      '0–4': '#f87171',
      '4–5.5': '#fb923c',
      '5.5–6.5': '#facc15',
      '6.5–7.5': '#4ade80',
      '7.5–9': '#34d399',
    };
    const bandDistribution = bandDistRows.map((r) => ({
      range: r.bucket,
      count: Number(r.cnt),
      color: bucketColors[r.bucket] ?? '#94a3b8',
    }));

    // Skill breakdown
    const skillRows: Array<{ skill: string; avg_band: string; total: string }> =
      await db.query(`
            SELECT
                t.skill,
                COALESCE(AVG(ta.band_score), 0)::float AS avg_band,
                COUNT(*)::int AS total
            FROM test_attempts ta
            INNER JOIN tests t ON t.id = ta.test_id
            WHERE ta.submitted_at IS NOT NULL
              AND ta.band_score IS NOT NULL
            GROUP BY t.skill
            ORDER BY t.skill
        `);
    const skillBreakdown = skillRows.map((r) => ({
      skill: r.skill,
      avgBand: Number(Number(r.avg_band).toFixed(2)),
      totalAttempts: Number(r.total),
    }));

    // Top 5 learners by avg band (min 1 completed attempt)
    const topLearnerRows: Array<{
      learner_id: string;
      email: string;
      avg_band: string;
      total: string;
    }> = await db.query(`
            SELECT
                ta.learner_id,
                a.email,
                AVG(ta.band_score)::float AS avg_band,
                COUNT(*)::int AS total
            FROM test_attempts ta
            INNER JOIN learner_profiles lp ON lp.id = ta.learner_id
            INNER JOIN accounts a ON a.id = lp.account_id
            WHERE ta.submitted_at IS NOT NULL
              AND ta.band_score IS NOT NULL
            GROUP BY ta.learner_id, a.email
            HAVING COUNT(*) >= 1
            ORDER BY avg_band DESC
            LIMIT 5
        `);
    const topLearners = topLearnerRows.map((r) => ({
      learnerId: r.learner_id,
      email: r.email,
      avgBand: Number(Number(r.avg_band).toFixed(2)),
      totalAttempts: Number(r.total),
    }));

    // Recent 10 submissions
    const recentRows: Array<{
      email: string;
      title: string;
      band_score: string | null;
      submitted_at: string;
    }> = await db.query(`
            SELECT
                a.email,
                t.title,
                ta.band_score,
                ta.submitted_at
            FROM test_attempts ta
            INNER JOIN tests t ON t.id = ta.test_id
            INNER JOIN learner_profiles lp ON lp.id = ta.learner_id
            INNER JOIN accounts a ON a.id = lp.account_id
            WHERE ta.submitted_at IS NOT NULL
            ORDER BY ta.submitted_at DESC
            LIMIT 10
        `);
    const recentActivity = recentRows.map((r) => ({
      email: r.email,
      testTitle: r.title,
      bandScore: r.band_score != null ? Number(r.band_score) : null,
      submittedAt: new Date(r.submitted_at).toISOString(),
    }));

    return {
      totalLearners,
      totalAttempts,
      completedAttempts,
      averageBand,
      attemptsPerDay,
      bandDistribution,
      skillBreakdown,
      topLearners,
      recentActivity,
    };
  }
}
