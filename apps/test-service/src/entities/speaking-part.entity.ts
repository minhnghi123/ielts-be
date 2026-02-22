import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Test } from './test.entity';

@Entity('speaking_parts')
export class SpeakingPart {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'test_id' })
    testId: string;

    @ManyToOne(() => Test, (test) => test.speakingParts, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'test_id' })
    test: Test;

    @Column({ name: 'part_number' })
    partNumber: number;

    @Column({ type: 'text', nullable: true })
    prompt: string;
}
