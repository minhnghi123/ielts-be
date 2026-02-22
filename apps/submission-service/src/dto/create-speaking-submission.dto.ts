import { IsUUID, IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSpeakingSubmissionDto {
    @ApiProperty({ description: 'UUID of the learner_profile' })
    @IsUUID()
    learnerId: string;

    @ApiProperty({ description: 'UUID of the speaking_part' })
    @IsUUID()
    speakingPartId: string;

    @ApiProperty({ description: 'URL of the recorded audio file' })
    @IsString()
    @IsNotEmpty()
    audioUrl: string;

    @ApiPropertyOptional({ description: 'Auto-generated transcript (optional)' })
    @IsString()
    @IsOptional()
    transcript?: string;
}
