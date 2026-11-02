import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type SubmissionStatus = 'in_progress' | 'submitted' | 'late' | 'expired';

/** Read model of a test attempt inside a class assignment (fed by test-service events). */
@Entity('assignment_submissions')
@Index(['assignmentId', 'learnerId'])
export class AssignmentSubmission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'assignment_id', type: 'uuid' })
  assignmentId: string;

  @Column({ name: 'learner_id', type: 'uuid' })
  learnerId: string;

  @Index({ unique: true })
  @Column({ name: 'attempt_id', type: 'uuid' })
  attemptId: string;

  @Column({ name: 'attempt_no', type: 'int', default: 1 })
  attemptNo: number;

  @Column({ type: 'varchar', length: 12, default: 'in_progress' })
  status: SubmissionStatus;

  @Column({ type: 'varchar', length: 20, nullable: true })
  skill: string | null;

  @Column({ name: 'raw_score', type: 'int', nullable: true })
  rawScore: number | null;

  @Column({
    name: 'ai_band',
    type: 'decimal',
    precision: 3,
    scale: 1,
    nullable: true,
  })
  aiBand: number | null;

  @Column({
    name: 'teacher_band',
    type: 'decimal',
    precision: 3,
    scale: 1,
    nullable: true,
  })
  teacherBand: number | null;

  @Column({
    name: 'final_band',
    type: 'decimal',
    precision: 3,
    scale: 1,
    nullable: true,
  })
  finalBand: number | null;

  @Column({ name: 'teacher_feedback', type: 'text', nullable: true })
  teacherFeedback: string | null;

  @Column({ name: 'teacher_rubric', type: 'jsonb', nullable: true })
  teacherRubric: Record<string, number> | null;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @Column({ name: 'graded_at', type: 'timestamptz', nullable: true })
  gradedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
