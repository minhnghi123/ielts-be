import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('learner_mistakes')
export class LearnerMistake {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'learner_id' })
    learnerId: string;

    @Column({ name: 'question_id' })
    questionId: string;

    @Column({ name: 'mistake_type', type: 'varchar', length: 50, nullable: true })
    mistakeType: string;

    @Column({ name: 'created_at' })
    createdAt: Date;
}
