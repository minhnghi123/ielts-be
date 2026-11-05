import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min, } from 'class-validator';
import {
  ERROR_CAUSES,
  QUESTION_TYPES,
  normalizeQuestionType,
} from '@app/common';

export class BuildDrillDto {
  @ApiProperty({ enum: ['listening', 'reading'] })
  @IsIn(['listening', 'reading'])
  skill: 'listening' | 'reading';

  @ApiPropertyOptional({ enum: QUESTION_TYPES })
  @IsOptional()
  @Transform(({ value }) =>
    value == null || value === ''
      ? undefined
      : (normalizeQuestionType(value) ?? value),
  )
  @IsIn(QUESTION_TYPES)
  questionType?: (typeof QUESTION_TYPES)[number];

  @ApiPropertyOptional({
    enum: ERROR_CAUSES,
    description: 'Prioritise notebook mistakes with this cause',
  })
  @IsOptional()
  @IsIn(ERROR_CAUSES)
  errorCause?: (typeof ERROR_CAUSES)[number];

  @ApiPropertyOptional({ default: 8, minimum: 3, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(20)
  limit?: number;
}

export class CheckDrillAnswerDto {
  @ApiProperty()
  @IsUUID()
  questionId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  answer: string;

  @ApiPropertyOptional({ description: 'Highest hint level used before answering (1–3)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  hintLevel?: number;
}
