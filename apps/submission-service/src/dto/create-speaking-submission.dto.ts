import { IsUUID, IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSpeakingSubmissionDto {
    @ApiPropertyOptional({ description: 'Ignored for learners — derived from the token. Admins may set it.' })
    @IsString()
    @IsOptional()
    learnerId?: string;

    @ApiProperty({ description: 'UUID of the speaking_part' })
    @IsString()
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
