import { IsInt, IsString, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateGroupDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  groupOrder: number;

  @ApiPropertyOptional({ description: 'Group instructions / prompt text' })
  @IsString()
  @IsOptional()
  instructions?: string;
}
