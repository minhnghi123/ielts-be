import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { DocxParserService, ParsedTest } from './docx-parser.service';
import { Test } from '../entities/test.entity';
import { Section } from '../entities/section.entity';
import { Question } from '../entities/question.entity';
import { QuestionAnswer } from '../entities/question-answer.entity';
import { WritingTask } from '../entities/writing-task.entity';
import { SpeakingPart } from '../entities/speaking-part.entity';

export interface ImportTestOptions {
  adminProfileId: string;
  audioUrls?: Record<string, string>; // filename → public URL after upload
  dryRun?: boolean;
}

export interface ImportResult {
  testId?: string;
  parsed: ParsedTest;
  stats: {
    sections: number;
    questions: number;
    writingTasks: number;
    speakingParts: number;
  };
}

@Injectable()
export class ImportTestService {
  constructor(
    private readonly docxParser: DocxParserService,
    private readonly dataSource: DataSource,
    @InjectRepository(Test) private readonly testRepo: Repository<Test>,
  ) {}

  async importFromBuffer(
    buffer: Buffer,
    opts: ImportTestOptions,
  ): Promise<ImportResult> {
    const parsed = await this.docxParser.parse(buffer);

    const stats = {
      sections: parsed.sections.length,
      questions: parsed.sections.reduce(
        (acc, s) => acc + s.questions.length,
        0,
      ),
      writingTasks: parsed.writingTasks.length,
      speakingParts: parsed.speakingParts.length,
    };

    if (opts.dryRun) {
      return { parsed, stats };
    }

    // Validate
    if (!parsed.skill || !parsed.title) {
      throw new BadRequestException('DOCX must have SKILL and TITLE headers');
    }

    const testId = await this.persist(parsed, opts);
    return { testId, parsed, stats };
  }

  // ─── DB Persistence ───────────────────────────────────────────────────────

  private async persist(
    parsed: ParsedTest,
    opts: ImportTestOptions,
  ): Promise<string> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const testId = uuidv4();

      // 1. Insert test
      await queryRunner.query(
        `INSERT INTO public.tests (id, skill, title, is_mock, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          testId,
          parsed.skill,
          parsed.title,
          parsed.isMock,
          opts.adminProfileId,
        ],
      );

      // 2. Insert sections + questions
      for (const sec of parsed.sections) {
        const sectionId = uuidv4();
        const audioUrl = sec.audioFilename
          ? (opts.audioUrls?.[sec.audioFilename] ?? null)
          : null;

        await queryRunner.query(
          `INSERT INTO public.sections (id, test_id, section_order, passage, audio_url, time_limit)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            sectionId,
            testId,
            sec.sectionOrder,
            sec.passage ?? null,
            audioUrl,
            sec.timeLimit ?? null,
          ],
        );

        for (const q of sec.questions) {
          const questionId = uuidv4();
          await queryRunner.query(
            `INSERT INTO public.questions (id, section_id, question_order, question_type, question_text, config, explanation)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              questionId,
              sectionId,
              q.questionOrder,
              q.questionType,
              q.questionText,
              JSON.stringify(q.config),
              q.explanation ?? null,
            ],
          );

          await queryRunner.query(
            `INSERT INTO public.question_answers (id, question_id, correct_answers, case_sensitive)
             VALUES ($1, $2, $3, $4)`,
            [
              uuidv4(),
              questionId,
              q.answer.correctAnswers,
              q.answer.caseSensitive,
            ],
          );
        }
      }

      // 3. Insert writing tasks
      for (const wt of parsed.writingTasks) {
        await queryRunner.query(
          `INSERT INTO public.writing_tasks (id, test_id, task_number, prompt, word_limit)
           VALUES ($1, $2, $3, $4, $5)`,
          [uuidv4(), testId, wt.taskNumber, wt.prompt, wt.wordLimit],
        );
      }

      // 4. Insert speaking parts
      for (const sp of parsed.speakingParts) {
        await queryRunner.query(
          `INSERT INTO public.speaking_parts (id, test_id, part_number, prompt)
           VALUES ($1, $2, $3, $4)`,
          [uuidv4(), testId, sp.partNumber, sp.prompt],
        );
      }

      await queryRunner.commitTransaction();
      return testId;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
