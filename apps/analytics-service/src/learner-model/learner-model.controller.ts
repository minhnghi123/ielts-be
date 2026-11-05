import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';
import { CurrentUser, RolesGuard, assertOwnerOrPrivileged } from '@app/common';
import type { RequestUser } from '@app/common';
import { LearnerModelService } from './learner-model.service';

export class KcFeedbackDto {
    @ApiProperty() @IsIn(['listening', 'reading', 'writing', 'speaking']) skill: string;
    @ApiProperty() @IsString() @MaxLength(50) kc: string;
    @ApiProperty({ enum: ['vung', 'chua_vung'] }) @IsIn(['vung', 'chua_vung']) verdict: 'vung' | 'chua_vung';
}

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics/learner-model')
@UseGuards(RolesGuard)
export class LearnerModelController {
    constructor(private readonly service: LearnerModelService) {}

    @Get(':learnerId')
    @ApiOperation({ summary: 'Mô hình học viên mở: band ước lượng (khoảng), mastery dạng câu/âm, từ sắp quên, nguyên nhân sai' })
    model(@Param('learnerId', ParseUUIDPipe) learnerId: string, @CurrentUser() user: RequestUser) {
        assertOwnerOrPrivileged(user, learnerId);
        return this.service.model(learnerId);
    }

    @Post(':learnerId/kc-feedback')
    @ApiOperation({ summary: 'Học viên phản hồi "đã vững / chưa vững" cho một dạng câu → điều chỉnh rating ±50 (1 lần/7 ngày)' })
    feedback(@Param('learnerId', ParseUUIDPipe) learnerId: string, @Body() dto: KcFeedbackDto, @CurrentUser() user: RequestUser) {
        assertOwnerOrPrivileged(user, learnerId);
        return this.service.feedback(learnerId, dto.skill, dto.kc, dto.verdict);
    }
}
