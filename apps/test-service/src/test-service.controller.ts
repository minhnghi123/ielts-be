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
import { TestServiceService } from './test-service.service';
import { ImportTestService } from './import/import-test.service';
import { CreateTestDto } from './dto/create-test.dto';
import { CreateSectionDto } from './dto/create-section.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { CreateWritingTaskDto } from './dto/create-writing-task.dto';
import { CreateSpeakingPartDto } from './dto/create-speaking-part.dto';
import { QueryTestsDto } from './dto/query-tests.dto';
import { CreateManualTestDto } from './dto/create-manual-test.dto';
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
@Controller()
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
  @ApiOperation({
    summary: 'List all tests with optional filters and pagination',
  })
  @ApiResponse({ status: 200, description: 'Paginated test list' })
  getTests(@Query() query: QueryTestsDto) {
    return this.testService.getTests(query);
  }

  @Get('tests/:id')
  @ApiOperation({
    summary: 'Get a test by ID (with sections, questions, answers)',
  })
  @ApiResponse({ status: 200, description: 'Full test detail' })
  @ApiResponse({ status: 404, description: 'Test not found' })
  getTestById(@Param('id', ParseUUIDPipe) id: string) {
    return this.testService.getTestById(id);
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
}
