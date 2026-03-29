import {
    Controller,
    Get,
    Post,
    Put,
    Param,
    Body,
    ParseUUIDPipe,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { AnalyticsServiceService } from './analytics-service.service';
import {
    UpsertBandProfileDto,
    CreateSnapshotDto,
    CreateMistakeDto,
} from './dto/analytics.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsServiceController {
    constructor(private readonly service: AnalyticsServiceService) { }

    // ─── Learner endpoints ────────────────────────────────────────────────────────

    @Get('summary/:learnerId')
    @ApiOperation({ summary: 'Get full dashboard summary for a learner' })
    getDashboardSummary(@Param('learnerId', ParseUUIDPipe) learnerId: string) {
        return this.service.getDashboardSummary(learnerId);
    }

    @Get('band-profiles/:learnerId')
    @ApiOperation({ summary: 'Get per-skill band profiles for a learner' })
    getBandProfiles(@Param('learnerId', ParseUUIDPipe) learnerId: string) {
        return this.service.getBandProfiles(learnerId);
    }

    @Put('band-profiles')
    @ApiOperation({ summary: 'Create or update a band profile for a learner+skill' })
    upsertBandProfile(@Body() dto: UpsertBandProfileDto) {
        return this.service.upsertBandProfile(dto);
    }

    @Get('progress/:learnerId')
    @ApiOperation({ summary: 'Get overall band score history for charting' })
    getProgress(@Param('learnerId', ParseUUIDPipe) learnerId: string) {
        return this.service.getProgressSnapshots(learnerId);
    }

    @Post('progress/snapshot')
    @ApiOperation({ summary: 'Record a new overall band snapshot after test completion' })
    createSnapshot(@Body() dto: CreateSnapshotDto) {
        return this.service.createSnapshot(dto);
    }

    @Get('mistakes/:learnerId')
    @ApiOperation({ summary: "Get a learner's mistake history" })
    getMistakes(@Param('learnerId', ParseUUIDPipe) learnerId: string) {
        return this.service.getMistakes(learnerId);
    }

    @Post('mistakes')
    @ApiOperation({ summary: 'Record a mistake for a learner on a question' })
    recordMistake(@Body() dto: CreateMistakeDto) {
        return this.service.recordMistake(dto);
    }

    // ─── Sync endpoints ───────────────────────────────────────────────────────────

    @Post('sync/:learnerId')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Full analytics sync for one learner — rebuilds band profiles, snapshots, and mistakes from source tables',
    })
    syncLearner(@Param('learnerId', ParseUUIDPipe) learnerId: string) {
        return this.service.fullSyncLearnerAnalytics(learnerId);
    }

    @Post('sync-all')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Sync analytics for ALL learners who have submitted attempts (admin)',
    })
    syncAll() {
        return this.service.syncAllLearnersAnalytics();
    }

    // ─── Admin endpoints ──────────────────────────────────────────────────────────

    @Get('admin/global-stats')
    @ApiOperation({
        summary: 'Platform-wide analytics: total users, attempts per day, band distribution, top learners',
    })
    getAdminGlobalStats() {
        return this.service.getAdminGlobalStats();
    }
}
