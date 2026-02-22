import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export type GradingStatus = 'pending' | 'ai_graded' | 'human_reviewed';

@Entity('writing_submissions')
export class WritingSubmission {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'learner_id' })
    learnerId: string;

    @Column({ name: 'writing_task_id' })
    writingTaskId: string;

    @Column({ type: 'text' })
    content: string;

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
