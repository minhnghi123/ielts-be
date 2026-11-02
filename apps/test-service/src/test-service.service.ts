import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ClassroomClient } from './classroom/classroom.client';
import {
  Repository,
  FindOptionsWhere,
  DataSource,
  ILike,
  IsNull,
} from 'typeorm';
import { Test, SKILL_DEFAULT_DURATION_MINUTES } from './entities/test.entity';
import {
  RequestUser,
  USER_HEADERS,
  assertOwnerOrPrivileged,
  isPrivileged,
  RMQ_CLIENTS,
  RMQ_PATTERNS,
  ClassroomAttemptEvent,
  isTeacher,
} from '@app/common';
import { Section } from './entities/section.entity';
import { QuestionGroup } from './entities/question-group.entity';
import { Question } from './entities/question.entity';
import { QuestionAnswer } from './entities/question-answer.entity';
import { WritingTask } from './entities/writing-task.entity';
import { SpeakingPart } from './entities/speaking-part.entity';
import { TestAttempt } from './entities/test-attempt.entity';
import { QuestionAttempt } from './entities/question-attempt.entity';
import {
  SubmitTestAttemptDto,
  StartAttemptDto,
  AiFeedbackDto,
} from './dto/submit-test.dto';
import { CreateTestDto } from './dto/create-test.dto';
import { CreateSectionDto } from './dto/create-section.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { CreateWritingTaskDto } from './dto/create-writing-task.dto';
import { CreateSpeakingPartDto } from './dto/create-speaking-part.dto';
import { CreateWritingTestDto } from './dto/create-writing-test.dto';
import { CreateSpeakingTestDto } from './dto/create-speaking-test.dto';
import { QueryTestsDto } from './dto/query-tests.dto';
import { CreateManualTestDto } from './dto/create-manual-test.dto';

