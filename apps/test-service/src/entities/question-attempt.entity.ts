import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { TestAttempt } from './test-attempt.entity';
import { Question } from './question.entity';

@Entity('question_attempts')
export class QuestionAttempt {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // Relation to TestAttempt
    @ManyToOne(() => TestAttempt, (ta) => ta.questionAttempts, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'test_attempt_id' })
    testAttempt: TestAttempt;

    @Column({ name: 'test_attempt_id', type: 'uuid' })
    testAttemptId: string;

    // Relation to Question
    @ManyToOne(() => Question, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'question_id' })
    question: Question;

    @Column({ name: 'question_id', type: 'uuid' })
    questionId: string;

    @Column({ type: 'text', nullable: true })
    answer: string;

    @Column({ name: 'is_correct', type: 'boolean', nullable: true })
    isCorrect: boolean;

    @Column({ name: 'answered_at', type: 'timestamp', nullable: true })
    answeredAt: Date;
}
