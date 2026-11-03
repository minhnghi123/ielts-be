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

export interface EvidenceAnchor {
  kind: 'passage' | 'audio';
  /** 1-based paragraph index (passage) */
  paragraph?: number;
  /** audio offsets in milliseconds (audio) */
  startMs?: number;
  endMs?: number;
  /** exact sentence from the passage / transcript */
  quote?: string;
}

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

  /** Vietnamese explanation shown after submission (author- or teacher-written). */
  @Column({ type: 'text', nullable: true })
  explanation: string;

  /** Author's difficulty estimate 1 (easy) … 5 (hard). Elo takes over once data exists. */
  @Column({ type: 'smallint', nullable: true })
  difficulty: number | null;

  /** Self-calibrating difficulty (Elo). 1500 = unknown / average. */
  @Column({
    name: 'elo_rating',
    type: 'numeric',
    precision: 7,
    scale: 2,
    default: 1500,
    transformer: {
      to: (v: number) => v,
      from: (v: string | number | null) => (v == null ? 1500 : Number(v)),
    },
  })
  eloRating: number;

  /** Where the answer is found: passage paragraph/quote or audio time range. */
  @Column({ name: 'evidence_anchor', type: 'jsonb', nullable: true })
  evidenceAnchor: EvidenceAnchor | null;

  @OneToOne(() => QuestionAnswer, (answer) => answer.question, {
    cascade: true,
  })
  answer: QuestionAnswer;
}
