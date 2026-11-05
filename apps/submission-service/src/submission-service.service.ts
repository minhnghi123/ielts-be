import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { TestAttempt } from './entities/test-attempt.entity';
import { QuestionAttempt } from './entities/question-attempt.entity';
import { WritingSubmission } from './entities/writing-submission.entity';
import { SpeakingSubmission } from './entities/speaking-submission.entity';
import { WritingScore } from './entities/writing-score.entity';
import { SpeakingScore } from './entities/speaking-score.entity';
import { CreateWritingSubmissionDto } from './dto/create-writing-submission.dto';
import { CreateSpeakingSubmissionDto } from './dto/create-speaking-submission.dto';
import { CreateWritingGradingDto } from './dto/create-writing-grading.dto';
import { AiWritingGrading } from './entities/ai-writing-grading.entity';
import { RMQ_CLIENTS, RMQ_PATTERNS } from '@app/common';


/**
 * Evaluates whether the user's answer matches the correct answer rule.
 * Features:
 * - `[OR]`: splits the answer rule into alternate valid answers.
 * - `(...)`: treats the enclosed text as optional (e.g., "(FREDERICK) FLEET").
 * - Handles extraneous whitespaces and optionally case sensitivity.
 * - Handles alternative characters like slashes (e.g. A.M./AM).
 */
