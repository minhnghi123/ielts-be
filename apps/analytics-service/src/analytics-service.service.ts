import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { LearnerBandProfile } from './entities/learner-band-profile.entity';
import { LearnerMistake } from './entities/learner-mistake.entity';
import { LearnerProgressSnapshot } from './entities/learner-progress-snapshot.entity';
import {
    UpsertBandProfileDto,
    CreateSnapshotDto,
    CreateMistakeDto,
} from './dto/analytics.dto';

type QuestionTypeMastery = {
    questionType: string;
    correct: number;
    total: number;
    accuracy: number;
    masteryLevel: 'beginner' | 'developing' | 'proficient' | 'advanced';
};

type StudyPlanTask = {
    title: string;
    focusArea: string;
    priority: 'high' | 'medium' | 'low';
    dueInDays: number;
    recommendation: string;
};

@Injectable()
export class AnalyticsServiceService {
    private readonly logger = new Logger(AnalyticsServiceService.name);

    constructor(
        @InjectRepository(LearnerBandProfile)
        private readonly bandProfileRepo: Repository<LearnerBandProfile>,
        @InjectRepository(LearnerMistake)
        private readonly mistakeRepo: Repository<LearnerMistake>,
        @InjectRepository(LearnerProgressSnapshot)
        private readonly snapshotRepo: Repository<LearnerProgressSnapshot>,
        private readonly dataSource: DataSource,
    ) { }

    // ─── Band Profiles ────────────────────────────────────────────────────────────

    async getBandProfiles(learnerId: string): Promise<LearnerBandProfile[]> {
        return this.bandProfileRepo.find({
            where: { learnerId },
            order: { skill: 'ASC' },
        });
    }

    async upsertBandProfile(dto: UpsertBandProfileDto): Promise<LearnerBandProfile> {
        let profile = await this.bandProfileRepo.findOne({
            where: { learnerId: dto.learnerId, skill: dto.skill as any },
        });

        if (profile) {
            if (dto.currentBand !== undefined) profile.currentBand = dto.currentBand;
            if (dto.targetBand !== undefined) profile.targetBand = dto.targetBand;
            profile.assessedAt = new Date();
        } else {
            profile = this.bandProfileRepo.create({
                learnerId: dto.learnerId,
                skill: dto.skill as any,
                currentBand: dto.currentBand,
                targetBand: dto.targetBand,
                assessedAt: new Date(),
            });
        }

        return this.bandProfileRepo.save(profile);
    }

    // ─── Progress Snapshots ───────────────────────────────────────────────────────

    async getProgressSnapshots(learnerId: string): Promise<LearnerProgressSnapshot[]> {
        return this.snapshotRepo.find({
            where: { learnerId },
            order: { snapshotAt: 'ASC' },
        });
    }

    async createSnapshot(dto: CreateSnapshotDto): Promise<LearnerProgressSnapshot> {
        const snapshot = this.snapshotRepo.create({
            learnerId: dto.learnerId,
            overallBand: dto.overallBand,
            snapshotAt: new Date(),
        });
        return this.snapshotRepo.save(snapshot);
    }

    // ─── Mistakes ─────────────────────────────────────────────────────────────────

    async getMistakes(learnerId: string): Promise<LearnerMistake[]> {
        return this.mistakeRepo.find({
            where: { learnerId },
            order: { createdAt: 'DESC' },
        });
    }

    async recordMistake(dto: CreateMistakeDto): Promise<LearnerMistake> {
        const mistake = this.mistakeRepo.create({
            learnerId: dto.learnerId,
            questionId: dto.questionId,
            mistakeType: dto.mistakeType,
            createdAt: new Date(),
        });
        return this.mistakeRepo.save(mistake);
    }

    // ─── Full sync ────────────────────────────────────────────────────────────────

