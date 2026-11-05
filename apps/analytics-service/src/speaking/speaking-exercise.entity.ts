import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type SpeakingLevel = 'word' | 'sentence_build' | 'sentence' | 'free';
export const SPEAKING_LEVELS: SpeakingLevel[] = ['word', 'sentence_build', 'sentence', 'free'];

@Entity('speaking_exercises')
export class SpeakingExercise {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ type: 'varchar', length: 16 }) level: SpeakingLevel;
    @Column({ type: 'text' }) text: string;
    @Column({ type: 'text', nullable: true }) ipa: string | null;
    @Column({ name: 'target_sounds', type: 'text', array: true, default: '{}' }) targetSounds: string[];
    @Column({ type: 'varchar', length: 60, nullable: true }) topic: string | null;
    @Column({ type: 'smallint', default: 2 }) difficulty: number;
    @Column({ name: 'shuffled_tokens', type: 'text', array: true, nullable: true }) shuffledTokens: string[] | null;
    @Column({ name: 'sample_answer', type: 'text', nullable: true }) sampleAnswer: string | null;
    @Column({ name: 'tip_vi', type: 'text', nullable: true }) tipVi: string | null;
    @Column({ name: 'created_by', type: 'uuid', nullable: true }) createdBy: string | null;
    @Column({ name: 'is_active', type: 'boolean', default: true }) isActive: boolean;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
