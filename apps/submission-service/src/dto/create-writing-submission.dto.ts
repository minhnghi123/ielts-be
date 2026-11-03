import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWritingSubmissionDto {
    @ApiPropertyOptional({ description: 'Ignored for learners — derived from the token. Admins may set it.' })
    @IsString()
    @IsOptional()
    learnerId?: string;

    @ApiProperty({ description: 'UUID of the writing_task' })
    @IsString()
    writingTaskId: string;

    @ApiProperty({ description: 'Essay content' })
    @IsString()
    @IsNotEmpty()
    content: string;
}
