import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type JoinPolicy = 'open' | 'approval' | 'closed';
export type ClassStatus = 'active' | 'archived';

@Entity('classes')
export class ClassEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** teacher_profiles.id of the owner */
  @Index()
  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'target_band',
    type: 'decimal',
    precision: 3,
    scale: 1,
    nullable: true,
  })
  targetBand: number | null;

  @Index({ unique: true })
  @Column({ name: 'join_code', type: 'varchar', length: 8 })
  joinCode: string;

  @Column({
    name: 'join_policy',
    type: 'varchar',
    length: 10,
    default: 'approval',
  })
  joinPolicy: JoinPolicy;

  @Column({ name: 'max_members', type: 'int', nullable: true })
  maxMembers: number | null;

  @Column({ name: 'cover_color', type: 'varchar', length: 20, nullable: true })
  coverColor: string | null;

  @Column({ type: 'varchar', length: 10, default: 'active' })
  status: ClassStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
