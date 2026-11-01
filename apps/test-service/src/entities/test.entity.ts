import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Section } from './section.entity';
import { WritingTask } from './writing-task.entity';
import { SpeakingPart } from './speaking-part.entity';

export type Skill = 'reading' | 'listening' | 'writing' | 'speaking';
export type TestDifficulty = 'easy' | 'medium' | 'hard';
export type TestStatus = 'draft' | 'published' | 'archived';

/** Official IELTS Academic timings (minutes) used when a test has no explicit duration. */
export const SKILL_DEFAULT_DURATION_MINUTES: Record<Skill, number> = {
  listening: 30,
  reading: 60,
  writing: 60,
  speaking: 14,
};

@Entity('tests')
export class Test {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
    length: 50,
  })
  skill: Skill;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ name: 'is_mock' })
  isMock: boolean;

  @Column({ name: 'created_by' })
  createdBy: string;

  @Column({ type: 'varchar', length: 20, default: 'medium' })
  difficulty: TestDifficulty;

  @Column({ type: 'varchar', length: 20, default: 'published' })
  status: TestStatus;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Admin override of the official duration; null → SKILL_DEFAULT_DURATION_MINUTES */
  @Column({ name: 'duration_minutes', type: 'int', nullable: true })
  durationMinutes: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => Section, (section) => section.test, { cascade: true })
  sections: Section[];

  @OneToMany(() => WritingTask, (task) => task.test, { cascade: true })
  writingTasks: WritingTask[];

  @OneToMany(() => SpeakingPart, (part) => part.test, { cascade: true })
  speakingParts: SpeakingPart[];
}
