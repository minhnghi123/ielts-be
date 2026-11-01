import { IsNotEmpty, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldP@ssword123' })
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ example: 'NewP@ssword123', minLength: 8 })
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(32)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message:
      'Password must contain uppercase, lowercase, number and special character',
  })
  newPassword: string;
}

export class UpdateUserStatusDto {
  @ApiProperty({ enum: ['active', 'suspended'] })
  @IsNotEmpty()
  @Matches(/^(active|suspended)$/, {
    message: 'status must be active or suspended',
  })
  status: 'active' | 'suspended';
}
