import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { TestAttempt } from './entities/test-attempt.entity';
import { QuestionAttempt } from './entities/question-attempt.entity';
import { WritingSubmission } from './entities/writing-submission.entity';
import { SpeakingSubmission } from './entities/speaking-submission.entity';
import { WritingScore } from './entities/writing-score.entity';
import { SpeakingScore } from './entities/speaking-score.entity';
import { StartAttemptDto } from './dto/start-attempt.dto';
import { SaveAnswerDto } from './dto/save-answer.dto';
import { CreateWritingSubmissionDto } from './dto/create-writing-submission.dto';
import { CreateSpeakingSubmissionDto } from './dto/create-speaking-submission.dto';

// IELTS Raw Score → Band Score mapping for Reading (40 questions)
const READING_BAND_MAP: Record<number, number> = {
    40: 9.0, 39: 8.5, 38: 8.5, 37: 8.0, 36: 8.0, 35: 7.5, 34: 7.5,
    33: 7.0, 32: 7.0, 31: 6.5, 30: 6.5, 29: 6.0, 28: 6.0, 27: 5.5,
    26: 5.5, 25: 5.0, 24: 5.0, 23: 4.5, 22: 4.5, 21: 4.0, 20: 4.0,
    19: 3.5, 18: 3.5, 17: 3.0, 16: 3.0, 14: 2.5, 12: 2.0, 10: 1.5,
};

// IELTS Listening Raw Score → Band Score
const LISTENING_BAND_MAP: Record<number, number> = {
    40: 9.0, 39: 9.0, 38: 8.5, 37: 8.5, 36: 8.0, 35: 8.0, 34: 7.5,
    33: 7.5, 32: 7.0, 31: 7.0, 30: 6.5, 29: 6.5, 28: 6.0, 27: 6.0,
    26: 5.5, 25: 5.5, 24: 5.0, 23: 5.0, 22: 4.5, 21: 4.5, 18: 4.0,
    16: 3.5, 15: 3.0, 13: 2.5, 11: 2.0, 9: 1.5,
};

