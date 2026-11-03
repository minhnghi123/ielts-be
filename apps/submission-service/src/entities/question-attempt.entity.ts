import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
} from 'typeorm';

@Entity('question_attempts')
export class QuestionAttempt {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'test_attempt_id', type: 'uuid' })
    testAttemptId: string;

    @Column({ name: 'question_id', type: 'uuid' })
    questionId: string;

    @Column({ type: 'text', nullable: true })
    answer: string;

    @Column({ name: 'is_correct', nullable: true })
    isCorrect: boolean;

    @Column({ name: 'answered_at', nullable: true })
    answeredAt: Date;
}
