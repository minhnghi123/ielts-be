import { IsUUID, IsIn, IsNumber, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertBandProfileDto {
    @ApiProperty({ description: 'UUID of the learner_profile' })
    @IsUUID()
    learnerId: string;

    @ApiProperty({
        enum: ['reading', 'listening', 'writing', 'speaking', 'overall'],
    })
    @IsIn(['reading', 'listening', 'writing', 'speaking', 'overall'])
    skill: string;

    @ApiPropertyOptional({ example: 6.5 })
    @IsNumber()
    @Min(0)
    @Max(9)
    @IsOptional()
    currentBand?: number;

    @ApiPropertyOptional({ example: 7.0 })
    @IsNumber()
    @Min(0)
    @Max(9)
    @IsOptional()
    targetBand?: number;
}

export class CreateSnapshotDto {
    @ApiProperty({ description: 'UUID of the learner_profile' })
    @IsUUID()
    learnerId: string;

    @ApiProperty({ example: 6.5 })
    @IsNumber()
    @Min(0)
    @Max(9)
    overallBand: number;
}

export class CreateMistakeDto {
    @ApiProperty({ description: 'UUID of the learner_profile' })
    @IsUUID()
    learnerId: string;

    @ApiProperty({ description: 'UUID of the question' })
    @IsUUID()
    questionId: string;

    @ApiPropertyOptional({ example: 'fill_in_blank' })
    @IsIn(['multiple_choice', 'fill_in_blank', 'true_false_not_given', 'matching'])
    @IsOptional()
    mistakeType?: string;
}
