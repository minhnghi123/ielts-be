import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import {
  FileInterceptor,
  FilesInterceptor,
  AnyFilesInterceptor,
} from '@nestjs/platform-express';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  RMQ_PATTERNS,
  CurrentUser,
  Roles,
  Public,
  resolveLearnerId,
  isPrivileged,
} from '@app/common';
import type { RequestUser } from '@app/common';
import { TestServiceService } from './test-service.service';
import { ImportTestService } from './import/import-test.service';
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
import {
  SubmitTestAttemptDto,
  StartAttemptDto,
  SaveDraftDto,
  AiFeedbackDto,
} from './dto/submit-test.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';

const DEFAULT_ADMIN_ID =
  process.env.ADMIN_PROFILE_ID as string;

@ApiTags('Tests')
@ApiBearerAuth()
@Controller()
@Roles('admin')
export class TestServiceController {
  constructor(
    private readonly testService: TestServiceService,
    private readonly importTestService: ImportTestService,
  ) { }

  // ─── Import ───────────────────────────────────────────────────────────────────

  @Post('tests/import')
  @ApiOperation({
    summary:
      'Import a test from a .docx file (multipart). Add ?preview=true for dry-run.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: '.docx question file',
        },
        audioFiles: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: 'MP3 audio files (optional)',
        },
        adminId: {
          type: 'string',
          description: 'Admin profile UUID (optional, uses default)',
        },
      },
    },
  })
  @UseInterceptors(AnyFilesInterceptor())
  async importTest(
    @UploadedFiles() files: Express.Multer.File[],
    @Query('preview') preview: string,
    @Body('adminId') adminId?: string,
  ) {
    const docx = files?.find(
      (f) => f.fieldname === 'file' || f.originalname.endsWith('.docx'),
    );
    if (!docx)
      throw new BadRequestException(
        'A .docx file is required (field name: "file")',
      );

    const audioUrls: Record<string, string> = {};
    // Audio files are stored in-memory for now; in production, upload to S3/CDN
    // For the preview endpoint we just note the filename
    const audioFiles = files?.filter(
      (f) => f.fieldname === 'audioFiles' || f.originalname.endsWith('.mp3'),
    );
    audioFiles?.forEach((af) => {
      // Placeholder URL – in a real deployment, upload to cloud storage first
      audioUrls[af.originalname] = `/audio/${af.originalname}`;
    });

    return this.importTestService.importFromBuffer(docx.buffer, {
      adminProfileId: adminId || DEFAULT_ADMIN_ID,
      audioUrls,
      dryRun: preview === 'true',
    });
  }

  // ─── Tests ───────────────────────────────────────────────────────────────────

  @Get('tests')
  @Public()
  @ApiOperation({
    summary: 'List tests with filters and pagination (learners only see published tests)',
  })
  @ApiResponse({ status: 200, description: 'Paginated test list' })
  getTests(@Query() query: QueryTestsDto, @CurrentUser() user: RequestUser | null) {
    return this.testService.getTests(query, isPrivileged(user));
  }

  @Get('tests/:id')
  @Public()
  @ApiOperation({
    summary:
      'Get a test by ID. Answers and explanations are only included for admins — learners receive them on the attempt result.',
  })
  @ApiResponse({ status: 200, description: 'Test detail' })
  @ApiResponse({ status: 404, description: 'Test not found' })
  getTestById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser | null) {
    return this.testService.getTestById(id, { includeAnswers: isPrivileged(user) });
  }

  @Post('tests')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new test' })
  @ApiResponse({ status: 201, description: 'Test created' })
  createTest(@Body() dto: CreateTestDto) {
    return this.testService.createTest(dto);
  }

  @Post('tests/manual')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Create a new test manually with nested sections, questions, and answers',
  })
  @ApiResponse({ status: 201, description: 'Manual test created successfully' })
  createManualTest(@Body() dto: CreateManualTestDto) {
    return this.testService.createManualTest(dto);
  }

  @Post('tests/writing')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a full Writing test (Task 1 + Task 2 with rich config)' })
  @ApiResponse({ status: 201, description: 'Writing test created' })
  createWritingTest(@Body() dto: CreateWritingTestDto) {
    return this.testService.createWritingTest(dto);
  }

  @Post('tests/speaking')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a full Speaking test (Part 1 + Part 2 + Part 3 with rich config)' })
  @ApiResponse({ status: 201, description: 'Speaking test created' })
  createSpeakingTest(@Body() dto: CreateSpeakingTestDto) {
    return this.testService.createSpeakingTest(dto);
  }

  @Put('tests/:id/writing')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a full Writing test (Atomic replace)' })
  @ApiResponse({ status: 200, description: 'Writing test updated' })
  updateWritingTest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateWritingTestDto,
  ) {
    return this.testService.updateWritingTest(id, dto);
  }

  @Put('tests/:id/speaking')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a full Speaking test (Atomic replace)' })
  @ApiResponse({ status: 200, description: 'Speaking test updated' })
  updateSpeakingTest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSpeakingTestDto,
  ) {
    return this.testService.updateSpeakingTest(id, dto);
  }

  @Put('tests/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a test' })
  updateTest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateTestDto>,
  ) {
    return this.testService.updateTest(id, dto);
  }

  @Delete('tests/:id')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a test' })
  @ApiResponse({ status: 204, description: 'Test deleted' })
  deleteTest(@Param('id', ParseUUIDPipe) id: string) {
    return this.testService.deleteTest(id);
  }

  // ─── Sections ─────────────────────────────────────────────────────────────────

  @Get('tests/:testId/sections')
  @ApiOperation({ summary: 'Get sections of a test with questions' })
  getSections(@Param('testId', ParseUUIDPipe) testId: string) {
    return this.testService.getSectionsByTestId(testId);
  }

  @Post('tests/:testId/sections')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a section to a test' })
  createSection(
    @Param('testId', ParseUUIDPipe) testId: string,
    @Body() dto: CreateSectionDto,
  ) {
    return this.testService.createSection(testId, dto);
  }

  @Put('sections/:sectionId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a section' })
  updateSection(
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Body() dto: Partial<CreateSectionDto>,
  ) {
    return this.testService.updateSection(sectionId, dto);
  }

  @Delete('sections/:sectionId')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a section' })
  deleteSection(@Param('sectionId', ParseUUIDPipe) sectionId: string) {
    return this.testService.deleteSection(sectionId);
  }

  // ─── Question Groups ──────────────────────────────────────────────────────────

  @Post('sections/:sectionId/groups')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a question group to a section' })
  createGroup(
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Body() dto: CreateGroupDto,
  ) {
    return this.testService.createGroup(sectionId, dto);
  }

  @Put('groups/:groupId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a question group' })
  updateGroup(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: Partial<CreateGroupDto>,
  ) {
    return this.testService.updateGroup(groupId, dto);
  }

  @Delete('groups/:groupId')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a question group' })
  deleteGroup(@Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.testService.deleteGroup(groupId);
  }

  // ─── Questions ────────────────────────────────────────────────────────────────

  @Get('groups/:groupId/questions')
  @ApiOperation({ summary: 'Get questions in a group with answers' })
  getQuestions(@Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.testService.getQuestionsByGroupId(groupId);
  }

  @Post('groups/:groupId/questions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a question (with answer) to a group' })
  createQuestion(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: CreateQuestionDto,
  ) {
    return this.testService.createQuestion(groupId, dto);
  }

  @Put('questions/:questionId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a question' })
  updateQuestion(
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: Partial<CreateQuestionDto>,
  ) {
    return this.testService.updateQuestion(questionId, dto);
  }

  @Delete('questions/:questionId')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a question' })
  deleteQuestion(@Param('questionId', ParseUUIDPipe) questionId: string) {
    return this.testService.deleteQuestion(questionId);
  }

  // ─── Writing Tasks ────────────────────────────────────────────────────────────

  @Get('tests/:testId/writing-tasks')
  @Roles('admin', 'learner')
  @ApiOperation({ summary: 'Get writing tasks for a test' })
  getWritingTasks(@Param('testId', ParseUUIDPipe) testId: string) {
    return this.testService.getWritingTasksByTestId(testId);
  }

  @Post('tests/:testId/writing-tasks')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a writing task to a test' })
  createWritingTask(
    @Param('testId', ParseUUIDPipe) testId: string,
    @Body() dto: CreateWritingTaskDto,
  ) {
    return this.testService.createWritingTask(testId, dto);
  }

  // ─── Speaking Parts ──────────────────────────────────────────────────────────

  @Get('tests/:testId/speaking-parts')
  @Roles('admin', 'learner')
  @ApiOperation({ summary: 'Get speaking parts for a test' })
  getSpeakingParts(@Param('testId', ParseUUIDPipe) testId: string) {
    return this.testService.getSpeakingPartsByTestId(testId);
  }

  @Post('tests/:testId/speaking-parts')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a speaking part to a test' })
  createSpeakingPart(
    @Param('testId', ParseUUIDPipe) testId: string,
    @Body() dto: CreateSpeakingPartDto,
  ) {
    return this.testService.createSpeakingPart(testId, dto);
  }

  // ─── Test Attempts ────────────────────────────────────────────────────────────
  //
  // Lifecycle (all state lives on the server):
  //   POST  tests/:testId/attempts   → start (or resume the open attempt) → expiresAt
  //   GET   attempts/active?testId=  → find the open attempt for the current learner
  //   PUT   attempts/:id/draft       → autosave answers
  //   POST  attempts/:id/submit      → grade R/L, close attempt
  //   GET   attempts/:id             → in progress: no answers; submitted: full review
  //   PUT   attempts/:id/ai-feedback → internal: store Writing/Speaking AI band

  @Post('tests/:testId/attempts')
  @Roles('learner', 'admin')
  @ApiOperation({ summary: 'Start a new attempt (or return the unfinished one) for the current learner' })
  startAttempt(
    @Param('testId', ParseUUIDPipe) testId: string,
    @Body() dto: StartAttemptDto,
    @CurrentUser() user: RequestUser,
    @Body('learnerId') legacyLearnerId?: string,
  ) {
    return this.testService.startAttempt(testId, resolveLearnerId(user, legacyLearnerId), dto);
  }

  @Get('attempts/active')
  @Roles('learner', 'admin')
  @ApiOperation({ summary: 'Get the in-progress attempt of the current learner for a test (404 if none)' })
  getActiveAttempt(
    @Query('testId', ParseUUIDPipe) testId: string,
    @CurrentUser() user: RequestUser,
    @Query('learnerId') legacyLearnerId?: string,
  ) {
    return this.testService.getActiveAttempt(testId, resolveLearnerId(user, legacyLearnerId));
  }

  @Put('attempts/:attemptId/draft')
  @Roles('learner', 'admin')
  @ApiOperation({ summary: 'Autosave answers of an in-progress attempt' })
  saveDraft(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() dto: SaveDraftDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.testService.saveDraft(attemptId, dto.answers ?? {}, user);
  }

  @Post('attempts/:attemptId/submit')
  @Roles('learner', 'admin')
  @ApiOperation({ summary: 'Submit answers and complete an attempt (Reading/Listening graded instantly)' })
  submitAttempt(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() dto: SubmitTestAttemptDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.testService.submitAttempt(attemptId, dto, user);
  }

  @Get('attempts/:attemptId')
  @Roles('learner', 'admin', 'system')
  @ApiOperation({ summary: 'Get an attempt. Correct answers & explanations are included once submitted.' })
  @ApiResponse({ status: 200, description: 'Attempt details' })
  @ApiResponse({ status: 404, description: 'Attempt not found' })
  getAttemptById(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.testService.getAttemptForUser(attemptId, user);
  }

  @Get('attempts')
  @Roles('learner', 'admin')
  @ApiOperation({ summary: 'List attempts of the current learner (admins may pass ?learnerId=)' })
  getAttemptsByLearnerId(
    @CurrentUser() user: RequestUser,
    @Query('learnerId') learnerId?: string,
  ) {
    return this.testService.getAttemptsByLearnerId(resolveLearnerId(user, learnerId));
  }

  @Put('attempts/:attemptId/ai-feedback')
  @Roles('system', 'admin')
  @ApiOperation({ summary: '[Internal] Store AI feedback and band score for a Writing/Speaking attempt' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async saveAiFeedback(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() dto: AiFeedbackDto,
  ) {
    await this.testService.saveAiFeedback(attemptId, dto);
  }

  // ─── RPC (RabbitMQ) ───────────────────────────────────────────────────────────

  @MessagePattern(RMQ_PATTERNS.TEST.GET_ANSWERS)
  async getAnswersForQuestions(@Payload() questionIds: string[]) {
    return this.testService.getAnswersForQuestions(questionIds);
  }

  @MessagePattern(RMQ_PATTERNS.TEST.GET_SKILL)
  async getTestSkill(@Payload() testId: string) {
    return this.testService.getTestSkill(testId);
  }
}
