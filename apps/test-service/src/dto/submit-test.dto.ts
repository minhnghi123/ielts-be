import { IsString, IsNotEmpty, IsBoolean, IsOptional, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class QuestionAttemptDto {
    @IsString()
    @IsNotEmpty()
    questionId: string;

    @IsString()
    @IsOptional()
    answer: string;
}

export class SubmitTestAttemptDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => QuestionAttemptDto)
    answers: QuestionAttemptDto[];
}
