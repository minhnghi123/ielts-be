import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, DataSource } from 'typeorm';
import { Test } from './entities/test.entity';
import { Section } from './entities/section.entity';
import { QuestionGroup } from './entities/question-group.entity';
import { Question } from './entities/question.entity';
import { QuestionAnswer } from './entities/question-answer.entity';
import { WritingTask } from './entities/writing-task.entity';
import { SpeakingPart } from './entities/speaking-part.entity';
import { TestAttempt } from './entities/test-attempt.entity';
import { QuestionAttempt } from './entities/question-attempt.entity';
import { SubmitTestAttemptDto } from './dto/submit-test.dto';
import { CreateTestDto } from './dto/create-test.dto';
import { CreateSectionDto } from './dto/create-section.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { CreateWritingTaskDto } from './dto/create-writing-task.dto';
import { CreateSpeakingPartDto } from './dto/create-speaking-part.dto';
import { QueryTestsDto } from './dto/query-tests.dto';
import { CreateManualTestDto } from './dto/create-manual-test.dto';

@Injectable()
export class TestServiceService {
    constructor(
        @InjectRepository(Test)
        private readonly testRepo: Repository<Test>,
        @InjectRepository(Section)
        private readonly sectionRepo: Repository<Section>,
        @InjectRepository(QuestionGroup)
        private readonly questionGroupRepo: Repository<QuestionGroup>,
        @InjectRepository(Question)
        private readonly questionRepo: Repository<Question>,
        @InjectRepository(QuestionAnswer)
        private readonly answerRepo: Repository<QuestionAnswer>,
        @InjectRepository(WritingTask)
        private readonly writingTaskRepo: Repository<WritingTask>,
        @InjectRepository(SpeakingPart)
        private readonly speakingPartRepo: Repository<SpeakingPart>,
        @InjectRepository(TestAttempt)
        private readonly attemptRepo: Repository<TestAttempt>,
        @InjectRepository(QuestionAttempt)
        private readonly questionAttemptRepo: Repository<QuestionAttempt>,
        private readonly dataSource: DataSource,
    ) { }

    // ─── Tests ───────────────────────────────────────────────────────────────────

