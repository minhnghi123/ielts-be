import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export type GradingStatus = 'pending' | 'ai_graded' | 'human_reviewed';

@Entity('speaking_submissions')
export class SpeakingSubmission {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'learner_id' })
    learnerId: string;

    @Column({ name: 'speaking_part_id' })
    speakingPartId: string;

    @Column({ name: 'audio_url', type: 'text' })
    audioUrl: string;

    @Column({ type: 'text', nullable: true })
    transcript: string;

    @Column({ name: 'submitted_at' })
    submittedAt: Date;

    @Column({
        name: 'overall_band',
        type: 'decimal',
        precision: 2,
        scale: 1,
        nullable: true,
    })
    overallBand: number;

    @Column({
        name: 'grading_status',
        type: 'varchar',
        length: 30,
        default: 'pending',
    })
    gradingStatus: GradingStatus;
}
