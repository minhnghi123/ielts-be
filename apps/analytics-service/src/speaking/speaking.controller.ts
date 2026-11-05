import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser, Roles, RolesGuard, assertOwnerOrPrivileged } from '@app/common';
import type { RequestUser } from '@app/common';
import { SPEAKING_LEVELS, type SpeakingLevel } from './speaking-exercise.entity';
import { SOUND_TIPS_VI, SpeakingService } from './speaking.service';

export class ExerciseInputDto {
    @ApiProperty({ enum: SPEAKING_LEVELS }) @IsIn(SPEAKING_LEVELS) level: SpeakingLevel;
    @ApiProperty() @IsString() @MaxLength(1000) text: string;
    @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) ipa?: string;
    @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) targetSounds?: string[];
    @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) topic?: string;
    @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) difficulty?: number;
    @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) shuffledTokens?: string[];
    @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1200) sampleAnswer?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(400) tipVi?: string;
}
export class BulkExercisesDto {
    @ApiProperty({ type: [ExerciseInputDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => ExerciseInputDto) items: ExerciseInputDto[];
}
export class SetActiveDto { @ApiProperty() @IsBoolean() isActive: boolean; }
export class RecordAttemptDto {
    @ApiPropertyOptional() @IsOptional() @IsUUID('4') exerciseId?: string;
    @ApiProperty({ enum: SPEAKING_LEVELS }) @IsIn(SPEAKING_LEVELS) level: SpeakingLevel;
    @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) audioUrl?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) transcript?: string;
    @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(900) durationS?: number;
    @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(400) wpm?: number;
    @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) pauses?: number;
    @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) fillers?: number;
    @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(400) wordResults?: Array<{ word: string; status: 'correct' | 'substituted' | 'omitted' | 'inserted'; heard?: string | null; sounds?: Array<{ expected: string; actual: string | null }> }>;
    @ApiPropertyOptional() @IsOptional() scores?: Record<string, number | string | null>;
    @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(50) errorsJson?: unknown[];
    @ApiPropertyOptional() @IsOptional() @IsIn(['groq', 'azure']) provider?: string;
}

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics/speaking')
@UseGuards(RolesGuard)
export class SpeakingController {
    constructor(private readonly speaking: SpeakingService) {}

    @Get('exercises')
    @ApiOperation({ summary: 'Bài luyện nói theo bậc (word | sentence_build | sentence | free), lọc theo topic / âm / độ khó' })
    list(@Query('level') level?: string, @Query('topic') topic?: string, @Query('sound') sound?: string, @Query('difficulty') difficulty?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
        return this.speaking.listExercises({ level, topic, sound, difficulty: difficulty ? parseInt(difficulty, 10) || undefined : undefined, limit: limit ? parseInt(limit, 10) || undefined : undefined, offset: offset ? parseInt(offset, 10) || 0 : 0 });
    }

    @Get('sounds')
    @ApiOperation({ summary: 'Danh mục âm hay sai với người Việt + mẹo tiếng Việt' })
    sounds() { return Object.entries(SOUND_TIPS_VI).map(([sound, v]) => ({ sound, ...v })); }

    @Get('exercises/:id')
    getOne(@Param('id', ParseUUIDPipe) id: string) { return this.speaking.getExercise(id); }

    @Post('exercises/bulk')
    @Roles('admin', 'teacher', 'system')
    @ApiOperation({ summary: 'Admin/giáo viên: tạo hoặc cập nhật nhiều bài (idempotent theo level + text)' })
    bulk(@Body() dto: BulkExercisesDto, @CurrentUser() user: RequestUser) { return this.speaking.upsertExercises(dto.items, user?.profileId ?? null); }

    @Patch('exercises/:id/active')
    @Roles('admin', 'teacher')
    setActive(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetActiveDto) { return this.speaking.setActive(id, dto.isActive); }

    @Post('attempts')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Học viên lưu một lượt luyện nói đã chấm; cập nhật Elo theo âm' })
    record(@Body() dto: RecordAttemptDto, @CurrentUser() user: RequestUser) {
        if (!user?.profileId) throw new ForbiddenException('Cần đăng nhập học viên');
        return this.speaking.recordAttempt(user.profileId, dto);
    }

    @Get('attempts/:learnerId')
    @ApiOperation({ summary: 'Lượt luyện nói của học viên (chủ sở hữu, giáo viên, admin)' })
    attempts(@Param('learnerId', ParseUUIDPipe) learnerId: string, @CurrentUser() user: RequestUser, @Query('exerciseId') exerciseId?: string, @Query('level') level?: string, @Query('limit') limit?: string) {
        assertOwnerOrPrivileged(user, learnerId);
        return this.speaking.listAttempts(learnerId, { exerciseId, level, limit: limit ? parseInt(limit, 10) || undefined : undefined });
    }

    @Delete('attempts/:id/audio')
    @ApiOperation({ summary: 'Học viên xoá bản ghi âm của mình' })
    deleteAudio(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
        if (!user?.profileId) throw new ForbiddenException();
        return this.speaking.deleteAttemptAudio(user.profileId, id);
    }

    @Get('summary/:learnerId')
    @ApiOperation({ summary: 'Tiến độ 4 bậc + âm yếu (Elo) cho trang Luyện nói' })
    summary(@Param('learnerId', ParseUUIDPipe) learnerId: string, @CurrentUser() user: RequestUser) {
        assertOwnerOrPrivileged(user, learnerId);
        return this.speaking.summary(learnerId);
    }
}
