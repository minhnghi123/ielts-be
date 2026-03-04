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
    submittedAt: Date;

    @Column({ name: 'raw_score', type: 'int', nullable: true })
    rawScore: number;

    @Column({ name: 'band_score', type: 'decimal', precision: 3, scale: 1, nullable: true })
    bandScore: number;

    @OneToMany(() => QuestionAttempt, (qa) => qa.testAttempt, { cascade: true })
    questionAttempts: QuestionAttempt[];
}