@Injectable()
export class TestServiceService {
  private readonly logger = new Logger(TestServiceService.name);

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
    private readonly classroomClient: ClassroomClient,
    @Inject(RMQ_CLIENTS.CLASSROOM)
    private readonly classroomEvents: ClientProxy,
  ) {}

  // ─── Tests ───────────────────────────────────────────────────────────────────

  async getTests(query: QueryTestsDto, user: RequestUser | null = null) {
    const {
      skill,
      isMock,
      difficulty,
      status,
      search,
      page,
      limit,
      mine,
      visibility,
      ownerRole,
    } = query;
    const where: FindOptionsWhere<Test> = {};
    if (skill) where.skill = skill as any;
    if (isMock !== undefined) where.isMock = isMock;
    if (difficulty) where.difficulty = difficulty as any;
    if (search) where.title = ILike(`%${search}%`);

    const privileged = isPrivileged(user);
    const teacher = isTeacher(user) && !!user?.id;
    if (privileged) {
      // Admins see everything and may filter freely.
      if (status) where.status = status as any;
      if (visibility) where.visibility = visibility as any;
      if (ownerRole) where.ownerRole = ownerRole as any;
      if (mine && user?.id) where.createdBy = user.id;
    } else if (teacher && mine) {
      // A teacher's own bank: every status, private or public.
      where.createdBy = user!.id as string;
      if (status) where.status = status as any;
    } else {
      // Learners, guests and teachers browsing the shared bank.
      where.status = 'published';
      where.visibility = 'public';
    }

    const [data, total] = await this.testRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: data.map((t) => ({
        ...t,
        durationMinutes: this.resolveDurationMinutes(t),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** Lightweight metadata used by ownership/visibility checks. */
  async findTestMeta(
    id: string,
  ): Promise<Pick<
    Test,
    'id' | 'skill' | 'status' | 'visibility' | 'createdBy' | 'ownerRole'
  > | null> {
    return this.testRepo.findOne({
      where: { id },
      select: ['id', 'skill', 'status', 'visibility', 'createdBy', 'ownerRole'],
    });
  }

  async testIdOfSection(sectionId: string): Promise<string | null> {
    const s = await this.sectionRepo.findOne({
      where: { id: sectionId },
      select: ['id', 'testId'],
    });
    return s?.testId ?? null;
  }

  async testIdOfGroup(groupId: string): Promise<string | null> {
    const g = await this.questionGroupRepo.findOne({
      where: { id: groupId },
      select: ['id', 'sectionId'],
    });
    return g ? this.testIdOfSection(g.sectionId) : null;
  }

  async testIdOfQuestion(questionId: string): Promise<string | null> {
    const q = await this.questionRepo.findOne({
      where: { id: questionId },
      select: ['id', 'questionGroupId'],
    });
    return q ? this.testIdOfGroup(q.questionGroupId) : null;
  }

  /**
   * Private tests are only visible to admins, their author, and learners who
   * have been assigned them in a class.
   */
  private async assertCanViewTest(
    meta: Pick<Test, 'id' | 'visibility' | 'createdBy'>,
    user: RequestUser | null,
  ): Promise<void> {
    if (meta.visibility !== 'private') return;
    if (isPrivileged(user)) return;
    if (isTeacher(user) && user?.id === meta.createdBy) return;
    if (user?.role === 'learner' && user.profileId) {
      if (await this.classroomClient.canAccessTest(user.profileId, meta.id))
        return;
    }
    throw new NotFoundException(`Test #${meta.id} not found`);
  }

  /** Stamp authorship from the verified identity; teachers always author private tests. */
  private stampOwnership<T extends { createdBy?: string }>(
    dto: T,
    user: RequestUser | null,
  ): T & {
    createdBy: string;
    ownerRole: 'admin' | 'teacher';
    visibility: 'public' | 'private';
  } {
    const teacher = isTeacher(user);
    const createdBy = user?.id ?? dto.createdBy;
    if (!createdBy) throw new ForbiddenException('Missing creator identity');
    return Object.assign(dto, {
      createdBy,
      ownerRole: (teacher ? 'teacher' : 'admin') as 'admin' | 'teacher',
      visibility: (teacher ? 'private' : 'public') as 'public' | 'private',
    });
  }

  /** Official duration unless the admin overrode it on the test. */
  resolveDurationMinutes(
    test: Pick<Test, 'skill' | 'durationMinutes'>,
  ): number {
    return (
      test.durationMinutes ?? SKILL_DEFAULT_DURATION_MINUTES[test.skill] ?? 60
    );
  }

  async getTestById(
    id: string,
    opts: { includeAnswers?: boolean } = {},
    user: RequestUser | null = null,
  ): Promise<Test> {
    // Step 1: fetch the test's metadata first (lightweight) and check visibility
    const meta = await this.findTestMeta(id);
    if (!meta) throw new NotFoundException(`Test #${id} not found`);
    await this.assertCanViewTest(meta, user);
    if (isTeacher(user) && user?.id === meta.createdBy)
      opts = { ...opts, includeAnswers: true };

    // Step 2: load only the relations relevant to this skill
    const relations: string[] = [];
    const order: Record<string, any> = {};

    if (meta.skill === 'reading' || meta.skill === 'listening') {
      relations.push(
        'sections',
        'sections.questionGroups',
        'sections.questionGroups.questions',
      );
      if (opts.includeAnswers)
        relations.push('sections.questionGroups.questions.answer');
      order['sections'] = {
        sectionOrder: 'ASC',
        questionGroups: {
          groupOrder: 'ASC',
          questions: { questionOrder: 'ASC' },
        },
      };
    } else if (meta.skill === 'writing') {
      relations.push('writingTasks');
      order['writingTasks'] = { taskNumber: 'ASC' };
    } else if (meta.skill === 'speaking') {
      relations.push('speakingParts');
      order['speakingParts'] = { partNumber: 'ASC' };
    }

    const test = await this.testRepo.findOne({
      where: { id },
      relations,
      order,
    });
    if (!test) throw new NotFoundException(`Test #${id} not found`);
    (test as any).durationMinutes = this.resolveDurationMinutes(test);
    return opts.includeAnswers ? test : this.stripAnswerKey(test);
  }

  /** Remove everything a candidate must not see while the test is live. */
  private stripAnswerKey(test: Test): Test {
    for (const section of test.sections ?? []) {
      for (const group of section.questionGroups ?? []) {
        for (const q of group.questions ?? []) {
          delete (q as any).answer;
          delete (q as any).explanation;
        }
      }
    }
    return test;
  }

  async createTest(
    dto: CreateTestDto,
    user: RequestUser | null = null,
  ): Promise<Test> {
    const owned = this.stampOwnership(dto, user);
    const test = this.testRepo.create({
      skill: dto.skill as any,
      title: dto.title,
      isMock: dto.isMock,
      createdBy: owned.createdBy,
      ownerRole: owned.ownerRole,
      visibility: owned.visibility,
      ...(dto.difficulty && { difficulty: dto.difficulty }),
      ...(dto.status && { status: dto.status }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.durationMinutes !== undefined && {
        durationMinutes: dto.durationMinutes,
      }),
    });
    return this.testRepo.save(test);
  }

  async createManualTest(
    dto: CreateManualTestDto,
    user: RequestUser | null = null,
  ): Promise<Test> {
    this.stampOwnership(dto as any, user);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Create Test
      const test = queryRunner.manager.create(Test, {
        skill: dto.skill,
        title: dto.title,
        isMock: dto.isMock,
        createdBy: dto.createdBy as string,
        ownerRole: (dto as any).ownerRole ?? 'admin',
        visibility: (dto as any).visibility ?? 'public',
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

  async updateTest(
    id: string,
    dto: Partial<CreateTestDto>,
    user: RequestUser | null = null,
  ): Promise<Test> {
    const existing = await this.findTestMeta(id);
    if (!existing) throw new NotFoundException(`Test #${id} not found`);
    if (
      dto.skill &&
      dto.skill !== existing.skill &&
      (await this.classroomClient.countAssignments(id)) > 0
    ) {
      throw new ConflictException(
        'Cannot change the skill of a test that is assigned to a class',
      );
    }
    await this.testRepo.update(id, {
      ...(dto.skill && { skill: dto.skill as any }),
      ...(dto.title && { title: dto.title }),
      ...(dto.isMock !== undefined && { isMock: dto.isMock }),
      ...(dto.difficulty && { difficulty: dto.difficulty }),
      ...(dto.status && { status: dto.status }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.durationMinutes !== undefined && {
        durationMinutes: dto.durationMinutes,
      }),
    });
    return this.getTestById(id, { includeAnswers: true }, user);
  }

  /** Admin only: move a test between the shared bank and private. */
  async updateVisibility(
    id: string,
    visibility: 'public' | 'private',
  ): Promise<Test> {
    const existing = await this.findTestMeta(id);
    if (!existing) throw new NotFoundException(`Test #${id} not found`);
    await this.testRepo.update(id, { visibility });
    return this.getTestById(id, { includeAnswers: true });
  }

  async deleteTest(id: string): Promise<void> {
    const test = await this.testRepo.findOne({ where: { id } });
    if (!test) throw new NotFoundException(`Test #${id} not found`);
    const assigned = await this.classroomClient.countAssignments(id);
    if (assigned > 0) {
      throw new ConflictException(
        `This test is used by ${assigned} class assignment(s). Archive it instead of deleting.`,
      );
    }
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

  async createGroup(
    sectionId: string,
    dto: CreateGroupDto,
  ): Promise<QuestionGroup> {
    const section = await this.sectionRepo.findOne({
      where: { id: sectionId },
    });
    if (!section)
      throw new NotFoundException(`Section #${sectionId} not found`);
    const group = this.questionGroupRepo.create({
      sectionId,
      groupOrder: dto.groupOrder,
      instructions: dto.instructions,
    });
    return this.questionGroupRepo.save(group);
  }

  async updateGroup(
    groupId: string,
    dto: Partial<CreateGroupDto>,
  ): Promise<QuestionGroup> {
    const group = await this.questionGroupRepo.findOne({
      where: { id: groupId },
    });
    if (!group)
      throw new NotFoundException(`QuestionGroup #${groupId} not found`);
    if (dto.groupOrder !== undefined) group.groupOrder = dto.groupOrder;
    if (dto.instructions !== undefined) group.instructions = dto.instructions;
    return this.questionGroupRepo.save(group);
  }

  async deleteGroup(groupId: string): Promise<void> {
    const group = await this.questionGroupRepo.findOne({
      where: { id: groupId },
    });
    if (!group)
      throw new NotFoundException(`QuestionGroup #${groupId} not found`);
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
    const group = await this.questionGroupRepo.findOne({
      where: { id: questionGroupId },
    });
    if (!group)
      throw new NotFoundException(
        `QuestionGroup #${questionGroupId} not found`,
      );

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

  // ─── Writing Test (Full Creation & Update) ─────────────────────────────────────────

  async createWritingTest(
    dto: CreateWritingTestDto,
    user: RequestUser | null = null,
  ): Promise<Test> {
    this.stampOwnership(dto as any, user);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const test = queryRunner.manager.create(Test, {
        skill: 'writing' as any,
        title: dto.title,
        isMock: dto.isMock,
        createdBy: dto.createdBy as string,
        ownerRole: (dto as any).ownerRole ?? 'admin',
        visibility: (dto as any).visibility ?? 'public',
      });
      const savedTest = await queryRunner.manager.save(Test, test);

      for (const taskDto of dto.tasks) {
        const task = queryRunner.manager.create(WritingTask, {
          testId: savedTest.id,
          taskNumber: taskDto.taskNumber,
          prompt: taskDto.promptText,
          wordLimit: 0,
          config: {
            timeLimit:
              taskDto.timeLimit ?? (taskDto.taskNumber === 1 ? 20 : 40),
            mediaUrl: taskDto.mediaUrl ?? null,
            rubric: taskDto.rubric ?? [],
          },
        });
        await queryRunner.manager.save(WritingTask, task);
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

  async updateWritingTest(
    id: string,
    dto: CreateWritingTestDto,
  ): Promise<Test> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Update base test
      await queryRunner.manager.update(
        Test,
        { id },
        {
          title: dto.title,
          isMock: dto.isMock,
        },
      );

      // Delete old tasks
      // We use delete from repository for cascading or just direct delete
      await queryRunner.manager.delete(WritingTask, { testId: id });

      // Insert new tasks
      for (const taskDto of dto.tasks) {
        const task = queryRunner.manager.create(WritingTask, {
          testId: id,
          taskNumber: taskDto.taskNumber,
          prompt: taskDto.promptText,
          wordLimit: 0,
          config: {
            timeLimit:
              taskDto.timeLimit ?? (taskDto.taskNumber === 1 ? 20 : 40),
            mediaUrl: taskDto.mediaUrl ?? null,
            rubric: taskDto.rubric ?? [],
          },
        });
        await queryRunner.manager.save(WritingTask, task);
      }

      await queryRunner.commitTransaction();
      return this.getTestById(id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ─── Speaking Test (Full Creation & Update) ────────────────────────────────────────

  async createSpeakingTest(
    dto: CreateSpeakingTestDto,
    user: RequestUser | null = null,
  ): Promise<Test> {
    this.stampOwnership(dto as any, user);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const test = queryRunner.manager.create(Test, {
        skill: 'speaking' as any,
        title: dto.title,
        isMock: dto.isMock,
        createdBy: dto.createdBy as string,
        ownerRole: (dto as any).ownerRole ?? 'admin',
        visibility: (dto as any).visibility ?? 'public',
      });
      const savedTest = await queryRunner.manager.save(Test, test);

      // Part 1 – Interview questions
      const part1 = queryRunner.manager.create(SpeakingPart, {
        testId: savedTest.id,
        partNumber: 1,
        prompt: undefined,
        config: { topics: dto.part1.topics },
      });
      await queryRunner.manager.save(SpeakingPart, part1);

      // Part 2 – Cue card
      const part2 = queryRunner.manager.create(SpeakingPart, {
        testId: savedTest.id,
        partNumber: 2,
        prompt: dto.part2.mainTopic,
        config: {
          cues: dto.part2.cues,
          prepTime: dto.part2.prepTime ?? 1,
          speakTime: dto.part2.speakTime ?? 2,
        },
      });
      await queryRunner.manager.save(SpeakingPart, part2);

      // Part 3 – Discussion
      const part3 = queryRunner.manager.create(SpeakingPart, {
        testId: savedTest.id,
        partNumber: 3,
        prompt: undefined,
        config: { questions: dto.part3.questions },
      });
      await queryRunner.manager.save(SpeakingPart, part3);

      await queryRunner.commitTransaction();
      return this.getTestById(savedTest.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async updateSpeakingTest(
    id: string,
    dto: CreateSpeakingTestDto,
  ): Promise<Test> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // Update base test
      await queryRunner.manager.update(
        Test,
        { id },
        {
          title: dto.title,
          isMock: dto.isMock,
        },
      );

      // Delete old parts
      await queryRunner.manager.delete(SpeakingPart, { testId: id });

      // Insert new Part 1
      const part1 = queryRunner.manager.create(SpeakingPart, {
        testId: id,
        partNumber: 1,
        prompt: undefined,
        config: { topics: dto.part1.topics },
      });
      await queryRunner.manager.save(SpeakingPart, part1);

      // Insert new Part 2
      const part2 = queryRunner.manager.create(SpeakingPart, {
        testId: id,
        partNumber: 2,
        prompt: dto.part2.mainTopic,
        config: {
          cues: dto.part2.cues,
          prepTime: dto.part2.prepTime ?? 1,
          speakTime: dto.part2.speakTime ?? 2,
        },
      });
      await queryRunner.manager.save(SpeakingPart, part2);

      // Insert new Part 3
      const part3 = queryRunner.manager.create(SpeakingPart, {
        testId: id,
        partNumber: 3,
        prompt: undefined,
        config: { questions: dto.part3.questions },
      });
      await queryRunner.manager.save(SpeakingPart, part3);

      await queryRunner.commitTransaction();
      return this.getTestById(id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ─── Test Attempts (server-side exam session) ───────────────────────────────

  /** Seconds of tolerance for network latency before a late submission counts as expired. */
  private static readonly SUBMIT_GRACE_SECONDS = 30;

  async startAttempt(
    testId: string,
    learnerId: string,
    dto: StartAttemptDto = {},
    user: RequestUser | null = null,
  ): Promise<TestAttempt> {
    const test = await this.testRepo.findOne({ where: { id: testId } });
    if (!test) throw new NotFoundException(`Test #${testId} not found`);
    if (test.status !== 'published') {
      throw new BadRequestException('This test is not available');
    }

    // Class assignment context: the classroom-service decides whether this
    // learner may start (membership, time window, attempt limit).
    let eligibility: Awaited<
      ReturnType<ClassroomClient['getEligibility']>
    > | null = null;
    if (dto.assignmentId) {
      eligibility = await this.classroomClient.getEligibility(
        dto.assignmentId,
        learnerId,
      );
      if (eligibility.testId !== testId) {
        throw new BadRequestException(
          'This assignment is for a different test',
        );
      }
      const open = await this.findOpenAttempt(
        testId,
        learnerId,
        dto.assignmentId,
      );
      if (open) return this.decorateAttempt(open);
      if (!eligibility.allowed) {
        throw new ConflictException(
          eligibility.reason || 'You cannot start this assignment now',
        );
      }
    } else if (test.visibility === 'private' && !isPrivileged(user)) {
      if (!(await this.classroomClient.canAccessTest(learnerId, testId))) {
        throw new NotFoundException(`Test #${testId} not found`);
      }
    }

    // One live attempt per learner per test (per assignment) — resume instead of duplicating.
    const open = await this.findOpenAttempt(
      testId,
      learnerId,
      dto.assignmentId ?? null,
    );
    if (open) return this.decorateAttempt(open);

    const officialMinutes = this.resolveDurationMinutes(test);
    const practiceAllowed = eligibility
      ? eligibility.mode === 'practice'
      : !test.isMock;
    const isPractice =
      practiceAllowed &&
      dto.durationMinutes !== undefined &&
      dto.durationMinutes !== officialMinutes;
    const minutes = isPractice
      ? (dto.durationMinutes as number)
      : officialMinutes;
    const durationSeconds = minutes * 60 + (eligibility?.extraSeconds ?? 0);
    const now = new Date();
    let expiresAt = new Date(now.getTime() + durationSeconds * 1000);
    if (eligibility?.closeAt) {
      const closeAt = new Date(eligibility.closeAt);
      if (closeAt.getTime() <= now.getTime() + 60_000) {
        throw new ConflictException(
          'This assignment closes in less than a minute',
        );
      }
      if (closeAt < expiresAt) expiresAt = closeAt;
    }

    const attempt = this.attemptRepo.create({
      testId: test.id,
      learnerId,
      status: 'in_progress',
      durationSeconds: Math.floor((expiresAt.getTime() - now.getTime()) / 1000),
      expiresAt,
      draftAnswers: {},
      isPractice: eligibility ? eligibility.mode === 'practice' : isPractice,
      assignmentId: dto.assignmentId ?? null,
      attemptNo: eligibility ? eligibility.attemptsUsed + 1 : 1,
    });
    const saved = await this.attemptRepo.save(attempt);
    return this.decorateAttempt(saved);
  }

  private async findOpenAttempt(
    testId: string,
    learnerId: string,
    assignmentId: string | null | undefined = undefined,
  ): Promise<TestAttempt | null> {
    const where: FindOptionsWhere<TestAttempt> = {
      testId,
      learnerId,
      status: 'in_progress',
    };
    if (assignmentId !== undefined)
      where.assignmentId = assignmentId === null ? IsNull() : assignmentId;
    const open = await this.attemptRepo.findOne({
      where,
      order: { startedAt: 'DESC' },
    });
    if (!open) return null;
    if (this.isPastDeadline(open)) {
      await this.finalizeExpired(open);
      return null;
    }
    return open;
  }

  async getActiveAttempt(
    testId: string,
    learnerId: string,
    assignmentId?: string,
  ): Promise<TestAttempt> {
    const open = await this.findOpenAttempt(
      testId,
      learnerId,
      assignmentId ?? undefined,
    );
    if (!open)
      throw new NotFoundException('No attempt in progress for this test');
    return this.decorateAttempt(open);
  }

  private isPastDeadline(attempt: TestAttempt, graceSeconds = 0): boolean {
    if (!attempt.expiresAt) return false;
    return Date.now() > attempt.expiresAt.getTime() + graceSeconds * 1000;
  }

  /** Attach `remainingSeconds` so clients can mirror the authoritative timer. */
  private decorateAttempt<T extends TestAttempt>(
    attempt: T,
  ): T & { remainingSeconds: number | null } {
    const remainingSeconds =
      attempt.status === 'in_progress' && attempt.expiresAt
        ? Math.max(
            0,
            Math.floor((attempt.expiresAt.getTime() - Date.now()) / 1000),
          )
        : attempt.status === 'in_progress'
          ? null
          : 0;
    return Object.assign(attempt, { remainingSeconds });
  }

  /** Deadline passed without a submission → grade whatever was autosaved. */
  private async finalizeExpired(attempt: TestAttempt): Promise<TestAttempt> {
    const answers = Object.entries(attempt.draftAnswers ?? {}).map(
      ([questionId, answer]) => ({
        questionId,
        answer,
      }),
    );
    return this.gradeAndClose(attempt, answers, 'expired');
  }

  async saveDraft(
    attemptId: string,
    answers: Record<string, string>,
    user: RequestUser | null,
  ): Promise<{ savedAt: Date; remainingSeconds: number | null }> {
    const attempt = await this.attemptRepo.findOne({
      where: { id: attemptId },
    });
    if (!attempt)
      throw new NotFoundException(`TestAttempt #${attemptId} not found`);
    assertOwnerOrPrivileged(user, attempt.learnerId);

    if (attempt.status !== 'in_progress') {
      throw new ConflictException('This attempt has already been submitted');
    }
    if (this.isPastDeadline(attempt, TestServiceService.SUBMIT_GRACE_SECONDS)) {
      await this.finalizeExpired(attempt);
      throw new ConflictException(
        'Time is up — the attempt was submitted automatically',
      );
    }

    const savedAt = new Date();
    await this.attemptRepo.update(attempt.id, {
      draftAnswers: answers,
      lastSavedAt: savedAt,
    });
    return {
      savedAt,
      remainingSeconds: this.decorateAttempt(attempt).remainingSeconds,
    };
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
    if (!attempt)
      throw new NotFoundException(`TestAttempt #${attemptId} not found`);
    return attempt;
  }

  /**
   * Learner-facing read. While the attempt is live the answer key is withheld;
   * after submission the full review (correct answers + explanations) is returned.
   */
  async getAttemptForUser(
    attemptId: string,
    user: RequestUser | null,
  ): Promise<TestAttempt> {
    let attempt = await this.getAttemptById(attemptId);
    assertOwnerOrPrivileged(user, attempt.learnerId);

    if (
      attempt.status === 'in_progress' &&
      this.isPastDeadline(attempt, TestServiceService.SUBMIT_GRACE_SECONDS)
    ) {
      await this.finalizeExpired(attempt);
      attempt = await this.getAttemptById(attemptId);
    }

    if (attempt.status === 'in_progress' && !isPrivileged(user)) {
      for (const qa of attempt.questionAttempts ?? []) {
        if (qa.question) {
          delete (qa.question as any).answer;
          delete (qa.question as any).explanation;
        }
      }
    }
    return this.decorateAttempt(attempt);
  }

  /** Internal (classroom-service): every attempt of an assignment, optionally for one learner. */
  async getAttemptsForAssignment(
    assignmentId: string,
    learnerId?: string,
  ): Promise<TestAttempt[]> {
    const where: FindOptionsWhere<TestAttempt> = { assignmentId };
    if (learnerId) where.learnerId = learnerId;
    const rows = await this.attemptRepo.find({
      where,
      relations: ['test'],
      order: { startedAt: 'DESC' },
    });
    const result: TestAttempt[] = [];
    for (const a of rows) {
      if (
        a.status === 'in_progress' &&
        this.isPastDeadline(a, TestServiceService.SUBMIT_GRACE_SECONDS)
      ) {
        result.push(await this.finalizeExpired(a));
      } else {
        result.push(this.decorateAttempt(a));
      }
    }
    return result;
  }

  async getAttemptsByLearnerId(
    learnerId: string,
    assignmentId?: string,
  ): Promise<TestAttempt[]> {
    return this.attemptRepo.find({
      where: assignmentId ? { learnerId, assignmentId } : { learnerId },
      relations: ['test'],
      order: { startedAt: 'DESC' },
    });
  }

  /**
   * Internal: store the AI band/feedback for Writing & Speaking. Only trusted
   * server code (gateway role `system`) or an admin can reach this.
   */
  async saveAiFeedback(attemptId: string, dto: AiFeedbackDto): Promise<void> {
    const attempt = await this.attemptRepo.findOne({
      where: { id: attemptId },
      relations: ['test'],
    });
    if (!attempt)
      throw new NotFoundException(`TestAttempt #${attemptId} not found`);

    const patch: Partial<TestAttempt> = {};
    if (dto.aiFeedback !== undefined) patch.aiFeedback = dto.aiFeedback;
    if (dto.rawScore !== undefined) patch.rawScore = dto.rawScore;
    if (dto.bandScore !== undefined) {
      if (['reading', 'listening'].includes(attempt.test?.skill)) {
        throw new BadRequestException(
          'Reading/Listening bands are computed by the server',
        );
      }
      patch.bandScore = this.roundToHalfBand(dto.bandScore);
    }
    if (Object.keys(patch).length === 0) return;

    await this.attemptRepo.update({ id: attemptId }, patch);

    if (dto.bandScore !== undefined) {
      const updated = await this.getAttemptById(attemptId);
      await this.syncAnalyticsAfterSubmit(updated, []);
      this.emitClassroomEvent(RMQ_PATTERNS.CLASSROOM.ATTEMPT_GRADED, updated);
    }
  }

  /** Notify classroom-service about attempts that belong to a class assignment. */
  private emitClassroomEvent(pattern: string, attempt: TestAttempt): void {
    if (!attempt.assignmentId) return;
    const payload: ClassroomAttemptEvent = {
      attemptId: attempt.id,
      assignmentId: attempt.assignmentId,
      learnerId: attempt.learnerId,
      testId: attempt.testId,
      skill: attempt.test?.skill ?? null,
      status: attempt.status,
      attemptNo: attempt.attemptNo ?? 1,
      rawScore: attempt.rawScore ?? null,
      bandScore:
        attempt.bandScore !== null && attempt.bandScore !== undefined
          ? Number(attempt.bandScore)
          : null,
      startedAt: attempt.startedAt
        ? new Date(attempt.startedAt).toISOString()
        : new Date().toISOString(),
      submittedAt: attempt.submittedAt
        ? new Date(attempt.submittedAt).toISOString()
        : null,
      expiresAt: attempt.expiresAt
        ? new Date(attempt.expiresAt).toISOString()
        : null,
    };
    this.classroomEvents.emit(pattern, payload).subscribe({
      error: (err) =>
        this.logger.warn(
          `Failed to emit ${pattern} for attempt ${attempt.id}: ${String(err)}`,
        ),
    });
  }

  /** IELTS bands are reported in 0.5 steps. */
  roundToHalfBand(value: number): number {
    return Math.min(9, Math.max(0, Math.round(value * 2) / 2));
  }

  // ─── Answer grading helpers ─────────────────────────────────────────────────

  /**
   * Extract the raw answer strings stored in the DB.
   * Handles PostgreSQL text[] (already a JS array), JSON strings, and plain strings.
   */
  private extractRawAnswers(raw: any): string[] {
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw
        .map((ca) =>
          typeof ca === 'object' && ca !== null && ca.value !== undefined
            ? String(ca.value)
            : String(ca),
        )
        .filter(Boolean);
    }
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
      } catch {
        /* fall through */
      }
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
  private expandAnswerTemplate(
    template: string,
    caseSensitive: boolean,
  ): string[] {
    const topAlts = template.split(/\[OR\]/i).map((s) => s.trim());
    const results = new Set<string>();
    for (const alt of topAlts) {
      this.expandOptionalGroups(alt, caseSensitive).forEach((s) =>
        results.add(s),
      );
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

    for (let mask = 0; mask < 1 << n; mask++) {
      let result = s;
      // Process right-to-left so character positions stay valid
      for (let i = n - 1; i >= 0; i--) {
        const match = matches[i];
        const include = !!(mask & (1 << i));
        const fullMatch = match[0]; // e.g. "(FREDERICK)"
        const innerText = match[1] ?? ''; // e.g. "FREDERICK"
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
      this.expandSlashAlternatives(combo, caseSensitive).forEach((s) =>
        all.add(s),
      );
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
        results = results.map((prev) => (prev ? `${prev} ${token}` : token));
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
  private buildAcceptableAnswers(
    rawCorrectAnswers: any,
    caseSensitive: boolean,
  ): Set<string> {
    const rawList = this.extractRawAnswers(rawCorrectAnswers);
    const acceptable = new Set<string>();
    for (const raw of rawList) {
      this.expandAnswerTemplate(raw, caseSensitive).forEach((a) =>
        acceptable.add(a),
      );
      const m = String(raw).trim().match(TestServiceService.OPTION_LETTER_RE);
      if (m) {
        acceptable.add(this.normaliseInput(m[1], caseSensitive));
        acceptable.add(this.normaliseInput(m[2], caseSensitive));
      }
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
  /**
   * Multiple-choice answers may arrive either as the bare option letter ("B")
   * or as the rendered option ("B. Heavy taxation" / "B) Heavy taxation").
   * Both forms are compared against the key, which may itself use either form.
   */
  private static readonly OPTION_LETTER_RE = /^([A-Ha-h])\s*[.):-]\s*(.+)$/;

  private candidateForms(answer: string, caseSensitive: boolean): string[] {
    const forms = [this.normaliseInput(answer, caseSensitive)];
    const m = answer.trim().match(TestServiceService.OPTION_LETTER_RE);
    if (m) {
      forms.push(this.normaliseInput(m[1], caseSensitive));
      forms.push(this.normaliseInput(m[2], caseSensitive));
    }
    return forms;
  }

  private normaliseInput(answer: string, caseSensitive: boolean): string {
    const trimmed = answer.trim().replace(/\s+/g, ' ');
    const step1 = caseSensitive ? trimmed : trimmed.toLowerCase();

    // TFNG / YNGNG alias map (keys are already lowercase)
    const tfngAliases: Record<string, string> = {
      t: 'true',
      f: 'false',
      ng: 'not given',
      'n/g': 'not given',
      'not-given': 'not given',
      notgiven: 'not given',
      y: 'yes',
    };
    return tfngAliases[step1] ?? step1;
  }

  async submitAttempt(
    attemptId: string,
    dto: SubmitTestAttemptDto,
    user: RequestUser | null = null,
  ): Promise<TestAttempt> {
    const attempt = await this.attemptRepo.findOne({
      where: { id: attemptId },
      relations: ['test'],
    });
    if (!attempt)
      throw new NotFoundException(`TestAttempt #${attemptId} not found`);
    assertOwnerOrPrivileged(user, attempt.learnerId);

    if (attempt.status !== 'in_progress' || attempt.submittedAt) {
      throw new ConflictException('This attempt has already been submitted');
    }
    if (!attempt.test) {
      throw new NotFoundException(`Test for attempt #${attemptId} not found`);
    }

    // Late submission (beyond the grace window) → the autosaved draft is what counts.
    const late = this.isPastDeadline(
      attempt,
      TestServiceService.SUBMIT_GRACE_SECONDS,
    );
    const answers =
      late || !dto.answers?.length
        ? Object.entries(attempt.draftAnswers ?? {}).map(
            ([questionId, answer]) => ({ questionId, answer }),
          )
        : dto.answers;

    return this.gradeAndClose(attempt, answers, late ? 'expired' : 'submitted');
  }

  /** Grade (Reading/Listening) and persist the final state of an attempt. */
  private async gradeAndClose(
    attempt: TestAttempt,
    answers: { questionId: string; answer?: string }[],
    finalStatus: 'submitted' | 'expired',
  ): Promise<TestAttempt> {
    if (!attempt.test) {
      attempt.test = (await this.testRepo.findOne({
        where: { id: attempt.testId },
      })) as Test;
    }
    const skill = attempt.test?.skill;
    const isAutoGraded = ['reading', 'listening'].includes(skill);
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    let rawScore = 0;
    let bandScore: number | null = null;
    const wrongQuestionIds: string[] = [];
    const questionAttempts: QuestionAttempt[] = [];

    // Grade against every question of the test so skipped questions count as wrong.
    const questionIds = isAutoGraded
      ? await this.getQuestionIdsForTest(attempt.testId)
      : answers.map((a) => a.questionId).filter((id) => uuidRe.test(id));
    const answerById = new Map(
      answers.map((a) => [a.questionId, a.answer ?? '']),
    );
    const keyById = new Map(
      (await this.getAnswersForQuestions(questionIds)).map((k) => [
        k.questionId,
        k,
      ]),
    );

    for (const questionId of questionIds) {
      const given = answerById.get(questionId) ?? '';
      let isCorrect: boolean | null = null;

      if (isAutoGraded) {
        const trimmed = given.trim();
        const key = keyById.get(questionId);
        if (!trimmed || !key) {
          isCorrect = false;
        } else {
          const acceptable = this.buildAcceptableAnswers(
            key.correctAnswers,
            key.caseSensitive,
          );
          isCorrect = this.candidateForms(trimmed, key.caseSensitive).some(
            (form) => acceptable.has(form),
          );
        }
        if (isCorrect) rawScore++;
        else wrongQuestionIds.push(questionId);
      }

      questionAttempts.push(
        this.questionAttemptRepo.create({
          testAttemptId: attempt.id,
          questionId,
          answer: given,
          answeredAt: new Date(),
          isCorrect,
        } as Partial<QuestionAttempt>),
      );
    }

    if (questionAttempts.length > 0) {
      // Replace any rows from a previous (interrupted) grading of this attempt.
      await this.questionAttemptRepo.delete({ testAttemptId: attempt.id });
      await this.questionAttemptRepo.save(questionAttempts);
    }

    if (isAutoGraded) {
      // Band tables assume the full 40-question paper; scale shorter practice sets.
      const totalQuestions = keyById.size;
      const scaledRaw =
        totalQuestions > 0 && totalQuestions !== 40
          ? Math.round((rawScore * 40) / totalQuestions)
          : rawScore;
      bandScore =
        skill === 'listening'
          ? this.calculateListeningBand(scaledRaw)
          : this.calculateReadingBand(scaledRaw);
    }

    const updatePayload: Partial<TestAttempt> = {
      submittedAt: new Date(),
      status: finalStatus,
      rawScore: isAutoGraded ? rawScore : attempt.rawScore,
      // Keep autosaved non-question answers (e.g. Writing task texts) alongside the final answers.
      draftAnswers: {
        ...(attempt.draftAnswers ?? {}),
        ...Object.fromEntries(
          answers.map((a) => [a.questionId, a.answer ?? '']),
        ),
      },
    };
    if (bandScore !== null) updatePayload.bandScore = bandScore;
    await this.attemptRepo.update(attempt.id, updatePayload);

    const submitted = await this.getAttemptById(attempt.id);
    await this.syncAnalyticsAfterSubmit(submitted, [
      ...new Set(wrongQuestionIds),
    ]);
    this.emitClassroomEvent(
      RMQ_PATTERNS.CLASSROOM.ATTEMPT_SUBMITTED,
      submitted,
    );
    return this.decorateAttempt(submitted);
  }

  private async getQuestionIdsForTest(testId: string): Promise<string[]> {
    const rows = await this.questionRepo
      .createQueryBuilder('q')
      .innerJoin('q.questionGroup', 'g')
      .innerJoin('g.section', 's')
      .where('s.testId = :testId', { testId })
      .orderBy('s.sectionOrder', 'ASC')
      .addOrderBy('g.groupOrder', 'ASC')
      .addOrderBy('q.questionOrder', 'ASC')
      .select(['q.id'])
      .getMany();
    return rows.map((r) => r.id);
  }

  private async syncAnalyticsAfterSubmit(
    attempt: TestAttempt,
    wrongQuestionIds: string[],
  ): Promise<void> {
    const band = Number(attempt.bandScore ?? 0);
    if (!attempt.submittedAt || !band) return;

    const baseUrl =
      process.env.ANALYTICS_SERVICE_URL || 'http://localhost:5004';
    const learnerId = attempt.learnerId;
    const skill = attempt.test?.skill;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      [USER_HEADERS.ROLE]: 'system',
    };
    if (process.env.INTERNAL_API_KEY)
      headers[USER_HEADERS.INTERNAL_KEY] = process.env.INTERNAL_API_KEY;

    try {
      const upserts: Promise<Response>[] = [];
      if (skill) {
        upserts.push(
          fetch(`${baseUrl}/analytics/band-profiles`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              learnerId,
              skill,
              currentBand: band,
            }),
          }),
        );
      }

      upserts.push(
        fetch(`${baseUrl}/analytics/band-profiles`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            learnerId,
            skill: 'overall',
            currentBand: band,
          }),
        }),
        fetch(`${baseUrl}/analytics/progress/snapshot`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            learnerId,
            overallBand: band,
          }),
        }),
      );

      await Promise.all(upserts);
    } catch (error) {
      this.logger.warn(
        `Failed to sync snapshot/band profile for attempt ${attempt.id}: ${String(error)}`,
      );
    }

    if (wrongQuestionIds.length === 0) return;

    try {
      await Promise.all(
        wrongQuestionIds.map((questionId) =>
          fetch(`${baseUrl}/analytics/mistakes`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              learnerId,
              questionId,
              mistakeType: 'wrong_answer',
            }),
          }),
        ),
      );
    } catch (error) {
      this.logger.warn(
        `Failed to sync mistakes for attempt ${attempt.id}: ${String(error)}`,
      );
    }
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

  // ─── RPC Helpers ────────────────────────────────────────────────────────────

  async getAnswersForQuestions(questionIds: string[]) {
    if (!questionIds || questionIds.length === 0) return [];
    return this.answerRepo
      .createQueryBuilder('qa')
      .select(['qa.questionId', 'qa.correctAnswers', 'qa.caseSensitive'])
      .where('qa.questionId IN (:...questionIds)', { questionIds })
      .getMany();
  }

  async getTestSkill(testId: string) {
    const test = await this.testRepo.findOne({
      where: { id: testId },
      select: ['skill'],
    });
    return { skill: test?.skill || 'reading' };
  }
}
