import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type PostType = 'announcement' | 'material';

@Entity('class_posts')
export class ClassPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'class_id', type: 'uuid' })
  classId: string;

  /** accounts.id of the author */
  @Column({ name: 'author_account_id', type: 'uuid' })
  authorAccountId: string;

  @Column({ type: 'varchar', length: 15, default: 'announcement' })
  type: PostType;

  @Column({ type: 'varchar', length: 200, nullable: true })
  title: string | null;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'jsonb', nullable: true })
  attachments: { name: string; url: string }[] | null;

  @Column({ default: false })
  pinned: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
