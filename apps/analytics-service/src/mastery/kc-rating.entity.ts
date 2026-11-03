import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Elo-style rating of a learner on one knowledge component (question type / rubric criterion). */
@Entity('learner_kc_ratings')
export class KcRating {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'learner_id', type: 'uuid' }) learnerId: string;
    @Column({ type: 'varchar', length: 20 }) skill: string;
    @Column({ type: 'varchar', length: 50 }) kc: string;
    @Column({ type: 'numeric', precision: 7, scale: 2, default: 1500 }) rating: number;
    @Column({ type: 'int', default: 0 }) attempts: number;
    @Column({ type: 'int', default: 0 }) correct: number;
    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
