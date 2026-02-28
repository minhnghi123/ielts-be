import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Test } from './test.entity';

@Entity('writing_tasks')
export class WritingTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'test_id' })
  testId: string;

  @ManyToOne(() => Test, (test) => test.writingTasks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'test_id' })
  test: Test;

  @Column({ name: 'task_number' })
  taskNumber: number;

  @Column({ type: 'text' })
  prompt: string;

  @Column({ name: 'word_limit' })
  wordLimit: number;
}
