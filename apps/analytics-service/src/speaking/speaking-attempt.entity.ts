import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { SpeakingLevel } from './speaking-exercise.entity';

export type WordStatus = 'correct' | 'substituted' | 'omitted' | 'inserted';
export interface WordResult { word: string; status: WordStatus; heard?: string | null; sounds?: Array<{ expected: string; actual: string | null }> }

@Entity('speaking_attempts')
export class SpeakingAttempt {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'learner_id', type: 'uuid' }) learnerId: string;
    @Column({ name: 'exercise_id', type: 'uuid', nullable: true }) exerciseId: string | null;
    @Column({ type: 'varchar', length: 16 }) level: SpeakingLevel;
    @Column({ name: 'audio_url', type: 'text', nullable: true }) audioUrl: string | null;
    @Column({ type: 'text', nullable: true }) transcript: string | null;
    @Column({ name: 'duration_s', type: 'numeric', precision: 6, scale: 2, nullable: true }) durationS: number | null;
    @Column({ type: 'int', nullable: true }) wpm: number | null;
    @Column({ type: 'int', nullable: true }) pauses: number | null;
    @Column({ type: 'int', nullable: true }) fillers: number | null;
    @Column({ name: 'word_results', type: 'jsonb', nullable: true }) wordResults: WordResult[] | null;
    @Column({ type: 'jsonb', default: '{}' }) scores: Record<string, number | string | null>;
    @Column({ name: 'errors_json', type: 'jsonb', nullable: true }) errorsJson: unknown[] | null;
    @Column({ type: 'varchar', length: 10, default: 'groq' }) provider: string;
    @Column({ name: 'expires_at', type: 'timestamptz', nullable: true }) expiresAt: Date | null;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
