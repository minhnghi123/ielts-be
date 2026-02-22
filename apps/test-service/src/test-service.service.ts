import {
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { Test } from './entities/test.entity';
import { Section } from './entities/section.entity';
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

@Injectable()
export class TestServiceService {
    constructor(
        @InjectRepository(Test)
        private readonly testRepo: Repository<Test>,
        @InjectRepository(Section)
        private readonly sectionRepo: Repository<Section>,
        @InjectRepository(Question)
        private readonly questionRepo: Repository<Question>,
        @InjectRepository(QuestionAnswer)
        private readonly answerRepo: Repository<QuestionAnswer>,
        @InjectRepository(WritingTask)
        private readonly writingTaskRepo: Repository<WritingTask>,
        @InjectRepository(SpeakingPart)
        private readonly speakingPartRepo: Repository<SpeakingPart>,
    ) { }

    // ─── Tests ───────────────────────────────────────────────────────────────────

    async getTests(query: QueryTestsDto) {
        const { skill, isMock, page = 1, limit = 12 } = query;
        const where: FindOptionsWhere<Test> = {};
        if (skill) where.skill = skill as any;
        if (isMock !== undefined) where.isMock = isMock;

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
                'sections.questions',
                'sections.questions.answer',
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
            relations: ['questions', 'questions.answer'],
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
        const section = await this.sectionRepo.findOne({ where: { id: sectionId } });
        if (!section) throw new NotFoundException(`Section #${sectionId} not found`);
        Object.assign(section, dto);
        return this.sectionRepo.save(section);
    }

    async deleteSection(sectionId: string): Promise<void> {
        const section = await this.sectionRepo.findOne({ where: { id: sectionId } });
        if (!section) throw new NotFoundException(`Section #${sectionId} not found`);
        await this.sectionRepo.remove(section);
    }

    // ─── Questions ────────────────────────────────────────────────────────────────

    async getQuestionsBySectionId(sectionId: string): Promise<Question[]> {
        return this.questionRepo.find({
            where: { sectionId },
            relations: ['answer'],
            order: { questionOrder: 'ASC' },
        });
    }

    async createQuestion(
        sectionId: string,
        dto: CreateQuestionDto,
    ): Promise<Question | null> {
        const section = await this.sectionRepo.findOne({ where: { id: sectionId } });
        if (!section) throw new NotFoundException(`Section #${sectionId} not found`);

        const question = this.questionRepo.create({
            sectionId,
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
        if (!question) throw new NotFoundException(`Question #${questionId} not found`);

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
        if (!question) throw new NotFoundException(`Question #${questionId} not found`);
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
