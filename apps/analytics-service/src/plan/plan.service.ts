import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { normalizeQuestionType } from '@app/common';
import { StudyTask, StudyTaskType } from './study-task.entity';
import { LearnerMistake } from '../entities/learner-mistake.entity';
import { AnalyticsServiceService } from '../analytics-service.service';

const SKILLS = ['listening', 'reading', 'writing', 'speaking'] as const;
type Skill = (typeof SKILLS)[number];
const SKILL_VI: Record<Skill, string> = { listening: 'Listening', reading: 'Reading', writing: 'Writing', speaking: 'Speaking' };
const TYPE_VI: Record<string, string> = {
    multiple_choice: 'Trắc nghiệm',
    fill_in_blank: 'Điền từ',
    short_answer: 'Trả lời ngắn',
    true_false_not_given: 'True / False / Not Given',
    yes_no_not_given: 'Yes / No / Not Given',
    matching_heading: 'Nối tiêu đề đoạn',
    matching: 'Nối thông tin',
    matching_features: 'Nối đặc điểm',
    sentence_ending: 'Hoàn thành câu',
};

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
/** Monday-based week start, in UTC dates (plan dates are calendar days, not instants). */
export function weekStartOf(d: Date): Date {
    const u = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dow = (u.getUTCDay() + 6) % 7;
    return addDays(u, -dow);
}

interface Candidate {
    taskType: StudyTaskType;
    skill: Skill | null;
    kc: string | null;
    refType: StudyTask['refType'];
    titleVi: string;
    reasonVi: string;
    estMinutes: number;
    priority: 1 | 2 | 3;
    /** How many times per week it may appear. */
    repeat: number;
}

export interface WeekPlan {
    weekStart: string;
    tasks: StudyTask[];
    generatedNow: boolean;
    totalMinutes: number;
    doneMinutes: number;
}

/**
 * Adaptive weekly plan. Inputs: learner goals (budget, exam date, targets), band
 * profiles (gaps), notebook (due reviews, weak question types), attempts (placement).
 * Deterministic and cheap, so it can be (re)built on demand or by a cron hitting
 * `POST /analytics/plan/rebuild-all` — no scheduler dependency inside the service.
 */
@Injectable()
export class PlanService {
    constructor(
        @InjectRepository(StudyTask) private readonly taskRepo: Repository<StudyTask>,
        @InjectRepository(LearnerMistake) private readonly mistakeRepo: Repository<LearnerMistake>,
        private readonly analytics: AnalyticsServiceService,
        private readonly dataSource: DataSource,
    ) {}

    async getWeek(learnerId: string, now = new Date()): Promise<WeekPlan> {
        const weekStart = isoDate(weekStartOf(now));
        let tasks = await this.taskRepo.find({ where: { learnerId, weekStart }, order: { scheduledFor: 'ASC', priority: 'ASC' } });
        let generatedNow = false;
        if (tasks.length === 0) {
            tasks = await this.generate(learnerId, now, []);
            generatedNow = true;
        }
        return this.summarise(weekStart, tasks, generatedNow);
    }

