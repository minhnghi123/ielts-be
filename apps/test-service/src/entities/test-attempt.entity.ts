import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    OneToMany,
} from 'typeorm';
import { Test } from './test.entity';
import { QuestionAttempt } from './question-attempt.entity';

export type AttemptStatus = 'in_progress' | 'submitted' | 'expired';

@Entity('test_attempts')
export class TestAttempt {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'learner_id', type: 'uuid' })
    learnerId: string;

    // Relation to Test
    @ManyToOne(() => Test, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'test_id' })
    test: Test;

    @Column({ name: 'test_id', type: 'uuid' })
    testId: string;

    @CreateDateColumn({ name: 'started_at', type: 'timestamptz' })
    startedAt: Date;

    @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
    submittedAt: Date | null;

    /** in_progress → submitted (by learner) | expired (auto-submitted when the deadline passed) */
    @Column({ type: 'varchar', length: 20, default: 'in_progress' })
    status: AttemptStatus;

    @Column({ name: 'duration_seconds', type: 'int', nullable: true })
    durationSeconds: number | null;

    /** Server-side deadline. The client timer is only a mirror of this value. */
    @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
    expiresAt: Date | null;

    /** Autosaved answers keyed by questionId (or task/part id for Writing/Speaking). */
    @Column({ name: 'draft_answers', type: 'jsonb', default: () => "'{}'" })
    draftAnswers: Record<string, string>;

    @Column({ name: 'last_saved_at', type: 'timestamptz', nullable: true })
    lastSavedAt: Date | null;

    /** true when the learner chose a custom (non-official) duration on a practice test */
    @Column({ name: 'is_practice', default: false })
    isPractice: boolean;

    @Column({ name: 'raw_score', type: 'int', nullable: true })
    rawScore: number;

    @Column({ name: 'band_score', type: 'decimal', precision: 3, scale: 1, nullable: true })
    bandScore: number;

    /** AI-generated feedback stored after the result page triggers analysis. */
    @Column({ name: 'ai_feedback', type: 'text', nullable: true })
    aiFeedback: string | null;

    @OneToMany(() => QuestionAttempt, (qa) => qa.testAttempt, { cascade: true })
    questionAttempts: QuestionAttempt[];
}
