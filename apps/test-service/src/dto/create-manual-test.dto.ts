import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsString,
    IsNotEmpty,
    IsBoolean,
    IsOptional,
    IsArray,
    ValidateNested,
    IsNumber,
    IsIn,
    IsObject,
} from 'class-validator';
import type { Skill } from '../entities/test.entity';

export class CreateManualQuestionAnswerDto {
    @ApiProperty({ type: [String] })
    @IsArray()
    @IsString({ each: true })
    correctAnswers: string[];

    @ApiProperty()
    @IsBoolean()
    caseSensitive: boolean;
}

export class CreateManualQuestionDto {
    @ApiProperty()
    @IsNumber()
    questionOrder: number;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    questionType: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    questionText: string;

    @ApiProperty()
    @IsObject()
    config: Record<string, any>;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    explanation?: string;

    @ApiProperty({ type: () => CreateManualQuestionAnswerDto })
    @ValidateNested()
    @Type(() => CreateManualQuestionAnswerDto)
    answer: CreateManualQuestionAnswerDto;
}

export class CreateManualSectionDto {
    @ApiProperty()
    @IsNumber()
    sectionOrder: number;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    passage?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    audioUrl?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsNumber()
    timeLimit?: number;

    @ApiProperty({ type: () => [CreateManualQuestionDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateManualQuestionDto)
    questions: CreateManualQuestionDto[];
}

export class CreateManualTestDto {
    @ApiProperty({ enum: ['reading', 'listening', 'writing', 'speaking'] })
    @IsIn(['reading', 'listening', 'writing', 'speaking'])
    skill: Skill;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiProperty()
    @IsBoolean()
    isMock: boolean;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    createdBy: string;

    @ApiProperty({ type: () => [CreateManualSectionDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateManualSectionDto)
    sections: CreateManualSectionDto[];
}
