import {
  IsString,
  IsInt,
  IsOptional,
  IsObject,
  IsNotEmpty,
  Min,
  Max,
  MaxLength,
  ValidateNested,
  ValidateIf,
  IsArray,
  IsBoolean,
  IsIn,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  normalizeQuestionType,
} from '@app/common';

export class EvidenceAnchorDto {
  @ApiProperty({ enum: ['passage', 'audio'] })
  @IsIn(['passage', 'audio'])
  kind: 'passage' | 'audio';

  @ApiPropertyOptional({ description: '1-based paragraph index in the passage' })
  @ValidateIf((o) => o.kind === 'passage')
  @IsOptional()
  @IsInt()
  @Min(1)
  paragraph?: number;

  @ApiPropertyOptional({ description: 'Audio offset in ms where the answer is heard' })
  @ValidateIf((o) => o.kind === 'audio')
  @IsInt()
  @Min(0)
  startMs?: number;

  @ApiPropertyOptional()
  @ValidateIf((o) => o.kind === 'audio' && o.endMs !== undefined && o.endMs !== null)
  @IsInt()
  @Min(0)
  endMs?: number;

  @ApiPropertyOptional({ description: 'Exact sentence from passage/transcript (≤ 500 chars)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  quote?: string;
}

/** Normalises any legacy spelling; unknown values are left as-is so @IsIn rejects them. */
export const NormalizeQuestionType = () =>
  Transform(({ value }) => normalizeQuestionType(value) ?? value);

export class CreateQuestionAnswerDto {
  @ApiProperty({ example: ['B', 'TRUE'] })
  @IsArray()
  @IsString({ each: true })
  correctAnswers: string[];

  @ApiProperty({ example: false })
  @IsBoolean()
  caseSensitive: boolean;
}

export class CreateQuestionDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  questionOrder: number;

  @ApiProperty({
    example: 'multiple_choice',
    enum: QUESTION_TYPES,
    description: Object.entries(QUESTION_TYPE_LABELS)
      .map(([k, v]) => `${k} = ${v}`)
      .join('; '),
  })
  @NormalizeQuestionType()
  @IsString()
  @IsNotEmpty()
  @IsIn(QUESTION_TYPES, { message: 'questionType must be one of: ' + QUESTION_TYPES.join(', ') })
  questionType: string;

  @ApiProperty({ example: 'According to the passage, what is...', required: false })
  @IsString()
  @IsOptional()
  questionText?: string;

  @ApiProperty({
    description: 'JSON config for options/choices',
    example: { options: ['A', 'B', 'C', 'D'] },
  })
  @IsObject()
  config: Record<string, any>;

  @ApiPropertyOptional({ description: 'Vietnamese explanation shown after submission' })
  @IsString()
  @IsOptional()
  @MaxLength(4000)
  explanation?: string;

  @ApiPropertyOptional({ description: 'Author difficulty estimate 1–5', minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  difficulty?: number | null;

  @ApiPropertyOptional({ type: () => EvidenceAnchorDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EvidenceAnchorDto)
  evidenceAnchor?: EvidenceAnchorDto | null;

  @ApiProperty({ type: () => CreateQuestionAnswerDto })
  @ValidateNested()
  @Type(() => CreateQuestionAnswerDto)
  answer: CreateQuestionAnswerDto;
}
