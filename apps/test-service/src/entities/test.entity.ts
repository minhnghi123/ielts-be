import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Section } from './section.entity';
import { WritingTask } from './writing-task.entity';
import { SpeakingPart } from './speaking-part.entity';

export type Skill = 'reading' | 'listening' | 'writing' | 'speaking';

@Entity('tests')
export class Test {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
    length: 50,
  })
  skill: Skill;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ name: 'is_mock' })
  isMock: boolean;

  @Column({ name: 'created_by' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => Section, (section) => section.test, { cascade: true })
  sections: Section[];

  @OneToMany(() => WritingTask, (task) => task.test, { cascade: true })
  writingTasks: WritingTask[];

  @OneToMany(() => SpeakingPart, (part) => part.test, { cascade: true })
  speakingParts: SpeakingPart[];
}
