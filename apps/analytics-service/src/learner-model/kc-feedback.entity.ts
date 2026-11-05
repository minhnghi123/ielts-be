import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('learner_kc_feedback')
export class KcFeedback {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'learner_id', type: 'uuid' }) learnerId: string;
    @Column({ type: 'varchar', length: 20 }) skill: string;
    @Column({ type: 'varchar', length: 50 }) kc: string;
    @Column({ type: 'varchar', length: 12 }) verdict: 'vung' | 'chua_vung';
    @Column({ name: 'rating_before', type: 'numeric', precision: 7, scale: 2 }) ratingBefore: number;
    @Column({ name: 'rating_after', type: 'numeric', precision: 7, scale: 2 }) ratingAfter: number;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
