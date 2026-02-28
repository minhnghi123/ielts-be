import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Test } from './test.entity';
import { QuestionGroup } from './question-group.entity';

@Entity('sections')
export class Section {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'test_id' })
  testId: string;

  @ManyToOne(() => Test, (test) => test.sections, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'test_id' })
  test: Test;

  @Column({ name: 'section_order' })
  sectionOrder: number;

  @Column({ type: 'text', nullable: true })
  passage: string;

  @Column({ name: 'audio_url', type: 'text', nullable: true })
  audioUrl: string;

  @Column({ name: 'time_limit', nullable: true })
  timeLimit: number;

  @OneToMany(() => QuestionGroup, (questionGroup) => questionGroup.section, {
    cascade: true,
  })
  questionGroups: QuestionGroup[];
}
