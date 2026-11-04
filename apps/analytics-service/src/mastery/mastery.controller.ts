import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser, Roles, RolesGuard, assertOwnerOrPrivileged } from '@app/common';
import type { RequestUser } from '@app/common';
import { MasteryService } from './mastery.service';

class RateItemDto {
    @ApiProperty() @IsUUID() questionId: string;
    @ApiPropertyOptional() @IsOptional() @IsString() kc?: string;
    @ApiProperty() @IsBoolean() correct: boolean;
}
export class RateDto {
    @ApiProperty() @IsUUID() learnerId: string;
    @ApiProperty() @IsIn(['listening', 'reading', 'writing', 'speaking']) skill: string;
    @ApiProperty({ type: [RateItemDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => RateItemDto) items: RateItemDto[];
}
export class AddWordDto {
    @ApiProperty() @IsString() @MaxLength(80) word: string;
    @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(600) context?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(400) meaningVi?: string;
    @ApiPropertyOptional() @IsOptional() @IsUUID() testId?: string;
}
export class UpdateWordDto {
    @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(400) meaningVi?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(600) context?: string;
}
export class ReviewWordDto {
    @ApiProperty({ enum: ['again', 'good', 'easy'] }) @IsIn(['again', 'good', 'easy']) quality: 'again' | 'good' | 'easy';
}

const learnerOf = (user: RequestUser): string => {
    if (!user.profileId) throw new ForbiddenException('Learner profile required');
    return user.profileId;
};

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
@UseGuards(RolesGuard)
export class MasteryController {
    constructor(private readonly svc: MasteryService) {}

    @Post('kc/rate')
    @Roles('system', 'admin')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Elo update per answered question (called by test-service after grading / drills)' })
    rate(@Body() dto: RateDto) {
        return this.svc.rate(dto.learnerId, dto.skill, dto.items);
    }

    @Get('mastery/:learnerId')
    @ApiOperation({ summary: 'Per question-type mastery (Elo rating, accuracy, level)' })
    mastery(@Param('learnerId', ParseUUIDPipe) learnerId: string, @CurrentUser() user: RequestUser, @Query('skill') skill?: string) {
        assertOwnerOrPrivileged(user, learnerId);
        return this.svc.mastery(learnerId, skill || undefined);
    }

    @Get('words')
    @ApiOperation({ summary: 'My saved words (?due=1 → due for review)' })
    words(@CurrentUser() user: RequestUser, @Query('due') due?: string) {
        return this.svc.listWords(learnerOf(user), due === '1' || due === 'true');
    }

    @Post('words')
    @ApiOperation({ summary: 'Save a word from a passage' })
    addWord(@Body() dto: AddWordDto, @CurrentUser() user: RequestUser) {
        return this.svc.addWord(learnerOf(user), dto);
    }

    @Patch('words/:id')
    updateWord(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWordDto, @CurrentUser() user: RequestUser) {
        return this.svc.updateWord(id, learnerOf(user), dto);
    }

    @Delete('words/:id')
    deleteWord(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
        return this.svc.deleteWord(id, learnerOf(user));
    }

    @Post('words/:id/review')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'SRS review of a word: again / good / easy' })
    reviewWord(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewWordDto, @CurrentUser() user: RequestUser) {
        return this.svc.reviewWord(id, learnerOf(user), dto.quality);
    }
}
