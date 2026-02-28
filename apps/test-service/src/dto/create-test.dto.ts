import { IsString, IsBoolean, IsIn, IsUUID, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTestDto {
  @ApiProperty({ enum: ['reading', 'listening', 'writing', 'speaking'] })
  @IsIn(['reading', 'listening', 'writing', 'speaking'])
  skill: string;

  @ApiProperty({ example: 'Cambridge 18 - Test 1 Reading' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  isMock: boolean;

  @ApiProperty({ description: 'UUID of the admin who creates the test' })
  @IsUUID()
  createdBy: string;
}
