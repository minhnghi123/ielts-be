import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  IsInt,
  Min,
} from 'class-validator';

export class WritingRubricItemDto {
  @ApiProperty({ example: 'Task Achievement' })
  @IsString()
  @IsNotEmpty()
  criterion: string;

  @ApiPropertyOptional({ example: 'Assess how well the candidate addresses the task.' })
  @IsString()
  @IsOptional()
  description?: string;
}

export class WritingTaskItemDto {
  @ApiProperty({ example: 1, description: '1 or 2' })
  @IsInt()
  @Min(1)
  taskNumber: number;

  @ApiProperty({ example: 'The chart below shows the percentage of...' })
  @IsString()
  @IsNotEmpty()
  promptText: string;

  @ApiPropertyOptional({ example: 20, description: 'Time allowed in minutes' })
  @IsInt()
  @IsOptional()
  @Min(1)
  timeLimit?: number;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/chart.png' })
  @IsString()
  @IsOptional()
  mediaUrl?: string;

  @ApiPropertyOptional({ type: () => [WritingRubricItemDto] })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => WritingRubricItemDto)
  rubric?: WritingRubricItemDto[];
}

export class CreateWritingTestDto {
  @ApiProperty({ example: 'IELTS Academic Writing Practice Test 1' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  isMock: boolean;

  @ApiProperty({ example: 'uuid-of-admin' })
  @IsString()
  @IsNotEmpty()
  createdBy: string;

  @ApiProperty({ type: () => [WritingTaskItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WritingTaskItemDto)
  tasks: WritingTaskItemDto[];
}
