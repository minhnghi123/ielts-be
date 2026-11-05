import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('memory_reviews')
export class MemoryReview {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'learner_id', type: 'uuid' }) learnerId: string;
    @Column({ name: 'item_type', type: 'varchar', length: 10 }) itemType: 'word' | 'mistake';
    @Column({ name: 'item_id', type: 'uuid' }) itemId: string;
    @Column({ name: 'lag_h', type: 'numeric', precision: 9, scale: 2 }) lagH: number;
    @Column({ name: 'p_pred', type: 'numeric', precision: 5, scale: 4 }) pPred: number;
    @Column({ type: 'boolean' }) outcome: boolean;
    @Column({ name: 'half_life_before_h', type: 'numeric', precision: 9, scale: 2, nullable: true }) halfLifeBeforeH: number | null;
    @Column({ name: 'half_life_after_h', type: 'numeric', precision: 9, scale: 2, nullable: true }) halfLifeAfterH: number | null;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}

@Entity('learner_memory_params')
export class LearnerMemoryParams {
    @Column({ name: 'learner_id', type: 'uuid', primary: true }) learnerId: string;
    @Column({ type: 'numeric', precision: 4, scale: 2, default: 1 }) scale: number;
    @Column({ name: 'n_obs', type: 'int', default: 0 }) nObs: number;
    @Column({ name: 'log_loss', type: 'numeric', precision: 6, scale: 4, nullable: true }) logLoss: number | null;
    @Column({ name: 'fitted_at', type: 'timestamptz', nullable: true }) fittedAt: Date | null;
}