    /** Drop undone tasks of the current week and rebuild from fresh signals; done tasks stay. */
    async regenerate(learnerId: string, now = new Date()): Promise<WeekPlan> {
        const weekStart = isoDate(weekStartOf(now));
        await this.taskRepo.createQueryBuilder().delete().where('learner_id = :learnerId AND week_start = :weekStart AND done_at IS NULL', { learnerId, weekStart }).execute();
        const done = await this.taskRepo.find({ where: { learnerId, weekStart } });
        const fresh = await this.generate(learnerId, now, done);
        return this.summarise(weekStart, [...done, ...fresh].sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor) || a.priority - b.priority), true);
    }

    async setDone(taskId: string, learnerId: string, done: boolean, resultRef?: string | null): Promise<StudyTask> {
        const task = await this.taskRepo.findOne({ where: { id: taskId, learnerId } });
        if (!task) throw new NotFoundException('Task not found');
        task.doneAt = done ? new Date() : null;
        task.resultRef = done ? (resultRef ?? null) : null;
        return this.taskRepo.save(task);
    }

    /** For every learner with goals, make sure this week's plan exists (idempotent). */
    async rebuildAll(now = new Date()): Promise<{ learners: number; generated: number }> {
        const rows: Array<{ learner_id: string }> = await this.dataSource.query(`SELECT learner_id FROM learner_goals`);
        let generated = 0;
        for (const r of rows) {
            const plan = await this.getWeek(r.learner_id, now);
            if (plan.generatedNow) generated++;
        }
        return { learners: rows.length, generated };
    }

    async today(learnerId: string, now = new Date()) {
        const plan = await this.getWeek(learnerId, now);
        const today = isoDate(now);
        const tasks = plan.tasks.filter((t) => t.scheduledFor === today || (t.scheduledFor < today && !t.doneAt));
        const signals = await this.signals(learnerId, now);
        return {
            date: today,
            tasks,
            dueReviews: signals.dueReviews,
            streakDays: signals.streakDays,
            hasGoals: !!signals.goals,
            examDate: signals.goals?.examDate ?? null,
            weeksLeft: signals.goals?.weeksLeft ?? null,
            bands: SKILLS.map((skill) => ({
                skill,
                current: signals.current[skill],
                target: signals.goals?.targets?.[skill]?.target ?? null,
                gap: signals.goals && signals.current[skill] != null ? round5(signals.goals.targets[skill].target - signals.current[skill]) : null,
            })),
        };
    }

    /** Teacher-assigned drill → one task per learner in the current week (dedup by kc/skill/title). */
    async bulkAssign(input: { learnerIds: string[]; skill: string; kc?: string | null; titleVi: string; reasonVi?: string | null; estMinutes?: number; taskType?: StudyTaskType }, now = new Date()): Promise<{ created: number }> {
        const weekStart = isoDate(weekStartOf(now));
        const today = isoDate(now);
        let created = 0;
        for (const learnerId of new Set(input.learnerIds)) {
            const dup = await this.taskRepo.findOne({ where: { learnerId, weekStart, titleVi: input.titleVi.slice(0, 160) } });
            if (dup) continue;
            await this.taskRepo.save(this.taskRepo.create({
                learnerId, weekStart, scheduledFor: today, taskType: input.taskType ?? 'drill', skill: input.skill, kc: input.kc ?? null,
                refType: (input.taskType ?? 'drill') === 'drill' ? 'drill' : 'test', refId: null,
                titleVi: input.titleVi.slice(0, 160), reasonVi: (input.reasonVi ?? 'Giáo viên giao cho nhóm cần củng cố dạng này.').slice(0, 240),
                estMinutes: input.estMinutes ?? 15, priority: 1,
            }));
            created++;
        }
        return { created };
    }

    /** Writing error tags aggregated from ai_writing_gradings.errors_json (last 90 days). */
    async writingErrors(learnerId: string): Promise<{ total: number; byType: Record<string, number>; recent: Array<Record<string, unknown>> }> {
        const rows: Array<{ errors_json: any; graded_at: string }> = await this.dataSource.query(
            `SELECT g.errors_json, g.graded_at FROM ai_writing_gradings g
             JOIN writing_submissions ws ON ws.id = g.submission_id
             WHERE ws.learner_id = $1 AND g.errors_json IS NOT NULL AND g.graded_at > now() - interval '90 days'
             ORDER BY g.graded_at DESC LIMIT 20`,
            [learnerId],
        );
        const byType: Record<string, number> = {};
        const recent: Array<Record<string, unknown>> = [];
        for (const r of rows) {
            for (const [k, v] of Object.entries((r.errors_json?.byType ?? {}) as Record<string, number>)) byType[k] = (byType[k] ?? 0) + Number(v);
            if (recent.length < 10) for (const it of (r.errors_json?.items ?? []) as Array<Record<string, unknown>>) { if (recent.length < 10) recent.push(it); }
        }
        return { total: Object.values(byType).reduce((a, b) => a + b, 0), byType, recent };
    }

    // ── internals ────────────────────────────────────────────────────────────

    private summarise(weekStart: string, tasks: StudyTask[], generatedNow: boolean): WeekPlan {
        return {
            weekStart,
            tasks,
            generatedNow,
            totalMinutes: tasks.reduce((s, t) => s + t.estMinutes, 0),
            doneMinutes: tasks.filter((t) => t.doneAt).reduce((s, t) => s + t.estMinutes, 0),
        };
    }

    private async signals(learnerId: string, now: Date) {
        const goals = await this.analytics.getGoals(learnerId).catch(() => null);
        const profiles = await this.analytics.getBandProfiles(learnerId);
        const current: Record<Skill, number | null> = { listening: null, reading: null, writing: null, speaking: null };
        for (const p of profiles) if (SKILLS.includes(p.skill as Skill) && p.currentBand != null) current[p.skill as Skill] = Number(p.currentBand);

        const dueReviews = await this.mistakeRepo
            .createQueryBuilder('m')
            .where('m.learner_id = :learnerId', { learnerId })
            .andWhere("m.status <> 'fixed' AND (m.next_review_at IS NULL OR m.next_review_at <= now())")
            .getCount();

        const weak: Array<{ skill: string; question_type: string; n: string }> = await this.dataSource.query(
            `SELECT skill, question_type, COUNT(*) AS n
             FROM learner_mistakes
             WHERE learner_id = $1 AND status <> 'fixed' AND question_type IS NOT NULL AND created_at > now() - interval '30 days'
             GROUP BY skill, question_type ORDER BY n DESC LIMIT 4`,
            [learnerId],
        );

        const attemptsBySkill: Array<{ skill: string; n: string }> = await this.dataSource.query(
            `SELECT t.skill, COUNT(*) AS n FROM test_attempts ta JOIN tests t ON t.id = ta.test_id
             WHERE ta.learner_id = $1 AND ta.submitted_at IS NOT NULL GROUP BY t.skill`,
            [learnerId],
        );

        const activeDays: Array<{ d: string }> = await this.dataSource.query(
            `SELECT DISTINCT d::date::text AS d FROM (
                SELECT submitted_at AS d FROM test_attempts WHERE learner_id = $1 AND submitted_at IS NOT NULL
                UNION ALL SELECT done_at FROM study_tasks WHERE learner_id = $1 AND done_at IS NOT NULL
             ) x WHERE d > now() - interval '60 days'`,
            [learnerId],
        );
        const days = new Set(activeDays.map((r) => r.d));
        let streakDays = 0;
        let cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        if (!days.has(isoDate(cursor))) cursor = addDays(cursor, -1);
        while (days.has(isoDate(cursor))) { streakDays++; cursor = addDays(cursor, -1); }

        return {
            goals,
            current,
            dueReviews,
            weak: weak.map((w) => ({ skill: w.skill as Skill, type: normalizeQuestionType(w.question_type), n: Number(w.n) })).filter((w) => w.type),
            attempts: Object.fromEntries(attemptsBySkill.map((a) => [a.skill, Number(a.n)])) as Partial<Record<Skill, number>>,
            streakDays,
        };
    }

    private async generate(learnerId: string, now: Date, alreadyDone: StudyTask[]): Promise<StudyTask[]> {
        const s = await this.signals(learnerId, now);
        const minutesPerDay = s.goals?.minutesPerDay ?? 30;
        const daysPerWeek = s.goals?.daysPerWeek ?? 5;
        const weekStart = weekStartOf(now);
        const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const remaining: Date[] = [];
        for (let d = todayUtc; d < addDays(weekStart, 7); d = addDays(d, 1)) remaining.push(d);
        const dayCount = Math.min(daysPerWeek, remaining.length);
        const days = remaining.slice(0, dayCount);
        if (days.length === 0) return [];

        const gap = (sk: Skill) => (s.goals && s.current[sk] != null ? round5(s.goals.targets[sk].target - s.current[sk]) : null);
        const doneTypes = new Set(alreadyDone.map((t) => `${t.taskType}:${t.skill ?? ''}`));
        const cands: Candidate[] = [];

        if (!s.goals) {
            cands.push({ taskType: 'placement', skill: null, kc: null, refType: null, titleVi: 'Đặt mục tiêu band và ngày thi', reasonVi: 'Kế hoạch chỉ cá nhân hoá được khi biết bạn muốn đạt bao nhiêu và còn bao lâu.', estMinutes: 5, priority: 1, repeat: 1 });
        }
        for (const sk of ['listening', 'reading'] as Skill[]) {
            if (s.current[sk] == null && !(s.attempts[sk] ?? 0)) {
                cands.push({ taskType: 'placement', skill: sk, kc: null, refType: 'test', titleVi: `Làm 1 đề ${SKILL_VI[sk]} để biết band hiện tại`, reasonVi: 'Chưa có dữ liệu kỹ năng này; cần một bài đầu vào để đo khoảng cách tới mục tiêu.', estMinutes: sk === 'listening' ? 35 : 60, priority: 1, repeat: 1 });
            }
        }
        if (s.dueReviews > 0) {
            const n = s.dueReviews;
            cands.push({ taskType: 'review', skill: null, kc: null, refType: 'mistakes', titleVi: `Ôn ${Math.min(n, 15)} câu đến hạn trong sổ lỗi`, reasonVi: 'Ôn lại đúng lúc sắp quên giúp nhớ lâu hơn làm đề mới.', estMinutes: Math.min(10 + Math.min(n, 15) * 1, 25), priority: 1, repeat: Math.min(3, Math.ceil(n / 8)) });
        }
        for (const w of s.weak.slice(0, 3)) {
            const g = gap(w.skill);
            cands.push({ taskType: 'drill', skill: w.skill, kc: w.type!, refType: 'drill', titleVi: `Luyện ${TYPE_VI[w.type!] ?? w.type} (${SKILL_VI[w.skill]})`, reasonVi: `${w.n} câu sai dạng này trong 30 ngày${g != null && g > 0 ? `; ${SKILL_VI[w.skill]} còn cách mục tiêu ${g} band` : ''}.`, estMinutes: 15, priority: g != null && g >= 1 ? 1 : 2, repeat: w.n >= 5 ? 2 : 1 });
        }
        const lrGaps = (['listening', 'reading'] as Skill[]).map((sk) => ({ sk, g: gap(sk) })).filter((x) => x.g != null && x.g > 0).sort((a, b) => b.g! - a.g!);
        for (const { sk, g } of lrGaps) {
            if (doneTypes.has(`mock:${sk}`)) continue;
            cands.push({ taskType: 'mock', skill: sk, kc: null, refType: 'test', titleVi: `Làm 1 đề ${SKILL_VI[sk]} đầy đủ, bấm giờ`, reasonVi: `Kỹ năng ${lrGaps[0].sk === sk ? 'xa mục tiêu nhất' : 'còn thiếu'} (+${g} band); đề đầy đủ cập nhật band và sổ lỗi.`, estMinutes: sk === 'listening' ? 35 : 60, priority: 2, repeat: 1 });
        }
        if (!doneTypes.has('writing:writing') && (gap('writing') == null || gap('writing')! > 0)) {
            cands.push({ taskType: 'writing', skill: 'writing', kc: null, refType: 'test', titleVi: 'Viết 1 bài Writing và nhận chấm AI', reasonVi: gap('writing') != null ? `Writing còn cách mục tiêu ${gap('writing')} band; mỗi tuần một bài có phản hồi là nhịp tối thiểu.` : 'Chưa có band Writing; một bài chấm AI sẽ cho điểm xuất phát.', estMinutes: 40, priority: 2, repeat: 1 });
        }
        if (!doneTypes.has('speaking:speaking') && (gap('speaking') == null || gap('speaking')! > 0)) {
            cands.push({ taskType: 'speaking', skill: 'speaking', kc: null, refType: 'test', titleVi: 'Luyện Speaking Part 2 với AI', reasonVi: gap('speaking') != null ? `Speaking còn cách mục tiêu ${gap('speaking')} band.` : 'Chưa có band Speaking.', estMinutes: 15, priority: 3, repeat: 1 });
        }
        if (cands.length === 0) {
            cands.push({ taskType: 'mock', skill: 'reading', kc: null, refType: 'test', titleVi: 'Làm 1 đề Reading để giữ phong độ', reasonVi: 'Bạn đã đạt mục tiêu ở mọi kỹ năng có dữ liệu; duy trì nhịp luyện.', estMinutes: 60, priority: 3, repeat: 1 });
        }

        // Expand repeats, then round-robin over days by priority within each day's budget.
        const queue = cands.flatMap((c) => Array.from({ length: c.repeat }, () => c)).sort((a, b) => a.priority - b.priority);
        const budget = days.map(() => minutesPerDay);
        const placed: StudyTask[] = [];
        let dayIdx = 0;
        for (const c of queue) {
            let tries = 0;
            while (tries < days.length && budget[dayIdx] < c.estMinutes - 5) { dayIdx = (dayIdx + 1) % days.length; tries++; }
            if (tries >= days.length) {
                if (c.priority > 1) continue;
                dayIdx = budget.indexOf(Math.max(...budget)); // P1 always lands somewhere
            }
            budget[dayIdx] -= c.estMinutes;
            placed.push(this.taskRepo.create({
                learnerId, weekStart: isoDate(weekStart), scheduledFor: isoDate(days[dayIdx]),
                taskType: c.taskType, skill: c.skill, kc: c.kc, refType: c.refType, refId: null,
                titleVi: c.titleVi.slice(0, 160), reasonVi: c.reasonVi.slice(0, 240), estMinutes: c.estMinutes, priority: c.priority,
            }));
            dayIdx = (dayIdx + 1) % days.length;
        }
        return this.taskRepo.save(placed);
    }
}

function round5(n: number): number {
    return Math.round(n * 2) / 2;
}
