import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('ai_writing_gradings')
export class AiWritingGrading {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'submission_id' })
    submissionId: string;

    @Column({ name: 'model_name', type: 'varchar', length: 100, nullable: true })
    modelName: string;

    @Column({ name: 'model_version', type: 'varchar', length: 50, nullable: true })
    modelVersion: string;

    @Column({ name: 'prompt_version', type: 'varchar', length: 50, nullable: true })
    promptVersion: string;

    @Column({ name: 'task_response', type: 'decimal', precision: 3, scale: 1, nullable: true })
    taskResponse: number;

    @Column({ name: 'coherence', type: 'decimal', precision: 3, scale: 1, nullable: true })
    coherence: number;

    @Column({ name: 'lexical', type: 'decimal', precision: 3, scale: 1, nullable: true })
    lexical: number;

    @Column({ name: 'grammar', type: 'decimal', precision: 3, scale: 1, nullable: true })
    grammar: number;

    @Column({ name: 'overall_band', type: 'decimal', precision: 3, scale: 1, nullable: true })
    overallBand: number;

    /**
     * Rich structured JSONB feedback:
     * {
     *   task1: { annotated_html, tr, cc, lr, gra, overall_band, suggestions: [...] },
     *   task2: { annotated_html, tr, cc, lr, gra, overall_band, suggestions: [...] }
     * }
     */
    @Column({ type: 'jsonb', nullable: true })
    feedback: Record<string, any>;

    @Column({ name: 'confidence_score', type: 'decimal', precision: 3, scale: 2, nullable: true })
    confidenceScore: number;

    @Column({ name: 'graded_at', default: () => 'now()' })
    gradedAt: Date;
}
