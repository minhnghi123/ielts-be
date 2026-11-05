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
    Logger,
} from '@nestjs/common';
import { EventPattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import {
    RMQ_PATTERNS,
    CurrentUser,
    Roles,
    assertOwnerOrPrivileged,
    resolveLearnerId,
} from '@app/common';
import type { RequestUser } from '@app/common';
import { SubmissionServiceService } from './submission-service.service';
import { CreateWritingSubmissionDto } from './dto/create-writing-submission.dto';
import { CreateSpeakingSubmissionDto } from './dto/create-speaking-submission.dto';
import { CreateWritingGradingDto } from './dto/create-writing-grading.dto';
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
    private readonly logger = new Logger(SubmissionServiceController.name);

    constructor(private readonly service: SubmissionServiceService) { }

    // ─── Admin stats ──────────────────────────────────────────────────────────────

    @Get('stats/global')
    @Roles('admin')
    @ApiOperation({ summary: 'Get global attempt statistics like average score' })
    getGlobalStats() {
        return this.service.getGlobalStats();
    }

    @Get('stats/recent-activity')
    @Roles('admin')
    @ApiOperation({ summary: 'Get recent global test attempt activity' })
    getRecentActivity() {
        return this.service.getRecentActivity();
    }

    // ─── Writing Submissions ──────────────────────────────────────────────────────

    @Post('writing-submissions')
    @ApiOperation({ summary: 'Submit a writing essay (grading_status: pending)' })
    createWritingSubmission(@Body() dto: CreateWritingSubmissionDto, @CurrentUser() user: RequestUser) {
        return this.service.createWritingSubmission({ ...dto, learnerId: resolveLearnerId(user, dto.learnerId) });
    }

    @Get('writing-submissions/:id')
    @ApiOperation({ summary: 'Get writing submission with scores' })
    async getWritingSubmission(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
        const sub = await this.service.getWritingSubmission(id);
        assertOwnerOrPrivileged(user, sub.learnerId);
        return sub;
    }

    @Get('learners/:learnerId/writing-progress')
    @ApiOperation({ summary: 'Tiến bộ Writing: chuỗi bản gốc → bản sửa (band, lỗi theo loại, so sánh) + xu hướng lỗi' })
    getWritingProgress(@Param('learnerId', ParseUUIDPipe) learnerId: string, @CurrentUser() user: RequestUser) {
        assertOwnerOrPrivileged(user, learnerId);
        return this.service.getWritingProgress(learnerId);
    }

    @Get('learners/:learnerId/writing-submissions')
    @ApiOperation({ summary: "List a learner's writing submissions" })
    getWritingByLearner(@Param('learnerId', ParseUUIDPipe) learnerId: string, @CurrentUser() user: RequestUser) {
        assertOwnerOrPrivileged(user, learnerId);
        return this.service.getWritingSubmissionsByLearner(learnerId);
    }

    // ─── AI Writing Gradings ──────────────────────────────────────────────────────

    @Post('writing-gradings')
    @Roles('system', 'admin')
    @ApiOperation({ summary: 'Save AI writing grading result' })
    @ApiResponse({ status: 201, description: 'Grading saved' })
    createWritingGrading(@Body() dto: CreateWritingGradingDto) {
        return this.service.createWritingGrading(dto);
    }

    @Get('writing-gradings/:id')
    @ApiOperation({ summary: 'Get AI writing grading by ID' })
    async getWritingGrading(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
        const grading = await this.service.getWritingGrading(id);
        const sub = await this.service.getWritingSubmission(grading.submissionId);
        assertOwnerOrPrivileged(user, sub.learnerId);
        return grading;
    }

    @Get('writing-gradings/by-submission/:submissionId')
    @ApiOperation({ summary: 'Get AI writing grading by submission ID' })
    async getWritingGradingBySubmission(@Param('submissionId', ParseUUIDPipe) submissionId: string, @CurrentUser() user: RequestUser) {
        const sub = await this.service.getWritingSubmission(submissionId);
        assertOwnerOrPrivileged(user, sub.learnerId);
        return this.service.getWritingGradingBySubmission(submissionId);
    }

    // ─── Speaking Submissions ─────────────────────────────────────────────────────

    @Post('speaking-submissions')
    @ApiOperation({ summary: 'Submit a speaking recording (grading_status: pending)' })
    createSpeakingSubmission(@Body() dto: CreateSpeakingSubmissionDto, @CurrentUser() user: RequestUser) {
        return this.service.createSpeakingSubmission({ ...dto, learnerId: resolveLearnerId(user, dto.learnerId) });
    }

    @Get('speaking-submissions/:id')
    @ApiOperation({ summary: 'Get speaking submission with scores' })
    async getSpeakingSubmission(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
        const sub = await this.service.getSpeakingSubmission(id);
        assertOwnerOrPrivileged(user, sub.learnerId);
        return sub;
    }

    @Get('learners/:learnerId/speaking-submissions')
    @ApiOperation({ summary: "List a learner's speaking submissions" })
    getSpeakingByLearner(@Param('learnerId', ParseUUIDPipe) learnerId: string, @CurrentUser() user: RequestUser) {
        assertOwnerOrPrivileged(user, learnerId);
        return this.service.getSpeakingSubmissionsByLearner(learnerId);
    }

    // ─── Asynchronous Handlers (Message Broker) ───────────────────────────────────

    @EventPattern(RMQ_PATTERNS.GRADING.GRADE_WRITING)
    async handleGradeWritingEvent(@Payload() data: any, @Ctx() context: RmqContext) {
        this.logger.log(`[RMQ Worker] Received GRADE_WRITING for submission: ${data.submissionId}`);
        const channel = context.getChannelRef();
        const originalMsg = context.getMessage();

        try {
            // TODO: Integrate LLM AI call here in the future.
            // For now, we simulate processing and mark as graded
            this.logger.debug(`[RMQ Worker] Processing writing content: ${data.content?.substring(0, 50)}...`);
            
            // Simulating a long-running AI request
            await new Promise((resolve) => setTimeout(resolve, 3000));
            
            this.logger.log(`[RMQ Worker] Grading completed successfully for submission: ${data.submissionId}`);
            channel.ack(originalMsg);
        } catch (error) {
            this.logger.error(`[RMQ Worker] Error grading writing task: ${error.message}`);
            // Nack the message and do not requeue if we don't want an infinite loop, or requeue if transient
            channel.nack(originalMsg, false, false);
        }
    }

    @EventPattern(RMQ_PATTERNS.GRADING.GRADE_SPEAKING)
    async handleGradeSpeakingEvent(@Payload() data: any, @Ctx() context: RmqContext) {
        this.logger.log(`[RMQ Worker] Received GRADE_SPEAKING for submission: ${data.submissionId}`);
        const channel = context.getChannelRef();
        const originalMsg = context.getMessage();

        try {
            // TODO: Integrate Audio/LLM AI call here.
            this.logger.debug(`[RMQ Worker] Processing speaking audio: ${data.audioUrl}`);
            await new Promise((resolve) => setTimeout(resolve, 3000));
            this.logger.log(`[RMQ Worker] Grading completed successfully for submission: ${data.submissionId}`);
            channel.ack(originalMsg);
        } catch (error) {
            this.logger.error(`[RMQ Worker] Error grading speaking task: ${error.message}`);
            channel.nack(originalMsg, false, false);
        }
    }
}
