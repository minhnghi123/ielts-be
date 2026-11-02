import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

export type MemberStatus = 'pending' | 'active' | 'removed' | 'left';

@Entity('class_members')
@Unique(['classId', 'learnerId'])
export class ClassMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'class_id', type: 'uuid' })
  classId: string;

  /** learner_profiles.id */
  @Index()
  @Column({ name: 'learner_id', type: 'uuid' })
  learnerId: string;

  @Column({ type: 'varchar', length: 10, default: 'pending' })
  status: MemberStatus;

  @Column({ name: 'joined_at', type: 'timestamptz', nullable: true })
  joinedAt: Date | null;

  @Column({ name: 'left_at', type: 'timestamptz', nullable: true })
  leftAt: Date | null;

  /** Private note of the teacher about this student. */
  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
