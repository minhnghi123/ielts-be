import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AssignmentMode = 'practice' | 'mock';
export type ResultPolicy = 'immediately' | 'after_due' | 'manual';
export type AssignmentStatus = 'scheduled' | 'open' | 'closed' | 'archived';

export interface TestSnapshot {
  title: string;
  skill: string;
  difficulty?: string;
  durationMinutes?: number;
  isMock?: boolean;
}

@Entity('class_assignments')
export class ClassAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'class_id', type: 'uuid' })
  classId: string;

  @Index()
  @Column({ name: 'test_id', type: 'uuid' })
  testId: string;

  @Column({ name: 'test_snapshot', type: 'jsonb', default: () => "'{}'" })
  testSnapshot: TestSnapshot;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'text', nullable: true })
  instructions: string | null;

  @Column({ type: 'varchar', length: 10, default: 'mock' })
  mode: AssignmentMode;

  @Column({ name: 'open_at', type: 'timestamptz', nullable: true })
  openAt: Date | null;

  @Column({ name: 'due_at', type: 'timestamptz' })
  dueAt: Date;

  @Column({ name: 'close_at', type: 'timestamptz', nullable: true })
  closeAt: Date | null;

  @Column({ name: 'allow_late', default: true })
  allowLate: boolean;

  /** 0 = unlimited */
  @Column({ name: 'max_attempts', type: 'int', default: 1 })
  maxAttempts: number;

  @Column({
    name: 'result_policy',
    type: 'varchar',
    length: 15,
    default: 'immediately',
  })
  resultPolicy: ResultPolicy;

  @Column({ name: 'results_released_at', type: 'timestamptz', nullable: true })
  resultsReleasedAt: Date | null;

  /** { [learnerId]: extraSeconds } */
  @Column({ name: 'extra_time', type: 'jsonb', nullable: true })
  extraTime: Record<string, number> | null;

  /** Only 'archived' is persisted meaningfully; the rest is derived from the time window. */
  @Column({ type: 'varchar', length: 10, default: 'open' })
  status: AssignmentStatus;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