function rawToBand(raw: number, map: Record<number, number>): number {
    // Walk downward until we find a floor entry
    for (let i = raw; i >= 0; i--) {
        if (map[i] !== undefined) return map[i];
    }
    return 1.0;
}

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
        private readonly dataSource: DataSource,
    ) { }

    // ─── Test Attempts ────────────────────────────────────────────────────────────

    async startAttempt(dto: StartAttemptDto): Promise<TestAttempt> {
        const attempt = this.attemptRepo.create({
            learnerId: dto.learnerId,
            testId: dto.testId,
            startedAt: new Date(),
        });
        return this.attemptRepo.save(attempt);
    }

    async saveAnswer(attemptId: string, dto: SaveAnswerDto): Promise<QuestionAttempt> {
        const attempt = await this.attemptRepo.findOne({ where: { id: attemptId } });
        if (!attempt) throw new NotFoundException(`Attempt #${attemptId} not found`);
        if (attempt.submittedAt) throw new BadRequestException('Attempt already submitted');

        // Upsert: one row per (testAttemptId, questionId)
        let qa = await this.questionAttemptRepo.findOne({
            where: { testAttemptId: attemptId, questionId: dto.questionId },
        });
        if (qa) {
            qa.answer = dto.answer;
            qa.answeredAt = new Date();
        } else {
            qa = this.questionAttemptRepo.create({
                testAttemptId: attemptId,
                questionId: dto.questionId,
                answer: dto.answer,
                answeredAt: new Date(),
            });
        }
        return this.questionAttemptRepo.save(qa);
    }

    async submitAttempt(attemptId: string) {
        const attempt = await this.attemptRepo.findOne({ where: { id: attemptId } });
        if (!attempt) throw new NotFoundException(`Attempt #${attemptId} not found`);
        if (attempt.submittedAt) throw new BadRequestException('Already submitted');

        // Fetch all question attempts for this test attempt
        const questionAttempts = await this.questionAttemptRepo.find({
            where: { testAttemptId: attemptId },
        });

        // Fetch correct answers from question_answers via raw query
        // (submission-service reads this table cross-service against same DB)
        const questionIds = questionAttempts.map((qa) => qa.questionId);
        let rawScore = 0;

        if (questionIds.length > 0) {
            const answers: Array<{ question_id: string; correct_answers: string[]; case_sensitive: boolean }> =
                await this.dataSource.query(
                    `SELECT question_id, correct_answers, case_sensitive FROM question_answers WHERE question_id = ANY($1)`,
                    [questionIds],
                );

            const answerMap = new Map(answers.map((a) => [a.question_id, a]));

            for (const qa of questionAttempts) {
                const correctData = answerMap.get(qa.questionId);
                if (!correctData || !qa.answer) {
                    qa.isCorrect = false;
                } else {
                    const correct = correctData.correct_answers.some((ca) => {
                        return evaluateAnswer(qa.answer!, ca, correctData.case_sensitive);
                    });
                    qa.isCorrect = correct;
                    if (correct) rawScore++;
                }
            }

            await this.questionAttemptRepo.save(questionAttempts);
        }

        // Determine skill to pick the right band map
        const testRows: Array<{ skill: string }> = await this.dataSource.query(
            `SELECT skill FROM tests WHERE id = $1`,
            [attempt.testId],
        );
        const skill = testRows[0]?.skill ?? 'reading';
        const bandMap = skill === 'listening' ? LISTENING_BAND_MAP : READING_BAND_MAP;
        const bandScore = rawToBand(rawScore, bandMap);

        attempt.submittedAt = new Date();
        attempt.rawScore = rawScore;
        attempt.bandScore = bandScore;
        return this.attemptRepo.save(attempt);
    }

    async getAttempt(attemptId: string) {
        const attempt = await this.attemptRepo.findOne({ where: { id: attemptId } });
        if (!attempt) throw new NotFoundException(`Attempt #${attemptId} not found`);
        const questionAttempts = await this.questionAttemptRepo.find({
            where: { testAttemptId: attemptId },
        });
        return { ...attempt, questionAttempts };
    }

    async getAttemptsByLearner(learnerId: string) {
        return this.attemptRepo.find({
            where: { learnerId },
            order: { startedAt: 'DESC' },
        });
    }

    // ─── Writing Submissions ──────────────────────────────────────────────────────

    async createWritingSubmission(
        dto: CreateWritingSubmissionDto,
    ): Promise<WritingSubmission> {
        const sub = this.writingSubRepo.create({
            learnerId: dto.learnerId,
            writingTaskId: dto.writingTaskId,
            content: dto.content,
            submittedAt: new Date(),
            gradingStatus: 'pending',
        });
        return this.writingSubRepo.save(sub);
    }

    async getWritingSubmission(id: string) {
        const sub = await this.writingSubRepo.findOne({ where: { id } });
        if (!sub) throw new NotFoundException(`Writing submission #${id} not found`);
        const scores = await this.writingScoreRepo.find({ where: { submissionId: id } });
        return { ...sub, scores };
    }

    async getWritingSubmissionsByLearner(learnerId: string) {
        return this.writingSubRepo.find({
            where: { learnerId },
            order: { submittedAt: 'DESC' },
        });
    }

    // ─── Speaking Submissions ─────────────────────────────────────────────────────

    async createSpeakingSubmission(
        dto: CreateSpeakingSubmissionDto,
    ): Promise<SpeakingSubmission> {
        const sub = this.speakingSubRepo.create({
            learnerId: dto.learnerId,
            speakingPartId: dto.speakingPartId,
            audioUrl: dto.audioUrl,
            transcript: dto.transcript,
            submittedAt: new Date(),
            gradingStatus: 'pending',
        });
        return this.speakingSubRepo.save(sub);
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
