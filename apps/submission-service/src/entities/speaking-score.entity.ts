import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('speaking_scores')
export class SpeakingScore {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'submission_id' })
    submissionId: string;

    @Column({ type: 'varchar', length: 50 })
    criterion: string;

    @Column({ type: 'decimal', precision: 2, scale: 1 })
    band: number;

    @Column({ type: 'text', nullable: true })
    feedback: string;
}