    async fullSyncLearnerAnalytics(learnerId: string): Promise<{
        bandProfiles: number;
        snapshots: number;
        mistakes: number;
    }> {
        const db = this.dataSource;

        await db.query(`DELETE FROM learner_band_profiles  WHERE learner_id = $1`, [learnerId]);
        await db.query(`DELETE FROM learner_progress_snapshots WHERE learner_id = $1`, [learnerId]);
        await db.query(`DELETE FROM learner_mistakes WHERE learner_id = $1`, [learnerId]);

        const skillRows: Array<{ skill: string; avg_band: string }> = await db.query(
            `
            SELECT t.skill, AVG(ta.band_score)::float AS avg_band
            FROM   test_attempts ta
            INNER  JOIN tests t ON t.id = ta.test_id
            WHERE  ta.learner_id = $1
              AND  ta.submitted_at IS NOT NULL
              AND  ta.band_score   IS NOT NULL
            GROUP  BY t.skill
            `,
            [learnerId],
        );

        let bandProfilesInserted = 0;
        const skillBands: number[] = [];

        for (const row of skillRows) {
            const band = Number(Number(row.avg_band ?? 0).toFixed(1));
            if (!band) continue;
            skillBands.push(band);
            await this.upsertBandProfile({ learnerId, skill: row.skill, currentBand: band });
            bandProfilesInserted++;
        }

        if (skillBands.length > 0) {
            const overallBand = Number(
                (skillBands.reduce((s, b) => s + b, 0) / skillBands.length).toFixed(1),
            );
            await this.upsertBandProfile({ learnerId, skill: 'overall', currentBand: overallBand });
            bandProfilesInserted++;
        }

        const attemptRows: Array<{ submitted_at: Date; band_score: string }> = await db.query(
            `
            SELECT ta.submitted_at, ta.band_score
            FROM   test_attempts ta
            WHERE  ta.learner_id  = $1
              AND  ta.submitted_at IS NOT NULL
              AND  ta.band_score   IS NOT NULL
            ORDER  BY ta.submitted_at ASC
            `,
            [learnerId],
        );

        let snapshotsInserted = 0;
        const bandAccum: number[] = [];

        for (const row of attemptRows) {
            bandAccum.push(Number(row.band_score));
            const runningAvg = Number(
                (bandAccum.reduce((s, b) => s + b, 0) / bandAccum.length).toFixed(1),
            );
            const snap = this.snapshotRepo.create({
                learnerId,
                overallBand: runningAvg,
                snapshotAt: new Date(row.submitted_at),
            });
            await this.snapshotRepo.save(snap);
            snapshotsInserted++;
        }

        const wrongRows: Array<{ question_id: string; question_type: string }> = await db.query(
            `
            SELECT qa.question_id, q.question_type
            FROM   question_attempts qa
            INNER  JOIN test_attempts ta ON ta.id  = qa.test_attempt_id
            INNER  JOIN questions      q  ON q.id  = qa.question_id
            WHERE  ta.learner_id   = $1
              AND  ta.submitted_at IS NOT NULL
              AND  qa.is_correct   = false
            `,
            [learnerId],
        );

        let mistakesInserted = 0;
        for (const row of wrongRows) {
            const mistake = this.mistakeRepo.create({
                learnerId,
                questionId: row.question_id,
                mistakeType: row.question_type ?? 'wrong_answer',
                createdAt: new Date(),
            });
            await this.mistakeRepo.save(mistake);
            mistakesInserted++;
        }

        this.logger.log(
            `Sync done for learner ${learnerId}: ` +
            `${bandProfilesInserted} band profiles, ${snapshotsInserted} snapshots, ${mistakesInserted} mistakes`,
        );

        return { bandProfiles: bandProfilesInserted, snapshots: snapshotsInserted, mistakes: mistakesInserted };
    }

