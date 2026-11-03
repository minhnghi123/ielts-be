import {
    Controller,
    Get,
    Post,
    Put,
    Param,
    Body,
    Query,
    ParseUUIDPipe,
    HttpCode,
    HttpStatus,
    Logger,
    UseGuards,
} from '@nestjs/common';
import { EventPattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import {
    RMQ_PATTERNS,
    CurrentUser,
    Roles,
    RolesGuard,
    assertOwnerOrPrivileged,
} from '@app/common';
import type { RequestUser } from '@app/common';
import { AnalyticsServiceService } from './analytics-service.service';
import {
    UpsertBandProfileDto,
    CreateSnapshotDto,
    CreateMistakeDto,
} from './dto/analytics.dto';
import { UpsertLearnerGoalsDto } from './dto/learner-goals.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
@UseGuards(RolesGuard)
export class AnalyticsServiceController {
    private readonly logger = new Logger(AnalyticsServiceController.name);

    constructor(private readonly service: AnalyticsServiceService) { }

    // ─── Learner endpoints ────────────────────────────────────────────────────────

    @Get('summary/:learnerId')
    @ApiOperation({ summary: 'Get full dashboard summary for a learner' })
    getDashboardSummary(@Param('learnerId', ParseUUIDPipe) learnerId: string, @CurrentUser() user: RequestUser) {
        assertOwnerOrPrivileged(user, learnerId);
        return this.service.getDashboardSummary(learnerId);
    }

    @Get('goals/:learnerId')
    @ApiOperation({ summary: "Learner's target bands, exam date and study budget (null when not set yet)" })
    getGoals(@Param('learnerId', ParseUUIDPipe) learnerId: string, @CurrentUser() user: RequestUser) {
        assertOwnerOrPrivileged(user, learnerId);
        return this.service.getGoals(learnerId);
    }

    @Put('goals/:learnerId')
    @ApiOperation({ summary: 'Create or replace the learner goals; syncs per-skill target bands' })
    upsertGoals(
        @Param('learnerId', ParseUUIDPipe) learnerId: string,
        @Body() dto: UpsertLearnerGoalsDto,
        @CurrentUser() user: RequestUser,
    ) {
        assertOwnerOrPrivileged(user, learnerId);
        return this.service.upsertGoals(learnerId, dto);
    }

    @Get('band-profiles/:learnerId')
    @ApiOperation({ summary: 'Get per-skill band profiles for a learner' })
    getBandProfiles(@Param('learnerId', ParseUUIDPipe) learnerId: string, @CurrentUser() user: RequestUser) {
        assertOwnerOrPrivileged(user, learnerId);
        return this.service.getBandProfiles(learnerId);
    }

    @Put('band-profiles')
    @Roles('system', 'admin')
    @ApiOperation({ summary: 'Create or update a band profile for a learner+skill' })
    upsertBandProfile(@Body() dto: UpsertBandProfileDto) {
        return this.service.upsertBandProfile(dto);
    }

    @Get('progress/:learnerId')
    @ApiOperation({ summary: 'Get overall band score history for charting' })
    getProgress(@Param('learnerId', ParseUUIDPipe) learnerId: string, @CurrentUser() user: RequestUser) {
        assertOwnerOrPrivileged(user, learnerId);
        return this.service.getProgressSnapshots(learnerId);
    }

    @Post('progress/snapshot')
    @Roles('system', 'admin')
    @ApiOperation({ summary: 'Record a new overall band snapshot after test completion' })
    createSnapshot(@Body() dto: CreateSnapshotDto) {
        return this.service.createSnapshot(dto);
    }

    @Get('mistakes/:learnerId')
    @ApiOperation({ summary: "Get a learner's mistake history" })
    getMistakes(@Param('learnerId', ParseUUIDPipe) learnerId: string, @CurrentUser() user: RequestUser) {
        assertOwnerOrPrivileged(user, learnerId);
        return this.service.getMistakes(learnerId);
    }

    @Post('mistakes')
    @Roles('system', 'admin')
    @ApiOperation({ summary: 'Record a mistake for a learner on a question' })
    recordMistake(@Body() dto: CreateMistakeDto) {
        return this.service.recordMistake(dto);
    }

    @Get('leaderboard')
    @ApiOperation({ summary: 'Top learners by average band (visible to every signed-in learner)' })
    getLeaderboard(@Query('limit') limit: string | undefined, @CurrentUser() user: RequestUser) {
        const n = Math.min(100, Math.max(1, parseInt(limit ?? '50', 10) || 50));
        return this.service.getLeaderboard(n, user?.profileId ?? null);
    }

    // ─── Sync endpoints ───────────────────────────────────────────────────────────

    @Post('sync/:learnerId')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Full analytics sync for one learner — rebuilds band profiles, snapshots, and mistakes from source tables',
    })
    syncLearner(@Param('learnerId', ParseUUIDPipe) learnerId: string, @CurrentUser() user: RequestUser) {
        assertOwnerOrPrivileged(user, learnerId);
        return this.service.fullSyncLearnerAnalytics(learnerId);
    }

    @Post('sync-all')
    @Roles('admin')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Sync analytics for ALL learners who have submitted attempts (admin)',
    })
    syncAll() {
        return this.service.syncAllLearnersAnalytics();
    }

    // ─── Admin endpoints ──────────────────────────────────────────────────────────

    @Get('admin/global-stats')
    @Roles('admin')
    @ApiOperation({
        summary: 'Platform-wide analytics: total users, attempts per day, band distribution, top learners',
    })
    getAdminGlobalStats() {
        return this.service.getAdminGlobalStats();
    }

    // ─── Asynchronous Handlers (Message Broker) ───────────────────────────────────

    @EventPattern(RMQ_PATTERNS.ANALYTICS.TEST_SUBMITTED)
    async handleTestSubmittedEvent(@Payload() data: any, @Ctx() context: RmqContext) {
        this.logger.log(`[RMQ Worker] Received TEST_SUBMITTED event for learner: ${data.learnerId}`);
        const channel = context.getChannelRef();
        const originalMsg = context.getMessage();

        try {
            // Trigger an analytics sync for this learner now that they've submitted a test
            await this.service.fullSyncLearnerAnalytics(data.learnerId);
            this.logger.log(`[RMQ Worker] Analytics fully synced for learner: ${data.learnerId}`);
            channel.ack(originalMsg);
        } catch (error) {
            this.logger.error(`[RMQ Worker] Error syncing analytics for ${data.learnerId}: ${error.message}`);
            // We nack but do not requeue, as a full failure might just trigger next time
            channel.nack(originalMsg, false, false);
        }
    }
}
