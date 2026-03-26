import { randomUUID } from 'crypto';
import { BeforeInsert, Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('learner_progress_snapshots')
export class LearnerProgressSnapshot {
    @PrimaryColumn('uuid')
    id: string;

    @BeforeInsert()
    ensureId() {
        if (!this.id) this.id = randomUUID();
    }

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
