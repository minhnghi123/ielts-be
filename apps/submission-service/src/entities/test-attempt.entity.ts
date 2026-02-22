import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
} from 'typeorm';

@Entity('test_attempts')
export class TestAttempt {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'learner_id' })
    learnerId: string;

    @Column({ name: 'test_id' })
    testId: string;

    @Column({ name: 'started_at' })
    startedAt: Date;

    @Column({ name: 'submitted_at', nullable: true })
    submittedAt: Date;

    @Column({ name: 'raw_score', nullable: true })
    rawScore: number;

    @Column({
        name: 'band_score',
        type: 'decimal',
        precision: 3,
        scale: 1,
        nullable: true,
    })
    bandScore: number;
}
