import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type StudyTaskType = 'drill' | 'review' | 'mock' | 'writing' | 'speaking' | 'placement';
export type StudyRefType = 'test' | 'drill' | 'mistakes' | 'words';

/** One item of a learner's weekly plan (table from migration 003). */
@Entity('study_tasks')
export class StudyTask {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'learner_id', type: 'uuid' })
    learnerId: string;

    @Column({ name: 'week_start', type: 'date' })
    weekStart: string;

    @Column({ name: 'scheduled_for', type: 'date' })
    scheduledFor: string;

    @Column({ name: 'task_type', type: 'varchar', length: 12 })
    taskType: StudyTaskType;

    @Column({ type: 'varchar', length: 20, nullable: true })
    skill: string | null;

    @Column({ type: 'varchar', length: 50, nullable: true })
    kc: string | null;

    @Column({ name: 'ref_type', type: 'varchar', length: 12, nullable: true })
    refType: StudyRefType | null;

    @Column({ name: 'ref_id', type: 'uuid', nullable: true })
    refId: string | null;

    @Column({ name: 'title_vi', type: 'varchar', length: 160 })
    titleVi: string;

    @Column({ name: 'reason_vi', type: 'varchar', length: 240, nullable: true })
    reasonVi: string | null;

    @Column({ name: 'est_minutes', type: 'int', default: 15 })
    estMinutes: number;

    @Column({ type: 'smallint', default: 2 })
    priority: number;

    @Column({ name: 'done_at', type: 'timestamptz', nullable: true })
    doneAt: Date | null;

    @Column({ name: 'result_ref', type: 'uuid', nullable: true })
    resultRef: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}
