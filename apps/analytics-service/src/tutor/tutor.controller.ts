import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Patch, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { CurrentUser, ERROR_CAUSES, Roles, RolesGuard } from '@app/common';
import type { ErrorCause, RequestUser } from '@app/common';
import { TutorService } from './tutor.service';
import type { HintsVi } from './question-hint.entity';

export class SelfCauseDto {
    @ApiProperty() @IsUUID() questionId: string;
    @ApiPropertyOptional() @IsOptional() @IsUUID() attemptId?: string;
    @ApiProperty({ enum: ERROR_CAUSES }) @IsIn(ERROR_CAUSES as readonly string[]) selfCause: ErrorCause;
}
export class PutHintsDto {
    @ApiProperty() @IsUUID() questionId: string;
    @ApiProperty() @IsString() @Length(8, 32) contentHash: string;
    @ApiProperty() @IsObject() hintsVi: HintsVi;
    @ApiPropertyOptional() @IsOptional() @IsString() model?: string;
}

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics/tutor')
@UseGuards(RolesGuard)
export class TutorController {
    constructor(private readonly service: TutorService) {}

    @Patch('self-cause')
    @ApiOperation({ summary: 'Học viên tự nhận nguyên nhân sai ("Vì sao bạn chọn đáp án này?") cho một câu trong sổ lỗi của chính mình' })
    selfCause(@Body() dto: SelfCauseDto, @CurrentUser() user: RequestUser) {
        if (!user?.profileId) throw new ForbiddenException('Learner profile required');
        return this.service.setSelfCause(user.profileId, dto.questionId, dto.attemptId ?? null, dto.selfCause);
    }

    @Get('hints/:questionId')
    @ApiOperation({ summary: 'Gợi ý đã cache cho câu hỏi (theo hash nội dung)' })
    async hints(@Param('questionId', ParseUUIDPipe) questionId: string, @Query('hash') hash: string | undefined) {
        if (!hash) return null;
        return (await this.service.getHints(questionId, hash)) ?? null;
    }

    @Put('hints')
    @Roles('system', 'admin')
    @ApiOperation({ summary: 'Lưu gợi ý AI cho câu hỏi (system)' })
    putHints(@Body() dto: PutHintsDto) {
        return this.service.putHints(dto.questionId, dto.contentHash, dto.hintsVi, dto.model ?? null);
    }
}
