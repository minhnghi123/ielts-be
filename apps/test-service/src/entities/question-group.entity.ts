import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Section } from './section.entity';
import { Question } from './question.entity';

@Entity('question_groups')
export class QuestionGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'section_id' })
  sectionId: string;

  @ManyToOne(() => Section, (section) => section.questionGroups, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'section_id' })
  section: Section;

  @Column({ name: 'group_order' })
  groupOrder: number;

  @Column({ type: 'text', nullable: true })
  instructions: string;

  @OneToMany(() => Question, (question) => question.questionGroup, {
    cascade: true,
  })
  questions: Question[];
}
