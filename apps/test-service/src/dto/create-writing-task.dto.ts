import { IsString, IsInt, IsNotEmpty, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWritingTaskDto {
    @ApiProperty({ example: 1 })
    @IsInt()
    @Min(1)
    taskNumber: number;

    @ApiProperty({ example: 'The graph below shows...' })
    @IsString()
    @IsNotEmpty()
    prompt: string;

    @ApiProperty({ example: 150 })
    @IsInt()
    @Min(1)
    wordLimit: number;
}
