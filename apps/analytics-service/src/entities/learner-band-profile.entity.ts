import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export type Skill = 'reading' | 'listening' | 'writing' | 'speaking' | 'overall';

@Entity('learner_band_profiles')
export class LearnerBandProfile {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'learner_id' })
    learnerId: string;

    @Column({ type: 'varchar', length: 50 })
    skill: Skill;

    @Column({
        name: 'current_band',
        type: 'decimal',
        precision: 2,
        scale: 1,
        nullable: true,
    })
    currentBand: number;

    @Column({
        name: 'target_band',
        type: 'decimal',
        precision: 2,
        scale: 1,
        nullable: true,
    })
    targetBand: number;

    @Column({ name: 'assessed_at' })
    assessedAt: Date;
}
