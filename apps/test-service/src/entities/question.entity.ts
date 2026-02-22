import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    OneToOne,
    JoinColumn,
} from 'typeorm';
import { Section } from './section.entity';
import { QuestionAnswer } from './question-answer.entity';

@Entity('questions')
export class Question {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'section_id' })
    sectionId: string;

    @ManyToOne(() => Section, (section) => section.questions, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'section_id' })
    section: Section;

    @Column({ name: 'question_order' })
    questionOrder: number;

    @Column({ name: 'question_type', type: 'varchar', length: 50 })
    questionType: string;

    @Column({ name: 'question_text', type: 'text' })
    questionText: string;

    @Column({ type: 'jsonb' })
    config: Record<string, any>;

    @Column({ type: 'text', nullable: true })
    explanation: string;

    @OneToOne(() => QuestionAnswer, (answer) => answer.question, {
        cascade: true,
    })
    answer: QuestionAnswer;
}
