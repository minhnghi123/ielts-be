import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class StartAttemptDto {
    @ApiProperty({ description: 'UUID of the learner (learner_profile.id)' })
    @IsUUID()
    learnerId: string;

    @ApiProperty({ description: 'UUID of the test' })
    @IsUUID()
    testId: string;
}