    async syncAllLearnersAnalytics(): Promise<{
        synced: number;
        results: Array<{ learnerId: string; bandProfiles: number; snapshots: number; mistakes: number }>;
    }> {
        const learnerRows: Array<{ learner_id: string }> = await this.dataSource.query(
            `
            SELECT DISTINCT ta.learner_id
            FROM   test_attempts ta
            WHERE  ta.submitted_at IS NOT NULL
              AND  ta.band_score   IS NOT NULL
            `,
        );

        const results: Array<{ learnerId: string; bandProfiles: number; snapshots: number; mistakes: number }> = [];

        for (const { learner_id } of learnerRows) {
            try {
                const counts = await this.fullSyncLearnerAnalytics(learner_id);
                results.push({ learnerId: learner_id, ...counts });
            } catch (err) {
                this.logger.warn(`Sync failed for learner ${learner_id}: ${String(err)}`);
            }
        }

        return { synced: results.length, results };
    }

    // ─── Dashboard Summary ────────────────────────────────────────────────────────

    private async backfillIfEmpty(learnerId: string): Promise<void> {
        const profileCount = await this.bandProfileRepo.count({ where: { learnerId } });
        const snapshotCount = await this.snapshotRepo.count({ where: { learnerId } });
        if (profileCount === 0 || snapshotCount === 0) {
            await this.fullSyncLearnerAnalytics(learnerId);
        }
    }

    private async getAttemptStats(learnerId: string): Promise<{
        totalAttempts: number;
        averageBand: number;
        practiceHours: number;
    }> {
        const rows = await this.snapshotRepo.query(
            `
            SELECT
                COUNT(*)::int AS total_attempts,
                COALESCE(AVG(ta.band_score), 0)::float AS average_band,
                COALESCE(
                    SUM(
                        EXTRACT(
                            EPOCH FROM (
                                COALESCE(ta.submitted_at, ta.started_at) - ta.started_at
                            )
                        )
                    ) / 3600,
                    0
                )::float AS practice_hours
            FROM test_attempts ta
            WHERE ta.learner_id = $1
            `,
            [learnerId],
        );

        const row = rows?.[0] ?? {};
        return {
            totalAttempts: Number(row.total_attempts ?? 0),
            averageBand: Number(row.average_band ?? 0),
            practiceHours: Math.max(0, Number(row.practice_hours ?? 0)),
        };
    }

    private async getQuestionTypeMastery(learnerId: string): Promise<QuestionTypeMastery[]> {
        const rows = await this.snapshotRepo.query(
            `
            SELECT
                q.question_type AS question_type,
                COUNT(*)::int AS total,
                SUM(CASE WHEN qa.is_correct = true THEN 1 ELSE 0 END)::int AS correct
            FROM question_attempts qa
            INNER JOIN test_attempts ta ON ta.id = qa.test_attempt_id
            INNER JOIN questions q ON q.id = qa.question_id
            WHERE ta.learner_id = $1
              AND ta.submitted_at IS NOT NULL
              AND qa.is_correct IS NOT NULL
            GROUP BY q.question_type
            ORDER BY total DESC
            `,
            [learnerId],
        );

        return (rows ?? []).map((row) => {
            const total = Number(row.total ?? 0);
            const correct = Number(row.correct ?? 0);
            const accuracy = total > 0 ? Number(((correct / total) * 100).toFixed(1)) : 0;
            const masteryLevel: QuestionTypeMastery['masteryLevel'] =
                accuracy >= 85 ? 'advanced'
                    : accuracy >= 70 ? 'proficient'
                        : accuracy >= 50 ? 'developing'
                            : 'beginner';
            return { questionType: String(row.question_type ?? 'unknown'), total, correct, accuracy, masteryLevel };
        });
    }

