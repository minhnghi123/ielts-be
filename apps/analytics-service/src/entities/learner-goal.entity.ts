import { Column, Entity, PrimaryColumn } from 'typeorm';

export type GoalPurpose =
  | 'study_abroad'
  | 'immigration'
  | 'work'
  | 'graduation'
  | 'other';

const band = {
  to: (v: number | null | undefined) => (v == null ? null : v),
  from: (v: string | number | null) => (v == null ? null : Number(v)),
};

/**
 * What the learner is aiming for. One row per learner_profile; every
 * personalised recommendation (today's tasks, weekly plan, gap to target)
 * is derived from this row plus analytics data.
 */
@Entity('learner_goals')
export class LearnerGoal {
  @PrimaryColumn('uuid', { name: 'learner_id' })
  learnerId: string;

  @Column({
    name: 'target_overall',
    type: 'numeric',
    precision: 2,
    scale: 1,
    transformer: band,
  })
  targetOverall: number;

  @Column({
    name: 'target_listening',
    type: 'numeric',
    precision: 2,
    scale: 1,
    nullable: true,
    transformer: band,
  })
  targetListening: number | null;

  @Column({
    name: 'target_reading',
    type: 'numeric',
    precision: 2,
    scale: 1,
    nullable: true,
    transformer: band,
  })
  targetReading: number | null;

  @Column({
    name: 'target_writing',
    type: 'numeric',
    precision: 2,
    scale: 1,
    nullable: true,
    transformer: band,
  })
  targetWriting: number | null;

  @Column({
    name: 'target_speaking',
    type: 'numeric',
    precision: 2,
    scale: 1,
    nullable: true,
    transformer: band,
  })
  targetSpeaking: number | null;

  /** ISO date (YYYY-MM-DD) or null when the learner has not booked a test. */
  @Column({ name: 'exam_date', type: 'date', nullable: true })
  examDate: string | null;

  @Column({ name: 'minutes_per_day', type: 'int', default: 30 })
  minutesPerDay: number;

  @Column({ name: 'days_per_week', type: 'int', default: 5 })
  daysPerWeek: number;

  @Column({ type: 'varchar', length: 30, nullable: true })
  purpose: GoalPurpose | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}
