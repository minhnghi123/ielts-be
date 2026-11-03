import { IsUUID, IsIn, IsNumber, IsOptional, Min, Max, IsString, MaxLength, IsArray, IsBoolean } from 'class-validator';
import { ERROR_CAUSES } from '@app/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertBandProfileDto {
    @ApiProperty({ description: 'UUID of the learner_profile' })
    @IsString()
    learnerId: string;

    @ApiProperty({
        enum: ['reading', 'listening', 'writing', 'speaking', 'overall'],
    })
    @IsIn(['reading', 'listening', 'writing', 'speaking', 'overall'])
    skill: string;

    @ApiPropertyOptional({ example: 6.5 })
    @IsNumber()
    @Min(0)
    @Max(9)
    @IsOptional()
    currentBand?: number;

    @ApiPropertyOptional({ example: 7.0 })
    @IsNumber()
    @Min(0)
    @Max(9)
    @IsOptional()
    targetBand?: number;
}

export class CreateSnapshotDto {
    @ApiProperty({ description: 'UUID of the learner_profile' })
    @IsString()
    learnerId: string;

    @ApiProperty({ example: 6.5 })
    @IsNumber()
    @Min(0)
    @Max(9)
    overallBand: number;
}

export class CreateMistakeDto {
    @ApiProperty({ description: 'UUID of the learner_profile' })
    @IsString()
    learnerId: string;

    @ApiProperty({ description: 'UUID of the question' })
    @IsString()
    questionId: string;

    @ApiPropertyOptional({ example: 'fill_in_blank' })
    @IsString()
    @MaxLength(50)
    @IsOptional()
    mistakeType?: string;

    @ApiPropertyOptional({ description: 'test_attempts.id — enables upsert per attempt' })
    @IsOptional()
    @IsUUID()
    attemptId?: string | null;

    @ApiPropertyOptional({ enum: ['listening', 'reading', 'writing', 'speaking'] })
    @IsOptional()
    @IsIn(['listening', 'reading', 'writing', 'speaking'])
    skill?: string | null;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(50)
    questionType?: string | null;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    userAnswer?: string | null;

    @ApiPropertyOptional({ type: [String] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    correctAnswers?: string[];

    @ApiPropertyOptional({ description: 'Question-group instructions (word limit detection)' })
    @IsOptional()
    @IsString()
    @MaxLength(4000)
    instructions?: string | null;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    trailingSkipped?: boolean;

    @ApiPropertyOptional({ enum: ERROR_CAUSES, description: 'Override the rule-based classification' })
    @IsOptional()
    @IsIn(ERROR_CAUSES)
    errorCause?: (typeof ERROR_CAUSES)[number];
}

export class UpdateMistakeStatusDto {
    @ApiProperty({ enum: ['new', 'reviewing', 'fixed'] })
    @IsIn(['new', 'reviewing', 'fixed'])
    status: 'new' | 'reviewing' | 'fixed';
}

export class UpsertExplanationDto {
    @ApiProperty()
    @IsUUID()
    questionId: string;

    @ApiPropertyOptional({ description: 'Wrong answer this explanation is for; omit for generic' })
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    userAnswer?: string | null;

    @ApiPropertyOptional({ enum: ERROR_CAUSES })
    @IsOptional()
    @IsIn(ERROR_CAUSES)
    errorCause?: (typeof ERROR_CAUSES)[number] | null;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(1000)
    evidenceQuote?: string | null;

    @ApiProperty()
    @IsString()
    @MaxLength(4000)
    explanationVi: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(1000)
    tipVi?: string | null;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(80)
    model?: string | null;

    @ApiPropertyOptional({ enum: ['ai', 'author', 'teacher'] })
    @IsOptional()
    @IsIn(['ai', 'author', 'teacher'])
    source?: 'ai' | 'author' | 'teacher';
}

export class VoteExplanationDto {
    @ApiProperty()
    @IsBoolean()
    helpful: boolean;
}
