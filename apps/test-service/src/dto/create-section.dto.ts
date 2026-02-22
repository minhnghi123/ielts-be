import { IsInt, IsString, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSectionDto {
    @ApiProperty({ example: 1 })
    @IsInt()
    @Min(1)
    sectionOrder: number;

    @ApiPropertyOptional({ description: 'Reading passage text' })
    @IsString()
    @IsOptional()
    passage?: string;

    @ApiPropertyOptional({ description: 'Audio URL for listening' })
    @IsString()
    @IsOptional()
    audioUrl?: string;

    @ApiPropertyOptional({ description: 'Time limit in seconds' })
    @IsInt()
    @IsOptional()
    timeLimit?: number;
}
