import {
  IsOptional,
  IsIn,
  IsBoolean,
  IsInt,
  Min,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryTestsDto {
  @ApiPropertyOptional({
    enum: ['reading', 'listening', 'writing', 'speaking'],
  })
  @IsIn(['reading', 'listening', 'writing', 'speaking'])
  @IsOptional()
  skill?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isMock?: boolean;

  @ApiPropertyOptional({ enum: ['easy', 'medium', 'hard'] })
  @IsIn(['easy', 'medium', 'hard'])
  @IsOptional()
  difficulty?: string;

  @ApiPropertyOptional({
    enum: ['draft', 'published', 'archived'],
    description: 'Admin only',
  })
  @IsIn(['draft', 'published', 'archived'])
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Teachers/admins: only tests I created' })
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  mine?: boolean;

  @ApiPropertyOptional({
    enum: ['public', 'private'],
    description: 'Admin only',
  })
  @IsIn(['public', 'private'])
  @IsOptional()
  visibility?: string;

  @ApiPropertyOptional({
    enum: ['admin', 'teacher'],
    description: 'Admin only',
  })
  @IsIn(['admin', 'teacher'])
  @IsOptional()
  ownerRole?: string;

  @ApiPropertyOptional({ example: 'Cambridge 18' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page: number = 1;

  @ApiPropertyOptional({ example: 12, default: 12 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  limit: number = 12;
}
