import {
  IsEmail,
  IsNotEmpty,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
  IsIn,
  IsString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterLearnerDto {
  @ApiProperty({
    example: 'learner@example.com',
    description: 'Email address of the learner',
  })
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: 'P@ssword123',
    description:
      'Password must contain at least 8 characters, including uppercase, lowercase, number, and special character',
    minLength: 8,
  })
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(32)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message:
      'Password must contain uppercase, lowercase, number and special character',
  })
  password: string;

  @ApiProperty({
    example: 'P@ssword123',
    description: 'Password confirmation must match password',
  })
  @IsNotEmpty()
  confirmPassword: string;

  @ApiProperty({ enum: ['learner', 'teacher'], required: false, default: 'learner' })
  @IsOptional()
  @IsIn(['learner', 'teacher'])
  role?: 'learner' | 'teacher';

  @ApiProperty({ required: false, description: 'Display name (recommended for teachers)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string;

  @ApiProperty({ required: false, description: 'School / centre (teachers only)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  organization?: string;
}
