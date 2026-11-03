import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Account } from './account.entity';

export type TeacherApprovalStatus = 'pending' | 'approved' | 'rejected';

@Entity('teacher_profiles')
export class TeacherProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id' })
  accountId: string;

  @OneToOne(() => Account)
  @JoinColumn({ name: 'account_id' })
  account: Account;

  @Column({ type: 'varchar', length: 255, nullable: true })
  organization: string | null;

  @Column({ type: 'text', nullable: true })
  bio: string | null;

  @Column({
    name: 'approval_status',
    type: 'varchar',
    length: 20,
    default: 'pending',
  })
  approvalStatus: TeacherApprovalStatus;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
