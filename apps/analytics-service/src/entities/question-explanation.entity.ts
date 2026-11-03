import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { ErrorCause } from '@app/common';

export type ExplanationSource = 'ai' | 'author' | 'teacher';

/** Cached Vietnamese explanation for (question, wrong answer). '' answer = generic. */
@Entity('question_explanations')
export class QuestionExplanation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'question_id', type: 'uuid' })
  questionId: string;

  @Column({ name: 'user_answer_norm', type: 'text', default: '' })
  userAnswerNorm: string;

  @Column({ name: 'error_cause', type: 'varchar', length: 40, nullable: true })
  errorCause: ErrorCause | null;

  @Column({ name: 'evidence_quote', type: 'text', nullable: true })
  evidenceQuote: string | null;

  @Column({ name: 'explanation_vi', type: 'text' })
  explanationVi: string;

  @Column({ name: 'tip_vi', type: 'text', nullable: true })
  tipVi: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  model: string | null;

  @Column({ type: 'varchar', length: 10, default: 'ai' })
  source: ExplanationSource;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'helpful_votes', type: 'int', default: 0 })
  helpfulVotes: number;

  @Column({ name: 'unhelpful_votes', type: 'int', default: 0 })
  unhelpfulVotes: number;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
