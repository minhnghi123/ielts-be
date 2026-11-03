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
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import type { Skill } from '../entities/test.entity';
import { QUESTION_TYPES } from '@app/common';
import { EvidenceAnchorDto, NormalizeQuestionType } from './create-question.dto';

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

  @ApiProperty({ enum: QUESTION_TYPES })
  @NormalizeQuestionType()
  @IsString()
  @IsNotEmpty()
  @IsIn(QUESTION_TYPES, { message: 'questionType must be one of: ' + QUESTION_TYPES.join(', ') })
  questionType: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  questionText?: string;

  @ApiProperty()
  @IsObject()
  config: Record<string, any>;

  @ApiProperty({ required: false, description: 'Vietnamese explanation shown after submission' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  explanation?: string;

  @ApiProperty({ required: false, minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  difficulty?: number | null;

  @ApiProperty({ required: false, type: () => EvidenceAnchorDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EvidenceAnchorDto)
  evidenceAnchor?: EvidenceAnchorDto | null;

  @ApiProperty({ type: () => CreateManualQuestionAnswerDto })
  @ValidateNested()
  @Type(() => CreateManualQuestionAnswerDto)
  answer: CreateManualQuestionAnswerDto;
}

export class CreateManualQuestionGroupDto {
  @ApiProperty()
  @IsNumber()
  groupOrder: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  instructions?: string;

  @ApiProperty({ type: () => [CreateManualQuestionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateManualQuestionDto)
  questions: CreateManualQuestionDto[];
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

  @ApiProperty({ type: () => [CreateManualQuestionGroupDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateManualQuestionGroupDto)
  groups: CreateManualQuestionGroupDto[];
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
