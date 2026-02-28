import {
  IsString,
  IsInt,
  IsOptional,
  IsObject,
  IsNotEmpty,
  Min,
  ValidateNested,
  IsArray,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
    description: 'e.g. multiple_choice, fill_in_blank, true_false_not_given',
  })
  @IsString()
  @IsNotEmpty()
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

  @ApiPropertyOptional({ description: 'Explanation shown after submission' })
  @IsString()
  @IsOptional()
  explanation?: string;

  @ApiProperty({ type: () => CreateQuestionAnswerDto })
  @ValidateNested()
  @Type(() => CreateQuestionAnswerDto)
  answer: CreateQuestionAnswerDto;
}