    private buildAdaptiveStudyPlan(
        bandProfiles: LearnerBandProfile[],
        mastery: QuestionTypeMastery[],
    ): StudyPlanTask[] {
        const tasks: StudyPlanTask[] = [];
        const sortedSkills = [...bandProfiles]
            .filter((p) => p.skill !== 'overall')
            .sort((a, b) => Number(a.currentBand ?? 0) - Number(b.currentBand ?? 0));

        for (const profile of sortedSkills.slice(0, 2)) {
            const current = Number(profile.currentBand ?? 0);
            const target = Number(profile.targetBand ?? Math.min(9, current + 0.5));
            tasks.push({
                title: `${profile.skill} band boost`,
                focusArea: profile.skill,
                priority: 'high',
                dueInDays: 7,
                recommendation: `Run 3 focused ${profile.skill} sessions this week and move from band ${current.toFixed(1)} toward ${target.toFixed(1)}.`,
            });
        }

        const weakestQuestionTypes = mastery
            .filter((m) => m.total >= 3)
            .sort((a, b) => a.accuracy - b.accuracy)
            .slice(0, 3);

        for (const weak of weakestQuestionTypes) {
            tasks.push({
                title: `Improve ${weak.questionType}`,
                focusArea: weak.questionType,
                priority: weak.accuracy < 50 ? 'high' : 'medium',
                dueInDays: weak.accuracy < 50 ? 5 : 10,
                recommendation: `Current accuracy ${weak.accuracy}%. Complete 2 drills/day and review mistakes before the next full test.`,
            });
        }

        if (tasks.length === 0) {
            tasks.push({
                title: 'Build consistency',
                focusArea: 'overall',
                priority: 'medium',
                dueInDays: 7,
                recommendation: 'Take at least 2 timed practice tests this week and review all wrong answers.',
            });
        }

        return tasks;
    }

    private async getRubricBreakdown(learnerId: string): Promise<{
        writing: null | {
            submissionId: string;
            submittedAt: string;
            overallBand: number | null;
            criteria: Array<{ criterion: string; band: number; feedback: string | null }>;
        };
        speaking: null | {
            submissionId: string;
            submittedAt: string;
            overallBand: number | null;
            criteria: Array<{ criterion: string; band: number; feedback: string | null }>;
        };
    }> {
        const writingRows = await this.snapshotRepo.query(
            `
            SELECT
                wsub.id AS submission_id,
                wsub.submitted_at,
                wsub.overall_band,
                ws.criterion,
                ws.band,
                ws.feedback
            FROM writing_submissions wsub
            INNER JOIN writing_scores ws ON ws.submission_id = wsub.id
            WHERE wsub.learner_id = $1
              AND wsub.submitted_at = (
                  SELECT MAX(submitted_at)
                  FROM writing_submissions
                  WHERE learner_id = $1
              )
            ORDER BY ws.criterion ASC
            `,
            [learnerId],
        );

        const speakingRows = await this.snapshotRepo.query(
            `
            SELECT
                ssub.id AS submission_id,
                ssub.submitted_at,
                ssub.overall_band,
                ss.criterion,
                ss.band,
                ss.feedback
            FROM speaking_submissions ssub
            INNER JOIN speaking_scores ss ON ss.submission_id = ssub.id
            WHERE ssub.learner_id = $1
              AND ssub.submitted_at = (
                  SELECT MAX(submitted_at)
                  FROM speaking_submissions
                  WHERE learner_id = $1
              )
            ORDER BY ss.criterion ASC
            `,
            [learnerId],
        );

        const writing = writingRows.length
            ? {
                submissionId: String(writingRows[0].submission_id),
                submittedAt: new Date(writingRows[0].submitted_at).toISOString(),
                overallBand: writingRows[0].overall_band != null ? Number(writingRows[0].overall_band) : null,
                criteria: writingRows.map((row: any) => ({
                    criterion: String(row.criterion),
                    band: Number(row.band),
                    feedback: row.feedback ? String(row.feedback) : null,
                })),
            }
            : null;

        const speaking = speakingRows.length
            ? {
                submissionId: String(speakingRows[0].submission_id),
                submittedAt: new Date(speakingRows[0].submitted_at).toISOString(),
                overallBand: speakingRows[0].overall_band != null ? Number(speakingRows[0].overall_band) : null,
                criteria: speakingRows.map((row: any) => ({
                    criterion: String(row.criterion),
                    band: Number(row.band),
                    feedback: row.feedback ? String(row.feedback) : null,
                })),
            }
            : null;

        return { writing, speaking };
    }