function evaluateAnswer(userAnswer: string, correctAnswerRule: string, caseSensitive: boolean): boolean {
    const rules = correctAnswerRule.split(/\[OR\]/i).map((r) => r.trim());

    for (const rule of rules) {
        // Prepare the rule for regex conversion
        // 1. Handle slashes as alternatives (e.g., A.M./AM -> (A\.M\.|AM))
        // Note: This is a basic implementation. For complex cases with slashes,
        // it's better to use [OR] in the rule itself.
        let processedRule = rule;

        // Convert the rule into a robust regex
        let regexPattern = processedRule
            // Escape special regex characters except parentheses and slashes
            .replace(/[-[\]{}*+?.,\\^$|#]/g, '\\$&')
            // Replace slashes with regex OR
            .replace(/\//g, '|')
            // Replace \( ... \) with an optional non-capturing group.
            // We append a ? to make it optional.
            .replace(/\((.*?)\)/g, '(?:$1)?');

        // Allow flexible whitespace matching (any run of spaces matches any whitespace)
        // Also collapse multiple spaces
        regexPattern = regexPattern.replace(/\s+/g, '\\s*');
        // Ensure exact string match from start to end (allowing surrounding whitespace)
        regexPattern = `^\\s*${regexPattern}\\s*$`;

        try {
            const regex = new RegExp(regexPattern, caseSensitive ? '' : 'i');
            if (regex.test(userAnswer)) {
                return true;
            }
        } catch (e) {
            // Fallback to basic string comparison if regex parsing fails
            const ruleText = rule.replace(/[()]/g, '');
            const compareUser = caseSensitive ? userAnswer.trim() : userAnswer.trim().toLowerCase();
            const compareRule = caseSensitive ? ruleText : ruleText.toLowerCase();
            if (compareUser === compareRule) {
                return true;
            }
        }
    }

    return false;
}

@Injectable()
export class SubmissionServiceService {
    constructor(
        @InjectRepository(TestAttempt)
        private readonly attemptRepo: Repository<TestAttempt>,
        @InjectRepository(QuestionAttempt)
        private readonly questionAttemptRepo: Repository<QuestionAttempt>,
        @InjectRepository(WritingSubmission)
        private readonly writingSubRepo: Repository<WritingSubmission>,
        @InjectRepository(SpeakingSubmission)
        private readonly speakingSubRepo: Repository<SpeakingSubmission>,
        @InjectRepository(WritingScore)
        private readonly writingScoreRepo: Repository<WritingScore>,
        @InjectRepository(SpeakingScore)
        private readonly speakingScoreRepo: Repository<SpeakingScore>,
        @InjectRepository(AiWritingGrading)
        private readonly aiWritingGradingRepo: Repository<AiWritingGrading>,
        private readonly dataSource: DataSource,
        @Inject(RMQ_CLIENTS.SUBMISSION) private readonly client: ClientProxy,
        @Inject(RMQ_CLIENTS.ANALYTICS) private readonly analyticsClient: ClientProxy,
    ) { }

    // ─── Global stats (admin dashboard) ──────────────────────────────────────────

    async getGlobalStats() {
        const result = await this.dataSource.query(`
            SELECT AVG(band_score) as avg_score
            FROM test_attempts
            WHERE band_score IS NOT NULL
        `);
        return { averageScore: result[0]?.avg_score ? Number(result[0].avg_score).toFixed(1) : "0.0" };
    }

    async getRecentActivity() {
        return await this.dataSource.query(`
            SELECT ta.id as "attemptId", ta.started_at as "startedAt", ta.submitted_at as "submittedAt", ta.band_score as "bandScore", ta.test_id as "testId",
                   a.email, t.skill, t.title as "testTitle"
            FROM test_attempts ta
            JOIN learner_profiles lp ON ta.learner_id = lp.id
            JOIN accounts a ON lp.account_id = a.id
            JOIN tests t ON ta.test_id = t.id
            ORDER BY ta.started_at DESC
            LIMIT 5
        `);
    }

    // ─── Writing Submissions ──────────────────────────────────────────────────────

    async createWritingSubmission(
        dto: CreateWritingSubmissionDto & { learnerId: string },
    ): Promise<WritingSubmission> {
        let parent: WritingSubmission | null = null;
        if (dto.parentSubmissionId) {
            parent = await this.writingSubRepo.findOne({ where: { id: dto.parentSubmissionId } });
            if (!parent || parent.learnerId !== dto.learnerId) throw new NotFoundException('Bản gốc không tồn tại hoặc không thuộc về bạn');
            if (parent.writingTaskId !== dto.writingTaskId) throw new BadRequestException('Bản sửa phải cùng đề với bản gốc');
        }
        const sub = this.writingSubRepo.create({
            learnerId: dto.learnerId,
            writingTaskId: dto.writingTaskId,
            content: dto.content,
            submittedAt: new Date(),
            gradingStatus: 'pending',
            parentSubmissionId: parent?.id ?? null,
            revisionNo: parent ? (parent.revisionNo ?? 0) + 1 : 0,
        });
        const saved = await this.writingSubRepo.save(sub);

        // Publish grading task to message broker
        this.client.emit(RMQ_PATTERNS.GRADING.GRADE_WRITING, {
            submissionId: saved.id,
            writingTaskId: saved.writingTaskId,
            learnerId: saved.learnerId,
            content: saved.content,
        });

        return saved;
    }

    async getWritingSubmission(id: string) {
        const sub = await this.writingSubRepo.findOne({ where: { id } });
        if (!sub) throw new NotFoundException(`Writing submission #${id} not found`);
        const scores = await this.writingScoreRepo.find({ where: { submissionId: id } });
        return { ...sub, scores };
    }

    /** Revision chains with band + error counts per version, plus the error-type trend over the latest gradings. */
    async getWritingProgress(learnerId: string) {
        const rows: Array<{ id: string; parent_submission_id: string | null; revision_no: number; writing_task_id: string; submitted_at: Date; grading_id: string | null; overall_band: string | null; by_type: Record<string, number> | null; diff_json: Record<string, unknown> | null }> =
            await this.writingSubRepo.query(
                `SELECT s.id, s.parent_submission_id, s.revision_no, s.writing_task_id, s.submitted_at,
                        g.id grading_id, g.overall_band, g.errors_json->'byType' by_type, g.diff_json
                 FROM writing_submissions s
                 LEFT JOIN LATERAL (SELECT * FROM ai_writing_gradings g WHERE g.submission_id = s.id ORDER BY g.graded_at DESC LIMIT 1) g ON true
                 WHERE s.learner_id = $1 ORDER BY s.submitted_at ASC`, [learnerId]);
        const byId = new Map(rows.map((r) => [r.id, r]));
        const rootOf = (r: typeof rows[number]): string => { let cur = r; const seen = new Set<string>(); while (cur.parent_submission_id && byId.has(cur.parent_submission_id) && !seen.has(cur.id)) { seen.add(cur.id); cur = byId.get(cur.parent_submission_id)!; } return cur.id; };
        const chains = new Map<string, { rootId: string; writingTaskId: string; versions: Array<{ submissionId: string; gradingId: string | null; revisionNo: number; band: number | null; byType: Record<string, number>; submittedAt: Date; diff: Record<string, unknown> | null }> }>();
        for (const r of rows) {
            const root = rootOf(r);
            if (!chains.has(root)) chains.set(root, { rootId: root, writingTaskId: r.writing_task_id, versions: [] });
            chains.get(root)!.versions.push({ submissionId: r.id, gradingId: r.grading_id, revisionNo: r.revision_no, band: r.overall_band != null ? Number(r.overall_band) : null, byType: r.by_type ?? {}, submittedAt: r.submitted_at, diff: r.diff_json });
        }
        const graded = rows.filter((r) => r.grading_id).slice(-8);
        const trend = graded.map((r) => ({ submissionId: r.id, submittedAt: r.submitted_at, band: r.overall_band != null ? Number(r.overall_band) : null, byType: r.by_type ?? {} }));
        const totals: Record<string, number> = {};
        for (const t of trend) for (const [k, v] of Object.entries(t.byType)) totals[k] = (totals[k] ?? 0) + Number(v);
        return { chains: Array.from(chains.values()).sort((a, b) => +new Date(b.versions[b.versions.length - 1].submittedAt) - +new Date(a.versions[a.versions.length - 1].submittedAt)), trend, topErrorTypes: Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([type, n]) => ({ type, n })) };
    }

    async getWritingSubmissionsByLearner(learnerId: string) {
        return this.writingSubRepo.find({
            where: { learnerId },
            order: { submittedAt: 'DESC' },
        });
    }

    // ─── AI Writing Gradings ──────────────────────────────────────────────────────

    async createWritingGrading(
        dto: CreateWritingGradingDto,
    ): Promise<AiWritingGrading> {
        const grading = this.aiWritingGradingRepo.create({
            submissionId: dto.submissionId,
            modelName: dto.modelName,
            modelVersion: dto.modelVersion,
            promptVersion: dto.promptVersion,
            taskResponse: dto.taskResponse,
            coherence: dto.coherence,
            lexical: dto.lexical,
            grammar: dto.grammar,
            overallBand: dto.overallBand,
            feedback: dto.feedback,
            confidenceScore: dto.confidenceScore,
            diffJson: (dto as { diffJson?: Record<string, any> }).diffJson ?? null,
            gradedAt: new Date(),
        });
        const saved = await this.aiWritingGradingRepo.save(grading);

        // Update the linked writing_submission grading_status to 'ai_graded' and overall_band
        if (dto.overallBand) {
            await this.dataSource.query(
                `UPDATE writing_submissions SET grading_status = 'ai_graded', overall_band = $1 WHERE id = $2`,
                [dto.overallBand, dto.submissionId],
            );
            const sub = await this.writingSubRepo.findOne({ where: { id: dto.submissionId } });
            if (sub) {
                this.analyticsClient.emit(RMQ_PATTERNS.ANALYTICS.TEST_SUBMITTED, {
                    learnerId: sub.learnerId,
                    submissionId: sub.id,
                    skill: 'writing',
                    bandScore: dto.overallBand,
                    submittedAt: sub.submittedAt,
                });
            }
        }

        return saved;
    }

    async getWritingGrading(id: string): Promise<AiWritingGrading> {
        const grading = await this.aiWritingGradingRepo.findOne({ where: { id } });
        if (!grading) throw new NotFoundException(`Writing grading #${id} not found`);
        return grading;
    }

    async getWritingGradingBySubmission(submissionId: string): Promise<AiWritingGrading | null> {
        return this.aiWritingGradingRepo.findOne({ where: { submissionId } });
    }

    // ─── Speaking Submissions ─────────────────────────────────────────────────────

    async createSpeakingSubmission(
        dto: CreateSpeakingSubmissionDto & { learnerId: string },
    ): Promise<SpeakingSubmission> {
        const sub = this.speakingSubRepo.create({
            learnerId: dto.learnerId,
            speakingPartId: dto.speakingPartId,
            audioUrl: dto.audioUrl,
            transcript: dto.transcript,
            submittedAt: new Date(),
            gradingStatus: 'pending',
        });
        const saved = await this.speakingSubRepo.save(sub);

        // Publish grading task to message broker
        this.client.emit(RMQ_PATTERNS.GRADING.GRADE_SPEAKING, {
            submissionId: saved.id,
            speakingPartId: saved.speakingPartId,
            learnerId: saved.learnerId,
            audioUrl: saved.audioUrl,
            transcript: saved.transcript,
        });

        return saved;
    }

    async getSpeakingSubmission(id: string) {
        const sub = await this.speakingSubRepo.findOne({ where: { id } });
        if (!sub) throw new NotFoundException(`Speaking submission #${id} not found`);
        const scores = await this.speakingScoreRepo.find({ where: { submissionId: id } });
        return { ...sub, scores };
    }

    async getSpeakingSubmissionsByLearner(learnerId: string) {
        return this.speakingSubRepo.find({
            where: { learnerId },
            order: { submittedAt: 'DESC' },
        });
    }
}
