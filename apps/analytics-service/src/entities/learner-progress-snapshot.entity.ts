import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('learner_progress_snapshots')
export class LearnerProgressSnapshot {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'learner_id' })
    learnerId: string;

    @Column({
        name: 'overall_band',
        type: 'decimal',
        precision: 2,
        scale: 1,
    })
    overallBand: number;

    @Column({ name: 'snapshot_at' })
    snapshotAt: Date;
}
