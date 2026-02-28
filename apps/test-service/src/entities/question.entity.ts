import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { QuestionGroup } from './question-group.entity';
import { QuestionAnswer } from './question-answer.entity';

@Entity('questions')
export class Question {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'question_group_id' })
  questionGroupId: string;

  @ManyToOne(() => QuestionGroup, (questionGroup) => questionGroup.questions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'question_group_id' })
  questionGroup: QuestionGroup;

  @Column({ name: 'question_order' })
  questionOrder: number;

  @Column({ name: 'question_type', type: 'varchar', length: 50 })
  questionType: string;

  @Column({ name: 'question_text', type: 'text', nullable: true })
  questionText?: string;

  @Column({ type: 'jsonb' })
  config: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  explanation: string;

  @OneToOne(() => QuestionAnswer, (answer) => answer.question, {
    cascade: true,
  })
  answer: QuestionAnswer;
}
