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
import { CreateTestDto } from './dto/create-test.dto';
import { CreateSectionDto } from './dto/create-section.dto';
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
        const test = await this.testRepo.findOne({
            where: { id },
            relations: [
                'sections',
                'sections.questionGroups',
                'sections.questionGroups.questions',
                'sections.questionGroups.questions.answer',
                'writingTasks',
                'speakingParts',
            ],
            order: {
                sections: { sectionOrder: 'ASC' },
                writingTasks: { taskNumber: 'ASC' },
                speakingParts: { partNumber: 'ASC' },
            },
        });
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

        if (dto.answer && question.answer) {
            Object.assign(question.answer, dto.answer);
            await this.answerRepo.save(question.answer);
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
}
