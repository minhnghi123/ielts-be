import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Query,
    ParseUUIDPipe,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { SubmissionServiceService } from './submission-service.service';
import { StartAttemptDto } from './dto/start-attempt.dto';
import { SaveAnswerDto } from './dto/save-answer.dto';
import { CreateWritingSubmissionDto } from './dto/create-writing-submission.dto';
import { CreateSpeakingSubmissionDto } from './dto/create-speaking-submission.dto';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('Submissions')
@ApiBearerAuth()
@Controller()
export class SubmissionServiceController {
    constructor(private readonly service: SubmissionServiceService) { }

    // ─── Test Attempts ────────────────────────────────────────────────────────────

    @Post('attempts')
    @ApiOperation({ summary: 'Start a new test attempt' })
    @ApiResponse({ status: 201, description: 'Attempt started' })
    startAttempt(@Body() dto: StartAttemptDto) {
        return this.service.startAttempt(dto);
    }

    @Post('attempts/:id/answers')
    @ApiOperation({ summary: 'Save or update an answer during an attempt' })
    saveAnswer(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: SaveAnswerDto,
    ) {
        return this.service.saveAnswer(id, dto);
    }

    @Post('attempts/:id/submit')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Submit attempt: auto-grades Reading/Listening, returns scores' })
    @ApiResponse({ status: 200, description: 'Attempt submitted with band_score' })
    submitAttempt(@Param('id', ParseUUIDPipe) id: string) {
        return this.service.submitAttempt(id);
    }

    @Get('attempts/:id')
    @ApiOperation({ summary: 'Get attempt detail with all question attempts' })
    getAttempt(@Param('id', ParseUUIDPipe) id: string) {
        return this.service.getAttempt(id);
    }

    @Get('learners/:learnerId/attempts')
    @ApiOperation({ summary: "List a learner's test attempts" })
    getAttemptsByLearner(@Param('learnerId', ParseUUIDPipe) learnerId: string) {
        return this.service.getAttemptsByLearner(learnerId);
    }

    @Get('stats/global')
    @ApiOperation({ summary: 'Get global attempt statistics like average score' })
    getGlobalStats() {
        return this.service.getGlobalStats();
    }

    @Get('stats/recent-activity')
    @ApiOperation({ summary: 'Get recent global test attempt activity' })
    getRecentActivity() {
        return this.service.getRecentActivity();
    }

    // ─── Writing Submissions ──────────────────────────────────────────────────────

    @Post('writing-submissions')
    @ApiOperation({ summary: 'Submit a writing essay (grading_status: pending)' })
    createWritingSubmission(@Body() dto: CreateWritingSubmissionDto) {
        return this.service.createWritingSubmission(dto);
    }

    @Get('writing-submissions/:id')
    @ApiOperation({ summary: 'Get writing submission with scores' })
    getWritingSubmission(@Param('id', ParseUUIDPipe) id: string) {
        return this.service.getWritingSubmission(id);
    }

    @Get('learners/:learnerId/writing-submissions')
    @ApiOperation({ summary: "List a learner's writing submissions" })
    getWritingByLearner(@Param('learnerId', ParseUUIDPipe) learnerId: string) {
        return this.service.getWritingSubmissionsByLearner(learnerId);
    }

    // ─── Speaking Submissions ─────────────────────────────────────────────────────

    @Post('speaking-submissions')
    @ApiOperation({ summary: 'Submit a speaking recording (grading_status: pending)' })
    createSpeakingSubmission(@Body() dto: CreateSpeakingSubmissionDto) {
        return this.service.createSpeakingSubmission(dto);
    }

    @Get('speaking-submissions/:id')
    @ApiOperation({ summary: 'Get speaking submission with scores' })
    getSpeakingSubmission(@Param('id', ParseUUIDPipe) id: string) {
        return this.service.getSpeakingSubmission(id);
    }

    @Get('learners/:learnerId/speaking-submissions')
    @ApiOperation({ summary: "List a learner's speaking submissions" })
    getSpeakingByLearner(@Param('learnerId', ParseUUIDPipe) learnerId: string) {
        return this.service.getSpeakingSubmissionsByLearner(learnerId);
    }
}
