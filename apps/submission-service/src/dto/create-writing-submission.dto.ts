import { IsUUID, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWritingSubmissionDto {
    @ApiProperty({ description: 'UUID of the learner_profile' })
    @IsUUID()
    learnerId: string;

    @ApiProperty({ description: 'UUID of the writing_task' })
    @IsUUID()
    writingTaskId: string;

    @ApiProperty({ description: 'Essay content' })
    @IsString()
    @IsNotEmpty()
    content: string;
}
