import {
  IsString,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTestDto {
  @ApiProperty({ enum: ['reading', 'listening', 'writing', 'speaking'] })
  @IsIn(['reading', 'listening', 'writing', 'speaking'])
  skill: string;

  @ApiProperty({ example: 'Cambridge 18 - Test 1 Reading' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    example: true,
    description: 'true = full timed mock, false = practice',
  })
  @IsBoolean()
  isMock: boolean;

  @ApiPropertyOptional({
    description:
      'Ignored when a signed-in user is present — the creator is taken from the token',
  })
  @IsString()
  @IsOptional()
  createdBy?: string;

  @ApiPropertyOptional({ enum: ['easy', 'medium', 'hard'], default: 'medium' })
  @IsIn(['easy', 'medium', 'hard'])
  @IsOptional()
  difficulty?: 'easy' | 'medium' | 'hard';

  @ApiPropertyOptional({
    enum: ['draft', 'published', 'archived'],
    default: 'published',
  })
  @IsIn(['draft', 'published', 'archived'])
  @IsOptional()
  status?: 'draft' | 'published' | 'archived';

  @ApiPropertyOptional({ example: 'Academic reading about urban planning' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    example: 60,
    description: 'Override official duration (minutes)',
  })
  @IsInt()
  @Min(1)
  @Max(240)
  @IsOptional()
  durationMinutes?: number;
}
