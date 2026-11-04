import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

// ─── Classes ──────────────────────────────────────────────────────────────────

export class CreateClassDto {
  @ApiProperty({ example: 'IELTS 6.5 — Tue/Thu evening' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 6.5 })
  @IsNumber()
  @Min(0)
  @Max(9)
  @IsOptional()
  targetBand?: number;

  @ApiPropertyOptional({
    enum: ['open', 'approval', 'closed'],
    default: 'approval',
  })
  @IsIn(['open', 'approval', 'closed'])
  @IsOptional()
  joinPolicy?: 'open' | 'approval' | 'closed';

  @ApiPropertyOptional({ example: 40 })
  @IsInt()
  @Min(1)
  @Max(500)
  @IsOptional()
  maxMembers?: number;

  @ApiPropertyOptional({ example: 'emerald' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  coverColor?: string;
}

export class UpdateClassDto extends CreateClassDto {
  @ApiPropertyOptional({ enum: ['active', 'archived'] })
  @IsIn(['active', 'archived'])
  @IsOptional()
  status?: 'active' | 'archived';

  @ApiPropertyOptional({
    description: 'Admin only: reassign the class to another teacher',
  })
  @IsUUID()
  @IsOptional()
  teacherId?: string;

  // name becomes optional on update
  @IsString()
  @IsOptional()
  @MaxLength(120)
  declare name: string;
}

export class QueryClassesDto {
  @ApiPropertyOptional({ enum: ['active', 'archived'] })
  @IsIn(['active', 'archived'])
  @IsOptional()
  status?: 'active' | 'archived';

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ description: 'Admin only' })
  @IsUUID()
  @IsOptional()
  teacherId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit: number = 20;
}

// ─── Members ──────────────────────────────────────────────────────────────────

export class JoinClassDto {
  @ApiProperty({ example: 'AB3K9Q' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(8)
  code: string;
}

export class UpdateMemberDto {
  @ApiPropertyOptional({ enum: ['active', 'removed'] })
  @IsIn(['active', 'removed'])
  @IsOptional()
  status?: 'active' | 'removed';

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  note?: string;
}

// ─── Assignments ──────────────────────────────────────────────────────────────

export class CreateAssignmentDto {
  @ApiProperty()
  @IsUUID()
  testId: string;

  @ApiPropertyOptional({ description: 'Defaults to the test title' })
  @IsString()
  @IsOptional()
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(4000)
  instructions?: string;

  @ApiPropertyOptional({ enum: ['practice', 'mock'], default: 'mock' })
  @IsIn(['practice', 'mock'])
  @IsOptional()
  mode?: 'practice' | 'mock';

  @ApiPropertyOptional({ description: 'ISO date; omit = open immediately' })
  @IsISO8601()
  @IsOptional()
  openAt?: string;

  @ApiProperty({ description: 'ISO date — deadline' })
  @IsISO8601()
  dueAt: string;

  @ApiPropertyOptional({
    description:
      'ISO date; hard close. Omit = late submissions allowed indefinitely',
  })
  @IsISO8601()
  @IsOptional()
  closeAt?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  allowLate?: boolean;

  @ApiPropertyOptional({ default: 1, description: '0 = unlimited' })
  @IsInt()
  @Min(0)
  @Max(20)
  @IsOptional()
  maxAttempts?: number;

  @ApiPropertyOptional({
    enum: ['immediately', 'after_due', 'manual'],
    default: 'immediately',
  })
  @IsIn(['immediately', 'after_due', 'manual'])
  @IsOptional()
  resultPolicy?: 'immediately' | 'after_due' | 'manual';

  @ApiPropertyOptional({ description: '{ [learnerId]: extraSeconds }' })
  @IsObject()
  @IsOptional()
  extraTime?: Record<string, number>;
}

export class UpdateAssignmentDto extends CreateAssignmentDto {
  @IsUUID()
  @IsOptional()
  declare testId: string;

  @IsISO8601()
  @IsOptional()
  declare dueAt: string;

  @ApiPropertyOptional({ enum: ['open', 'archived'] })
  @IsIn(['open', 'archived'])
  @IsOptional()
  status?: 'open' | 'archived';
}

export class QueryAssignmentsDto {
  @ApiPropertyOptional({ enum: ['scheduled', 'open', 'closed', 'archived'] })
  @IsIn(['scheduled', 'open', 'closed', 'archived'])
  @IsOptional()
  status?: 'scheduled' | 'open' | 'closed' | 'archived';

  @ApiPropertyOptional({
    enum: ['reading', 'listening', 'writing', 'speaking'],
  })
  @IsIn(['reading', 'listening', 'writing', 'speaking'])
  @IsOptional()
  skill?: string;
}

// ─── Review ───────────────────────────────────────────────────────────────────

export class ReviewSubmissionDto {
  @ApiPropertyOptional({
    example: 6.5,
    description: 'Overall band override (0–9, 0.5 steps)',
  })
  @IsNumber()
  @Min(0)
  @Max(9)
  @IsOptional()
  teacherBand?: number;

  @ApiPropertyOptional({
    description:
      'Criterion scores, e.g. { taskResponse, coherence, lexical, grammar }',
  })
  @IsObject()
  @IsOptional()
  teacherRubric?: Record<string, number>;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(8000)
  teacherFeedback?: string;

  @ApiPropertyOptional({
    description: 'Release results to the learner now (manual policy)',
  })
  @IsBoolean()
  @IsOptional()
  releaseNow?: boolean;
}

// ─── Posts ────────────────────────────────────────────────────────────────────

export class AttachmentDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsString()
  @MaxLength(2000)
  url: string;
}

export class CreatePostDto {
  @ApiPropertyOptional({
    enum: ['announcement', 'material'],
    default: 'announcement',
  })
  @IsIn(['announcement', 'material'])
  @IsOptional()
  type?: 'announcement' | 'material';

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  body: string;

  @ApiPropertyOptional({ type: [AttachmentDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  @IsOptional()
  attachments?: AttachmentDto[];

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  pinned?: boolean;
}

export class UpdatePostDto extends CreatePostDto {
  @IsString()
  @IsOptional()
  @MaxLength(10000)
  declare body: string;
}

export class AssignDrillDto {
  @ApiProperty({ type: [String], description: 'Learner profile ids in this class' })
  @IsArray()
  @IsUUID('4', { each: true })
  learnerIds: string[];

  @ApiProperty({ enum: ['listening', 'reading', 'writing', 'speaking'] })
  @IsIn(['listening', 'reading', 'writing', 'speaking'])
  skill: string;

  @ApiPropertyOptional({ description: 'Canonical question type for drills' })
  @IsOptional()
  @IsString()
  questionType?: string;

  @ApiPropertyOptional({ description: 'Vietnamese note shown as the task reason' })
  @IsOptional()
  @IsString()
  note?: string;
}
