import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

export interface HintsVi { location?: string | null; paragraph?: number | null; keywords?: string[]; paraphrase?: string | null }

/** Cached AI hints for a question, keyed by a hash of the content the client showed (so a tampered passage cannot poison other learners' cache). */
@Entity('question_hints')
export class QuestionHint {
    @PrimaryColumn({ name: 'question_id', type: 'uuid' }) questionId: string;
    @PrimaryColumn({ name: 'content_hash', type: 'varchar', length: 32 }) contentHash: string;
    @Column({ name: 'hints_vi', type: 'jsonb' }) hintsVi: HintsVi;
    @Column({ type: 'varchar', length: 80, nullable: true }) model: string | null;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
