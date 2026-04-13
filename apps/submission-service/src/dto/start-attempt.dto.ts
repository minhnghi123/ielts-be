import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class StartAttemptDto {
    @ApiProperty({ description: 'UUID of the learner (learner_profile.id)' })
    @IsString()
    learnerId: string;

    @ApiProperty({ description: 'UUID of the test' })
    @IsString()
    testId: string;
}
