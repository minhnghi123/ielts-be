import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('saved_words')
export class SavedWord {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'learner_id', type: 'uuid' }) learnerId: string;
    @Column({ type: 'varchar', length: 80 }) word: string;
    @Column({ type: 'text', nullable: true }) context: string | null;
    @Column({ name: 'meaning_vi', type: 'text', nullable: true }) meaningVi: string | null;
    @Column({ name: 'test_id', type: 'uuid', nullable: true }) testId: string | null;
    @Column({ name: 'srs_interval_days', type: 'int', default: 1 }) srsIntervalDays: number;
    @Column({ name: 'srs_ease', type: 'numeric', precision: 4, scale: 2, default: 2.5 }) srsEase: number;
    @Column({ name: 'next_review_at', type: 'timestamptz', nullable: true }) nextReviewAt: Date | null;
    @Column({ name: 'review_count', type: 'int', default: 0 }) reviewCount: number;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
