import { IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'learner@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'P@ssword123' })
  @IsNotEmpty()
  password: string;
}
