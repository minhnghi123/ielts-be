import { IsUUID, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SaveAnswerDto {
    @ApiProperty({ description: 'UUID of the question' })
    @IsString()
    questionId: string;

    @ApiProperty({ description: "Learner's answer text" })
    @IsString()
    @IsNotEmpty()
    answer: string;
}
