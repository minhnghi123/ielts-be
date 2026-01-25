import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Account } from './account.entity';

@Entity('admin_profiles')
export class AdminProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id' })
  accountId: string;
  @OneToOne(() => Account)
  @JoinColumn({ name: 'account_id' })
  account: Account;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