    async getDashboardSummary(learnerId: string) {
        await this.backfillIfEmpty(learnerId);

        const [bandProfiles, snapshots, mistakes, attemptStats, mastery, rubricBreakdown] = await Promise.all([
            this.getBandProfiles(learnerId),
            this.getProgressSnapshots(learnerId),
            this.getMistakes(learnerId),
            this.getAttemptStats(learnerId),
            this.getQuestionTypeMastery(learnerId),
            this.getRubricBreakdown(learnerId),
        ]);

        const latestSnapshot = snapshots[snapshots.length - 1];
        const mistakesByType = mistakes.reduce(
            (acc, m) => {
                const type = m.mistakeType || 'unknown';
                acc[type] = (acc[type] || 0) + 1;
                return acc;
            },
            {} as Record<string, number>,
        );

        const adaptiveStudyPlan = this.buildAdaptiveStudyPlan(bandProfiles, mastery);
        const avgBand = Number(attemptStats.averageBand ?? 0);
        const examReadiness = Math.max(0, Math.min(100, Math.round((avgBand / 9) * 100)));

        return {
            bandProfiles,
            latestOverallBand: latestSnapshot?.overallBand ?? null,
            progressHistory: snapshots,
            totalMistakes: mistakes.length,
            mistakesByType,
            totalAttempts: attemptStats.totalAttempts,
            averageBand: avgBand,
            practiceHours: Number(attemptStats.practiceHours.toFixed(1)),
            examReadiness,
            questionTypeMastery: mastery,
            adaptiveStudyPlan,
            rubricBreakdown,
        };
    }

    // ─── Admin Global Stats ───────────────────────────────────────────────────────

