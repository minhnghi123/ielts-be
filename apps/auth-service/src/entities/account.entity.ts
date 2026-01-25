import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
} from 'typeorm';
import { LearnerProfile } from './learner-profile.entity';
import { AdminProfile } from './admin-profile.entity';

@Entity('accounts')
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string; // Lưu hash, không lưu plain text

  @Column({ default: 'active' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Quan hệ ngược để tiện truy vấn
  @OneToOne(() => LearnerProfile, (learner) => learner.account)
  learnerProfile: LearnerProfile;

  @OneToOne(() => AdminProfile, (admin) => admin.account)
  adminProfile: AdminProfile;
}