    async getTests(query: QueryTestsDto) {
        const { skill, isMock, page, limit } = query;
        const where: FindOptionsWhere<Test> = {};
        if (skill) where.skill = skill as any;
        if (isMock !== undefined) where.isMock = isMock;
        console.log(typeof page, typeof limit);
        const [data, total] = await this.testRepo.findAndCount({
            where,
            order: { createdAt: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        });

        return {
            data,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    async getTestById(id: string) {
        // Step 1: fetch the test's skill first (lightweight)
        const meta = await this.testRepo.findOne({ where: { id }, select: ['id', 'skill'] });
        if (!meta) throw new NotFoundException(`Test #${id} not found`);

        // Step 2: load only the relations relevant to this skill
        const relations: string[] = [];
        const order: Record<string, any> = {};

        if (meta.skill === 'reading' || meta.skill === 'listening') {
            relations.push(
                'sections',
                'sections.questionGroups',
                'sections.questionGroups.questions',
                'sections.questionGroups.questions.answer',
            );
            order['sections'] = { sectionOrder: 'ASC' };
        } else if (meta.skill === 'writing') {
            relations.push('writingTasks');
            order['writingTasks'] = { taskNumber: 'ASC' };
        } else if (meta.skill === 'speaking') {
            relations.push('speakingParts');
            order['speakingParts'] = { partNumber: 'ASC' };
        }

        const test = await this.testRepo.findOne({ where: { id }, relations, order });
        if (!test) throw new NotFoundException(`Test #${id} not found`);
        return test;
    }

    async createTest(dto: CreateTestDto): Promise<Test> {
        const test = this.testRepo.create({
            skill: dto.skill as any,
            title: dto.title,
            isMock: dto.isMock,
            createdBy: dto.createdBy,
        });
        return this.testRepo.save(test);
    }

    async createManualTest(dto: CreateManualTestDto): Promise<Test> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // 1. Create Test
            const test = queryRunner.manager.create(Test, {
                skill: dto.skill,
                title: dto.title,
                isMock: dto.isMock,
                createdBy: dto.createdBy,
            });
            const savedTest = await queryRunner.manager.save(Test, test);

            // Validate test structure dynamically (Relaxed for testing framework)
            if (
                dto.skill === 'listening' &&
                (!dto.sections || dto.sections.length < 1)
            ) {
                throw new BadRequestException(
                    'Listening tests must have at least 1 section',
                );
            }
            if (
                dto.skill === 'reading' &&
                (!dto.sections || dto.sections.length < 1)
            ) {
                throw new BadRequestException(
                    'Reading tests must have at least 1 passage (section)',
                );
            }

            // 2. Create Sections
            if (dto.sections && dto.sections.length > 0) {
                for (const sectionDto of dto.sections) {
                    const section = queryRunner.manager.create(Section, {
                        testId: savedTest.id,
                        sectionOrder: sectionDto.sectionOrder,
                        passage: sectionDto.passage,
                        audioUrl: sectionDto.audioUrl,
                    });
                    const savedSection = await queryRunner.manager.save(Section, section);

                    // 3. Create Question Groups
                    if (sectionDto.groups && sectionDto.groups.length > 0) {
                        for (const groupDto of sectionDto.groups) {
                            const group = queryRunner.manager.create(QuestionGroup, {
                                sectionId: savedSection.id,
                                groupOrder: groupDto.groupOrder,
                                instructions: groupDto.instructions,
                            });
                            const savedGroup = await queryRunner.manager.save(
                                QuestionGroup,
                                group,
                            );

                            // 4. Create Questions & Answers
                            if (groupDto.questions && groupDto.questions.length > 0) {
                                for (const questionDto of groupDto.questions) {
                                    const question = queryRunner.manager.create(Question, {
                                        questionGroupId: savedGroup.id,
                                        questionOrder: questionDto.questionOrder,
                                        questionType: questionDto.questionType,
                                        questionText: questionDto.questionText,
                                        config: questionDto.config,
                                        explanation: questionDto.explanation,
                                    });
                                    const savedQuestion = await queryRunner.manager.save(
                                        Question,
                                        question,
                                    );

                                    if (questionDto.answer) {
                                        const answer = queryRunner.manager.create(QuestionAnswer, {
                                            questionId: savedQuestion.id,
                                            correctAnswers: questionDto.answer.correctAnswers,
                                            caseSensitive: questionDto.answer.caseSensitive,
                                        });
                                        await queryRunner.manager.save(QuestionAnswer, answer);
                                    }
                                }
                            }
                        }
                    }
                }
            }

            await queryRunner.commitTransaction();
            return this.getTestById(savedTest.id);
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async updateTest(id: string, dto: Partial<CreateTestDto>): Promise<Test> {
        await this.testRepo.update(id, {
            ...(dto.skill && { skill: dto.skill as any }),
            ...(dto.title && { title: dto.title }),
            ...(dto.isMock !== undefined && { isMock: dto.isMock }),
        });
        return this.getTestById(id);
    }

    async deleteTest(id: string): Promise<void> {
        const test = await this.testRepo.findOne({ where: { id } });
        if (!test) throw new NotFoundException(`Test #${id} not found`);
        await this.testRepo.remove(test);
    }

    // ─── Sections ─────────────────────────────────────────────────────────────────

    async getSectionsByTestId(testId: string): Promise<Section[]> {
        return this.sectionRepo.find({
            where: { testId },
            relations: [
                'questionGroups',
                'questionGroups.questions',
                'questionGroups.questions.answer',
            ],
            order: { sectionOrder: 'ASC' },
        });
    }

    async createSection(testId: string, dto: CreateSectionDto): Promise<Section> {
        await this.getTestById(testId);
        const section = this.sectionRepo.create({ ...dto, testId });
        return this.sectionRepo.save(section);
    }

    async updateSection(
        sectionId: string,
        dto: Partial<CreateSectionDto>,
    ): Promise<Section> {
        const section = await this.sectionRepo.findOne({
            where: { id: sectionId },
        });
        if (!section)
            throw new NotFoundException(`Section #${sectionId} not found`);
        Object.assign(section, dto);
        return this.sectionRepo.save(section);
    }

    async deleteSection(sectionId: string): Promise<void> {
        const section = await this.sectionRepo.findOne({
            where: { id: sectionId },
        });
        if (!section)
            throw new NotFoundException(`Section #${sectionId} not found`);
        await this.sectionRepo.remove(section);
    }

    // ─── Question Groups ──────────────────────────────────────────────────────────

    async createGroup(sectionId: string, dto: CreateGroupDto): Promise<QuestionGroup> {
        const section = await this.sectionRepo.findOne({ where: { id: sectionId } });
        if (!section) throw new NotFoundException(`Section #${sectionId} not found`);
        const group = this.questionGroupRepo.create({
            sectionId,
            groupOrder: dto.groupOrder,
            instructions: dto.instructions,
        });
        return this.questionGroupRepo.save(group);
    }

    async updateGroup(groupId: string, dto: Partial<CreateGroupDto>): Promise<QuestionGroup> {
        const group = await this.questionGroupRepo.findOne({ where: { id: groupId } });
        if (!group) throw new NotFoundException(`QuestionGroup #${groupId} not found`);
        if (dto.groupOrder !== undefined) group.groupOrder = dto.groupOrder;
        if (dto.instructions !== undefined) group.instructions = dto.instructions;
        return this.questionGroupRepo.save(group);
    }

    async deleteGroup(groupId: string): Promise<void> {
        const group = await this.questionGroupRepo.findOne({ where: { id: groupId } });
        if (!group) throw new NotFoundException(`QuestionGroup #${groupId} not found`);
        await this.questionGroupRepo.remove(group);
    }

    // ─── Questions ────────────────────────────────────────────────────────────────

    async getQuestionsByGroupId(questionGroupId: string): Promise<Question[]> {
        return this.questionRepo.find({
            where: { questionGroupId },
            relations: ['answer'],
            order: { questionOrder: 'ASC' },
        });
    }

    async createQuestion(
        questionGroupId: string,
        dto: CreateQuestionDto,
    ): Promise<Question | null> {
        const group = await this.questionGroupRepo.findOne({ where: { id: questionGroupId } });
        if (!group) throw new NotFoundException(`QuestionGroup #${questionGroupId} not found`);

        const question = this.questionRepo.create({
            questionGroupId,
            questionOrder: dto.questionOrder,
            questionType: dto.questionType,
            questionText: dto.questionText,
            config: dto.config,
            explanation: dto.explanation,
        });
        const savedQuestion = await this.questionRepo.save(question);

        const answer = this.answerRepo.create({
            questionId: savedQuestion.id,
            correctAnswers: dto.answer.correctAnswers,
            caseSensitive: dto.answer.caseSensitive,
        });
        await this.answerRepo.save(answer);

        return this.questionRepo.findOne({
            where: { id: savedQuestion.id },
            relations: ['answer'],
        });
    }

    async updateQuestion(
        questionId: string,
        dto: Partial<CreateQuestionDto>,
    ): Promise<Question | null> {
        const question = await this.questionRepo.findOne({
            where: { id: questionId },
            relations: ['answer'],
        });
        if (!question)
            throw new NotFoundException(`Question #${questionId} not found`);

        if (dto.questionText) question.questionText = dto.questionText;
        if (dto.questionType) question.questionType = dto.questionType;
        if (dto.config) question.config = dto.config;
        if (dto.explanation !== undefined) question.explanation = dto.explanation;
        if (dto.questionOrder) question.questionOrder = dto.questionOrder;

        await this.questionRepo.save(question);

        if (dto.answer) {
            if (question.answer) {
                Object.assign(question.answer, dto.answer);
                await this.answerRepo.save(question.answer);
            } else {
                // No answer record existed (e.g. old question saved without one) — create it now
                const newAnswer = this.answerRepo.create({
                    questionId: question.id,
                    correctAnswers: dto.answer.correctAnswers,
                    caseSensitive: dto.answer.caseSensitive ?? false,
                });
                await this.answerRepo.save(newAnswer);
            }
        }

        return this.questionRepo.findOne({
            where: { id: questionId },
            relations: ['answer'],
        });
    }

    async deleteQuestion(questionId: string): Promise<void> {
        const question = await this.questionRepo.findOne({
            where: { id: questionId },
        });
        if (!question)
            throw new NotFoundException(`Question #${questionId} not found`);
        await this.questionRepo.remove(question);
    }

    // ─── Writing Tasks ────────────────────────────────────────────────────────────

    async getWritingTasksByTestId(testId: string): Promise<WritingTask[]> {
        return this.writingTaskRepo.find({
            where: { testId },
            order: { taskNumber: 'ASC' },
        });
    }

    async createWritingTask(
        testId: string,
        dto: CreateWritingTaskDto,
    ): Promise<WritingTask> {
        await this.getTestById(testId);
        const task = this.writingTaskRepo.create({ ...dto, testId });
        return this.writingTaskRepo.save(task);
    }

    // ─── Speaking Parts ──────────────────────────────────────────────────────────

    async getSpeakingPartsByTestId(testId: string): Promise<SpeakingPart[]> {
        return this.speakingPartRepo.find({
            where: { testId },
            order: { partNumber: 'ASC' },
        });
    }

    async createSpeakingPart(
        testId: string,
        dto: CreateSpeakingPartDto,
    ): Promise<SpeakingPart> {
        await this.getTestById(testId);
        const part = this.speakingPartRepo.create({ ...dto, testId });
        return this.speakingPartRepo.save(part);
    }

    // ─── Test Attempts (Joining & Submitting) ──────────────────────────────────

    async startAttempt(testId: string, learnerId: string): Promise<TestAttempt> {
        const test = await this.getTestById(testId);
        const attempt = this.attemptRepo.create({
            testId: test.id,
            learnerId,
        });
        return this.attemptRepo.save(attempt);
    }

    async getAttemptById(attemptId: string): Promise<TestAttempt> {
        const attempt = await this.attemptRepo.findOne({
            where: { id: attemptId },
            relations: [
                'questionAttempts',
                'questionAttempts.question',
                'questionAttempts.question.answer',
                'test',
            ],
        });
        if (!attempt) throw new NotFoundException(`TestAttempt #${attemptId} not found`);
        return attempt;
    }

    async getAttemptsByLearnerId(learnerId: string): Promise<TestAttempt[]> {
        return this.attemptRepo.find({
            where: { learnerId },
            relations: ['test'],
            order: { startedAt: 'DESC' },
        });
    }

    // ─── Answer grading helpers ─────────────────────────────────────────────────

    /**
     * Extract the raw answer strings stored in the DB.
     * Handles PostgreSQL text[] (already a JS array), JSON strings, and plain strings.
     */
    private extractRawAnswers(raw: any): string[] {
        if (!raw) return [];
        if (Array.isArray(raw)) {
            return raw.map(ca =>
                typeof ca === 'object' && ca !== null && ca.value !== undefined
                    ? String(ca.value)
                    : String(ca),
            ).filter(Boolean);
        }
        if (typeof raw === 'string') {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
            } catch { /* fall through */ }
            return [raw];
        }
        return [];
    }

    /**
     * Expand one IELTS answer template into every acceptable string.
     *
     * Rules:
     *   [OR]   — top-level separator between completely different correct answers
     *            "MIDNIGHT [OR] 12(.00) A.M./AM"
     *   (text) — text inside is optional; generate forms with and without it
     *            "(FREDERICK) FLEET" → "FLEET" | "FREDERICK FLEET"
     *   a/b    — slash inside a whitespace token means either token value is fine
     *            "A.M./AM" → "A.M." | "AM"
     *            "SEVEN (PEOPLE/STUDENTS)" → "SEVEN" | "SEVEN PEOPLE" | "SEVEN STUDENTS"
     */
    private expandAnswerTemplate(template: string, caseSensitive: boolean): string[] {
        const topAlts = template.split(/\[OR\]/i).map(s => s.trim());
        const results = new Set<string>();
        for (const alt of topAlts) {
            this.expandOptionalGroups(alt, caseSensitive).forEach(s => results.add(s));
        }
        return Array.from(results).filter(Boolean);
    }

    /** Expand all (…) optional groups → 2ⁿ combinations → expand slashes in each */
    private expandOptionalGroups(s: string, caseSensitive: boolean): string[] {
        const matches = Array.from(s.matchAll(/\(([^)]*)\)/g));

        if (matches.length === 0) {
            return this.expandSlashAlternatives(s, caseSensitive);
        }

        const n = matches.length;
        const combinations = new Set<string>();

        for (let mask = 0; mask < (1 << n); mask++) {
            let result = s;
            // Process right-to-left so character positions stay valid
            for (let i = n - 1; i >= 0; i--) {
                const match = matches[i];
                const include = !!(mask & (1 << i));
                const fullMatch = match[0];           // e.g. "(FREDERICK)"
                const innerText = match[1] ?? '';     // e.g. "FREDERICK"
                const start = match.index ?? 0;
                result =
                    result.slice(0, start) +
                    (include ? innerText : '') +
                    result.slice(start + fullMatch.length);
            }
            result = result.replace(/\s+/g, ' ').trim();
            if (result) combinations.add(result);
        }

        const all = new Set<string>();
        for (const combo of combinations) {
            this.expandSlashAlternatives(combo, caseSensitive).forEach(s => all.add(s));
        }
        return Array.from(all).filter(Boolean);
    }

    /**
     * Expand slash alternatives within each whitespace-separated token.
     * "12.00 A.M./AM" → ["12.00 A.M.", "12.00 AM"]
     */
    private expandSlashAlternatives(s: string, caseSensitive: boolean): string[] {
        const tokens = s.split(/\s+/).filter(Boolean);
        let results: string[] = [''];

        for (const token of tokens) {
            if (token.includes('/')) {
                const slashAlts = token.split('/').filter(Boolean);
                const next: string[] = [];
                for (const prev of results) {
                    for (const alt of slashAlts) {
                        next.push(prev ? `${prev} ${alt}` : alt);
                    }
                }
                results = next;
            } else {
                results = results.map(prev => (prev ? `${prev} ${token}` : token));
            }
        }

        const norm = caseSensitive
            ? (v: string) => v.trim()
            : (v: string) => v.trim().toLowerCase();

        return [...new Set(results.map(norm).filter(Boolean))];
    }

    /**
     * Build the complete set of acceptable answers for a stored correctAnswers value.
     * Every stored template is fully expanded according to IELTS answer-key rules.
     */
    private buildAcceptableAnswers(rawCorrectAnswers: any, caseSensitive: boolean): Set<string> {
        const rawList = this.extractRawAnswers(rawCorrectAnswers);
        const acceptable = new Set<string>();
        for (const raw of rawList) {
            this.expandAnswerTemplate(raw, caseSensitive).forEach(a => acceptable.add(a));
        }
        return acceptable;
    }

    /**
     * Normalise a user-provided answer before comparison.
     * - Collapses whitespace
     * - Applies case normalisation
     * - Maps common True/False/Not-Given abbreviations to canonical forms
     *   so "NG", "N/G", "not-given" all match the stored "NOT GIVEN"
     */
    private normaliseInput(answer: string, caseSensitive: boolean): string {
        const trimmed = answer.trim().replace(/\s+/g, ' ');
        const step1 = caseSensitive ? trimmed : trimmed.toLowerCase();

        // TFNG / YNGNG alias map (keys are already lowercase)
        const tfngAliases: Record<string, string> = {
            't': 'true',
            'f': 'false',
            'ng': 'not given',
            'n/g': 'not given',
            'not-given': 'not given',
            'notgiven': 'not given',
            'y': 'yes',
        };
        return tfngAliases[step1] ?? step1;
    }

    async submitAttempt(attemptId: string, dto: SubmitTestAttemptDto): Promise<TestAttempt> {
        const attempt = await this.getAttemptById(attemptId);
        if (attempt.submittedAt) {
            throw new BadRequestException('This attempt has already been submitted');
        }

        if (!attempt.test) {
            throw new NotFoundException(`Test for attempt #${attemptId} not found`);
        }

        const isAutoGraded = ['reading', 'listening'].includes(attempt.test.skill);
        let rawScore = 0;
        let bandScore: number | null = null;

        const questionAttempts: QuestionAttempt[] = [];

        for (const answerDto of dto.answers) {
            // Default: null means "not graded / not applicable"
            let isCorrect: boolean | null = null;

            if (isAutoGraded) {
                const trimmedAnswer = answerDto.answer?.trim() ?? '';

                if (!trimmedAnswer) {
                    // Skipped — no answer provided, counts as wrong for scoring
                    isCorrect = false;
                } else {
                    const questionAnswer = await this.answerRepo.findOne({
                        where: { questionId: answerDto.questionId },
                    });

                    if (!questionAnswer) {
                        // No answer record in DB — treat as wrong (conservative)
                        isCorrect = false;
                    } else {
                        // Expand every stored template into all acceptable forms
                        const acceptable = this.buildAcceptableAnswers(
                            questionAnswer.correctAnswers,
                            questionAnswer.caseSensitive,
                        );

                        // Normalise the user's input (incl. TFNG alias resolution)
                        const normalisedInput = this.normaliseInput(
                            trimmedAnswer,
                            questionAnswer.caseSensitive,
                        );

                        isCorrect = acceptable.has(normalisedInput);
                        if (isCorrect) rawScore++;
                    }
                }
            }

            const attemptData: Partial<QuestionAttempt> = {
                testAttemptId: attemptId,
                questionId: answerDto.questionId,
                answer: answerDto.answer ?? '',
                answeredAt: new Date(),
                isCorrect: isCorrect ?? null,
            };

            const newAttempt = this.questionAttemptRepo.create(attemptData as unknown as Partial<QuestionAttempt>);
            questionAttempts.push(newAttempt);
        }

        if (questionAttempts.length > 0) {
            await this.questionAttemptRepo.save(questionAttempts);
        }

        if (isAutoGraded) {
            bandScore = attempt.test.skill === 'listening'
                ? this.calculateListeningBand(rawScore)
                : this.calculateReadingBand(rawScore);
        }

        // Use update() instead of save() to avoid TypeORM cascade wiping questionAttempts
        const updatePayload: Partial<TestAttempt> = {
            submittedAt: new Date(),
            rawScore,
        };
        if (bandScore !== null) {
            updatePayload.bandScore = bandScore;
        }
        await this.attemptRepo.update(attempt.id, updatePayload);

        return this.getAttemptById(attempt.id);
    }

    /** Official IELTS Listening band conversion table */
    private calculateListeningBand(rawScore: number): number {
        if (rawScore >= 39) return 9.0;
        if (rawScore >= 37) return 8.5;
        if (rawScore >= 35) return 8.0;
        if (rawScore >= 32) return 7.5;
        if (rawScore >= 30) return 7.0;
        if (rawScore >= 26) return 6.5;
        if (rawScore >= 23) return 6.0;
        if (rawScore >= 18) return 5.5;
        if (rawScore >= 16) return 5.0;
        if (rawScore >= 13) return 4.5;
        if (rawScore >= 11) return 4.0;
        return 3.5;
    }

    /** Official IELTS Academic Reading band conversion table */
    private calculateReadingBand(rawScore: number): number {
        if (rawScore >= 39) return 9.0;
        if (rawScore >= 37) return 8.5;
        if (rawScore >= 35) return 8.0;
        if (rawScore >= 33) return 7.5;
        if (rawScore >= 30) return 7.0;
        if (rawScore >= 27) return 6.5;
        if (rawScore >= 23) return 6.0;
        if (rawScore >= 19) return 5.5;
        if (rawScore >= 15) return 5.0;
        if (rawScore >= 13) return 4.5;
        if (rawScore >= 10) return 4.0;
        if (rawScore >= 8) return 3.5;
        if (rawScore >= 6) return 3.0;
        if (rawScore >= 4) return 2.5;
        return 2.0;
    }
}
