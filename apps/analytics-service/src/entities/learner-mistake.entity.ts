import { randomUUID } from 'crypto';
import { BeforeInsert, Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('learner_mistakes')
export class LearnerMistake {
    @PrimaryColumn('uuid')
    id: string;

    @BeforeInsert()
    ensureId() {
        if (!this.id) this.id = randomUUID();
    }

    @Column({ name: 'learner_id' })
    learnerId: string;

    @Column({ name: 'question_id' })
    questionId: string;

    @Column({ name: 'mistake_type', type: 'varchar', length: 50, nullable: true })
    mistakeType: string;

    @Column({ name: 'created_at' })
    createdAt: Date;
}
