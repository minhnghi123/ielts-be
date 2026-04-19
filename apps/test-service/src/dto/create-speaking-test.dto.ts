import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
} from 'class-validator';

// ─── Part 1 ────────────────────────────────────────────────────────────────

export class SpeakingQuestionDto {
  @ApiProperty({ example: 'Tell me about your family.' })
  @IsString()
  @IsNotEmpty()
  questionText: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/audio/q1.mp3' })
  @IsString()
  @IsOptional()
  audioUrl?: string;
}

export class SpeakingTopicDto {
  @ApiProperty({ example: 'Family' })
  @IsString()
  @IsNotEmpty()
  topicName: string;

  @ApiProperty({ type: () => [SpeakingQuestionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SpeakingQuestionDto)
  questions: SpeakingQuestionDto[];
}

export class SpeakingPart1Dto {
  @ApiProperty({ type: () => [SpeakingTopicDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SpeakingTopicDto)
  topics: SpeakingTopicDto[];
}

// ─── Part 2 ────────────────────────────────────────────────────────────────

export class SpeakingPart2Dto {
  @ApiProperty({ example: 'Describe a place you visited recently.' })
  @IsString()
  @IsNotEmpty()
  mainTopic: string;

  @ApiProperty({ type: [String], example: ['Where it was', 'When you went'] })
  @IsArray()
  @IsString({ each: true })
  cues: string[];

  @ApiPropertyOptional({ example: 1, description: 'Preparation time in minutes' })
  @IsInt()
  @IsOptional()
  @Min(0)
  prepTime?: number;

  @ApiPropertyOptional({ example: 2, description: 'Speaking time in minutes' })
  @IsInt()
  @IsOptional()
  @Min(1)
  speakTime?: number;
}

// ─── Part 3 ────────────────────────────────────────────────────────────────

export class SpeakingPart3Dto {
  @ApiProperty({ type: () => [SpeakingQuestionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SpeakingQuestionDto)
  questions: SpeakingQuestionDto[];
}

// ─── Root ──────────────────────────────────────────────────────────────────

export class CreateSpeakingTestDto {
  @ApiProperty({ example: 'IELTS Speaking Practice Test 1' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  isMock: boolean;

  @ApiPropertyOptional({ example: 'uuid-of-admin' })
  @IsString()
  @IsOptional()
  createdBy?: string;

  @ApiProperty({ type: () => SpeakingPart1Dto })
  @ValidateNested()
  @Type(() => SpeakingPart1Dto)
  part1: SpeakingPart1Dto;

  @ApiProperty({ type: () => SpeakingPart2Dto })
  @ValidateNested()
  @Type(() => SpeakingPart2Dto)
  part2: SpeakingPart2Dto;

  @ApiProperty({ type: () => SpeakingPart3Dto })
  @ValidateNested()
  @Type(() => SpeakingPart3Dto)
  part3: SpeakingPart3Dto;
}
