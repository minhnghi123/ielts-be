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

    /**
     * Fully rebuilds learner_band_profiles, learner_progress_snapshots, and
     * learner_mistakes for one learner by reading source-of-truth tables
     * (test_attempts, question_attempts, tests, writing/speaking submissions).
     * Safe to call multiple times — wipes and rebuilds each time.
     */
    async fullSyncLearnerAnalytics(learnerId: string): Promise<{
        bandProfiles: number;
        snapshots: number;
        mistakes: number;
    }> {
        const db = this.dataSource;

        // ── 1. Clear existing analytics rows for this learner ────────────────────
        await db.query(
            `DELETE FROM learner_band_profiles  WHERE learner_id = $1`,
            [learnerId],
        );
        await db.query(
            `DELETE FROM learner_progress_snapshots WHERE learner_id = $1`,
            [learnerId],
        );
        await db.query(
            `DELETE FROM learner_mistakes WHERE learner_id = $1`,
            [learnerId],
        );

        // ── 2. Band profiles — avg band per skill + overall ──────────────────────
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

        // ── 3. Progress snapshots — one per submitted attempt, ordered by date ───
        //    Each snapshot reflects the running average at submission time.
        const attemptRows: Array<{
            submitted_at: Date;
            band_score: string;
        }> = await db.query(
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

        // ── 4. Mistakes — every wrong answer across all submitted attempts ────────
        const wrongRows: Array<{
            question_id: string;
            question_type: string;
        }> = await db.query(
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

        return {
            bandProfiles: bandProfilesInserted,
            snapshots: snapshotsInserted,
            mistakes: mistakesInserted,
        };
    }

    /**
     * Syncs analytics for every learner that has at least one submitted attempt
     * but is missing at least one analytics row.  Returns per-learner results.
     */
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

    /** Lightweight on-demand backfill — only runs if analytics tables are empty for this learner. */
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
            return {
                questionType: String(row.question_type ?? 'unknown'),
                total,
                correct,
                accuracy,
                masteryLevel,
            };
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
        const examReadiness = Math.max(
            0,
            Math.min(100, Math.round((avgBand / 9) * 100)),
        );

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
}