    async getAdminGlobalStats(): Promise<{
        totalLearners: number;
        totalAttempts: number;
        completedAttempts: number;
        averageBand: number;
        attemptsPerDay: Array<{ date: string; count: number }>;
        bandDistribution: Array<{ range: string; count: number; color: string }>;
        skillBreakdown: Array<{ skill: string; avgBand: number; totalAttempts: number }>;
        topLearners: Array<{ learnerId: string; email: string; avgBand: number; totalAttempts: number }>;
        recentActivity: Array<{ email: string; testTitle: string; bandScore: number | null; submittedAt: string }>;
    }> {
        const db = this.dataSource;

        // Total learners
        const [learnerCountRow] = await db.query(`SELECT COUNT(*)::int AS cnt FROM learner_profiles`);
        const totalLearners = Number(learnerCountRow?.cnt ?? 0);

        // Total & completed attempts + avg band
        const [attemptsRow] = await db.query(`
            SELECT
                COUNT(*)::int AS total,
                COUNT(submitted_at)::int AS completed,
                COALESCE(AVG(band_score) FILTER (WHERE band_score IS NOT NULL), 0)::float AS avg_band
            FROM test_attempts
        `);
        const totalAttempts = Number(attemptsRow?.total ?? 0);
        const completedAttempts = Number(attemptsRow?.completed ?? 0);
        const averageBand = Number(Number(attemptsRow?.avg_band ?? 0).toFixed(2));

        // Attempts per day — last 30 days
        const attemptsPerDayRows: Array<{ day: string; cnt: string }> = await db.query(`
            SELECT
                TO_CHAR(started_at::date, 'YYYY-MM-DD') AS day,
                COUNT(*)::int AS cnt
            FROM test_attempts
            WHERE started_at >= NOW() - INTERVAL '30 days'
            GROUP BY day
            ORDER BY day ASC
        `);
        const attemptsPerDay = attemptsPerDayRows.map((r) => ({
            date: r.day,
            count: Number(r.cnt),
        }));

        // Band distribution buckets
        const bandDistRows: Array<{ bucket: string; cnt: string }> = await db.query(`
            SELECT
                CASE
                    WHEN band_score < 4   THEN '0–4'
                    WHEN band_score < 5.5 THEN '4–5.5'
                    WHEN band_score < 6.5 THEN '5.5–6.5'
                    WHEN band_score < 7.5 THEN '6.5–7.5'
                    ELSE '7.5–9'
                END AS bucket,
                COUNT(*)::int AS cnt
            FROM test_attempts
            WHERE band_score IS NOT NULL
              AND submitted_at IS NOT NULL
            GROUP BY bucket
            ORDER BY MIN(band_score)
        `);
        const bucketColors: Record<string, string> = {
            '0–4': '#f87171', '4–5.5': '#fb923c', '5.5–6.5': '#facc15',
            '6.5–7.5': '#4ade80', '7.5–9': '#34d399',
        };
        const bandDistribution = bandDistRows.map((r) => ({
            range: r.bucket,
            count: Number(r.cnt),
            color: bucketColors[r.bucket] ?? '#94a3b8',
        }));

        // Skill breakdown
        const skillRows: Array<{ skill: string; avg_band: string; total: string }> = await db.query(`
            SELECT
                t.skill,
                COALESCE(AVG(ta.band_score), 0)::float AS avg_band,
                COUNT(*)::int AS total
            FROM test_attempts ta
            INNER JOIN tests t ON t.id = ta.test_id
            WHERE ta.submitted_at IS NOT NULL
              AND ta.band_score IS NOT NULL
            GROUP BY t.skill
            ORDER BY t.skill
        `);
        const skillBreakdown = skillRows.map((r) => ({
            skill: r.skill,
            avgBand: Number(Number(r.avg_band).toFixed(2)),
            totalAttempts: Number(r.total),
        }));

        // Top 5 learners by avg band (min 1 completed attempt)
        const topLearnerRows: Array<{ learner_id: string; email: string; avg_band: string; total: string }> =
            await db.query(`
            SELECT
                ta.learner_id,
                a.email,
                AVG(ta.band_score)::float AS avg_band,
                COUNT(*)::int AS total
            FROM test_attempts ta
            INNER JOIN learner_profiles lp ON lp.id = ta.learner_id
            INNER JOIN accounts a ON a.id = lp.account_id
            WHERE ta.submitted_at IS NOT NULL
              AND ta.band_score IS NOT NULL
            GROUP BY ta.learner_id, a.email
            HAVING COUNT(*) >= 1
            ORDER BY avg_band DESC
            LIMIT 5
        `);
        const topLearners = topLearnerRows.map((r) => ({
            learnerId: r.learner_id,
            email: r.email,
            avgBand: Number(Number(r.avg_band).toFixed(2)),
            totalAttempts: Number(r.total),
        }));

        // Recent 10 submissions
        const recentRows: Array<{ email: string; title: string; band_score: string | null; submitted_at: string }> =
            await db.query(`
            SELECT
                a.email,
                t.title,
                ta.band_score,
                ta.submitted_at
            FROM test_attempts ta
            INNER JOIN tests t ON t.id = ta.test_id
            INNER JOIN learner_profiles lp ON lp.id = ta.learner_id
            INNER JOIN accounts a ON a.id = lp.account_id
            WHERE ta.submitted_at IS NOT NULL
            ORDER BY ta.submitted_at DESC
            LIMIT 10
        `);
        const recentActivity = recentRows.map((r) => ({
            email: r.email,
            testTitle: r.title,
            bandScore: r.band_score != null ? Number(r.band_score) : null,
            submittedAt: new Date(r.submitted_at).toISOString(),
        }));

        return {
            totalLearners,
            totalAttempts,
            completedAttempts,
            averageBand,
            attemptsPerDay,
            bandDistribution,
            skillBreakdown,
            topLearners,
            recentActivity,
        };
    }
}
