import { randomUUID } from 'crypto';
import { BeforeInsert, Column, Entity, PrimaryColumn } from 'typeorm';
import type { ErrorCause } from '@app/common';

export type MistakeStatus = 'new' | 'reviewing' | 'fixed';

/**
 * The learner's mistake notebook: one row per wrong answer in a submitted
 * attempt, enriched with *why* it was wrong and a spaced-repetition schedule.
 */
@Entity('learner_mistakes')
export class LearnerMistake {
  @PrimaryColumn('uuid')
  id: string;

  @BeforeInsert()
  ensureId() {
    if (!this.id) this.id = randomUUID();
  }

  @Column({ name: 'learner_id' })
  learnerId: string;

  @Column({ name: 'question_id' })
  questionId: string;

  /** Legacy bucket (kept = question type). */
  @Column({ name: 'mistake_type', type: 'varchar', length: 50, nullable: true })
  mistakeType: string;

  @Column({ name: 'attempt_id', type: 'uuid', nullable: true })
  attemptId: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  skill: string | null;

  @Column({
    name: 'question_type',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  questionType: string | null;

  @Column({ name: 'error_cause', type: 'varchar', length: 40, nullable: true })
  errorCause: ErrorCause | null;

  /** Cause the learner picked themselves after seeing the result (self-explanation); automatic cause stays in error_cause. */
  @Column({ name: 'self_cause', type: 'varchar', length: 40, nullable: true })
  selfCause: ErrorCause | null;

  /** Highest hint level (1–3) used before answering in a drill; null when none. */
  @Column({ name: 'hint_level', type: 'smallint', nullable: true })
  hintLevel: number | null;

  @Column({ name: 'user_answer', type: 'text', nullable: true })
  userAnswer: string | null;

  @Column({ name: 'correct_answer', type: 'text', nullable: true })
  correctAnswer: string | null;

  @Column({ type: 'varchar', length: 12, default: 'new' })
  status: MistakeStatus;

  @Column({ name: 'srs_interval_days', type: 'int', default: 1 })
  srsIntervalDays: number;

  @Column({
    name: 'srs_ease',
    type: 'numeric',
    precision: 4,
    scale: 2,
    default: 2.5,
    transformer: {
      to: (v: number) => v,
      from: (v: string | number | null) => (v == null ? 2.5 : Number(v)),
    },
  })
  srsEase: number;

  @Column({ name: 'next_review_at', type: 'timestamptz', nullable: true })
  nextReviewAt: Date | null;

  @Column({ name: 'correct_count', type: 'int', default: 0 })
  correctCount: number;

  @Column({ name: 'lapse_count', type: 'int', default: 0 })
  lapseCount: number;

  @Column({ name: 'half_life_h', type: 'numeric', precision: 9, scale: 2, nullable: true, transformer: { to: (v: number | null) => v, from: (v: string | null) => (v == null ? null : Number(v)) } })
  halfLifeH: number | null;

  @Column({ name: 'review_count', type: 'int', default: 0 })
  reviewCount: number;

  @Column({ name: 'last_reviewed_at', type: 'timestamptz', nullable: true })
  lastReviewedAt: Date | null;

  @Column({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}
