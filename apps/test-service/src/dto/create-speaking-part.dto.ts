import { IsString, IsInt, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSpeakingPartDto {
    @ApiProperty({ example: 1 })
    @IsInt()
    @Min(1)
    partNumber: number;

    @ApiPropertyOptional({ example: 'Describe a place you visited recently.' })
    @IsString()
    @IsOptional()
    prompt?: string;
}
