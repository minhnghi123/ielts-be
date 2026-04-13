import { IsUUID, IsString, IsOptional, IsNumber, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWritingGradingDto {
    @ApiProperty({ description: 'UUID of the writing_submission (can be task1 submission ID or a virtual combined ID)' })
    @IsString()
    submissionId: string;

    @ApiPropertyOptional({ description: 'AI model name (e.g. llama-3.3-70b-versatile)' })
    @IsOptional()
    @IsString()
    modelName?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    modelVersion?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    promptVersion?: string;

    @ApiPropertyOptional({ description: 'Task Response score (0-9)' })
    @IsOptional()
    @IsNumber()
    taskResponse?: number;

    @ApiPropertyOptional({ description: 'Coherence & Cohesion score (0-9)' })
    @IsOptional()
    @IsNumber()
    coherence?: number;

    @ApiPropertyOptional({ description: 'Lexical Resource score (0-9)' })
    @IsOptional()
    @IsNumber()
    lexical?: number;

    @ApiPropertyOptional({ description: 'Grammatical Range & Accuracy score (0-9)' })
    @IsOptional()
    @IsNumber()
    grammar?: number;

    @ApiPropertyOptional({ description: 'Overall IELTS band score' })
    @IsOptional()
    @IsNumber()
    overallBand?: number;

    @ApiPropertyOptional({
        description: 'Structured JSON with annotated_html, suggestions, sub-scores for task1 and task2',
    })
    @IsOptional()
    @IsObject()
    feedback?: Record<string, any>;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    confidenceScore?: number;
}
