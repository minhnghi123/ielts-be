import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Account } from './account.entity';

@Entity('learner_profiles')
export class LearnerProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id' })
  accountId: string;

  @OneToOne(() => Account)
  @JoinColumn({ name: 'account_id' })
  account: Account;

  @Column({ name: 'current_level', default: 'beginner' })
  currentLevel: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
