import { Body, Controller, ForbiddenException, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CurrentUser, Roles, RolesGuard, assertOwnerOrPrivileged } from '@app/common';
import type { RequestUser } from '@app/common';
import { PlanService } from './plan.service';

export class SetTaskDoneDto {
    @ApiProperty() @IsBoolean() done: boolean;
    @ApiPropertyOptional() @IsOptional() @IsUUID() resultRef?: string;
}

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
@UseGuards(RolesGuard)
export class PlanController {
    constructor(private readonly plan: PlanService) {}

    @Get('plan/:learnerId')
    @ApiOperation({ summary: "This week's adaptive study plan (generated on first read)" })
    getWeek(@Param('learnerId', ParseUUIDPipe) learnerId: string, @CurrentUser() user: RequestUser) {
        assertOwnerOrPrivileged(user, learnerId);
        return this.plan.getWeek(learnerId);
    }

    @Post('plan/:learnerId/regenerate')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Rebuild undone tasks of the current week from fresh signals' })
    regenerate(@Param('learnerId', ParseUUIDPipe) learnerId: string, @CurrentUser() user: RequestUser) {
        assertOwnerOrPrivileged(user, learnerId);
        return this.plan.regenerate(learnerId);
    }

    @Patch('plan/tasks/:id/done')
    @ApiOperation({ summary: 'Mark a plan task done / undone' })
    setDone(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetTaskDoneDto, @CurrentUser() user: RequestUser) {
        if (!user.profileId) throw new ForbiddenException('Learner profile required');
        return this.plan.setDone(id, user.profileId, dto.done, dto.resultRef ?? null);
    }

    @Get('today/:learnerId')
    @ApiOperation({ summary: "Today's tasks + overdue, due reviews, streak, band strip" })
    today(@Param('learnerId', ParseUUIDPipe) learnerId: string, @CurrentUser() user: RequestUser) {
        assertOwnerOrPrivileged(user, learnerId);
        return this.plan.today(learnerId);
    }

    @Post('plan/rebuild-all')
    @Roles('system', 'admin')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Cron entry point: ensure every learner with goals has this week\'s plan' })
    rebuildAll() {
        return this.plan.rebuildAll();
    }
}
