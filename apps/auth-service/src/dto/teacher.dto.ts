import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateTeacherApprovalDto {
  @ApiProperty({ enum: ['approved', 'rejected'] })
  @IsNotEmpty()
  @IsIn(['approved', 'rejected'])
  status: 'approved' | 'rejected';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UpdateUserRoleDto {
  @ApiProperty({ enum: ['teacher', 'learner'] })
  @IsNotEmpty()
  @IsIn(['teacher', 'learner'])
  role: 'teacher' | 'learner';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  organization?: string;
}

export class UpdateTeacherProfileDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  organization?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;
}
