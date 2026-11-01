import { IsString, IsNotEmpty, IsOptional, ValidateNested, IsArray, IsInt, Min, Max, IsObject, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QuestionAttemptDto {
    @IsString()
    @IsNotEmpty()
    questionId: string;

    @IsString()
    @IsOptional()
    answer: string;
}

/**
 * Learner submission. Band scores are never accepted from the client — Reading
 * and Listening are graded here, Writing/Speaking bands arrive through the
 * internal `ai-feedback` endpoint.
 */
export class SubmitTestAttemptDto {
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => QuestionAttemptDto)
    answers?: QuestionAttemptDto[];
}

export class StartAttemptDto {
    @ApiPropertyOptional({
        example: 20,
        description: 'Custom duration (minutes). Only honoured on practice (non-mock) tests.',
    })
    @IsInt()
    @Min(5)
    @Max(240)
    @IsOptional()
    durationMinutes?: number;
}

export class SaveDraftDto {
    @IsObject()
    answers: Record<string, string>;
}

export class AiFeedbackDto {
    @IsString()
    @IsOptional()
    aiFeedback?: string;

    @IsNumber()
    @Min(0)
    @Max(9)
    @IsOptional()
    bandScore?: number;

    @IsInt()
    @Min(0)
    @IsOptional()
    rawScore?: number;
}
