import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    OneToOne,
    JoinColumn,
} from 'typeorm';
import { Question } from './question.entity';

@Entity('question_answers')
export class QuestionAnswer {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'question_id' })
    questionId: string;

    @OneToOne(() => Question, (question) => question.answer, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'question_id' })
    question: Question;

    @Column({ name: 'correct_answers', type: 'text', array: true })
    correctAnswers: string[];

    @Column({ name: 'case_sensitive' })
    caseSensitive: boolean;
}
