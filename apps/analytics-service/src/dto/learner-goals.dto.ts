import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  Matches,
  Max,
  Min,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const GOAL_PURPOSES = [
  'study_abroad',
  'immigration',
  'work',
  'graduation',
  'other',
] as const;

/** IELTS bands are reported in half-band steps (4.0, 4.5 … 9.0). */
@ValidatorConstraint({ name: 'halfBand', async: false })
export class IsHalfBandConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value !== 'number' || Number.isNaN(value)) return false;
    return Math.abs(value * 2 - Math.round(value * 2)) < 1e-9;
  }
  defaultMessage(): string {
    return 'band must be a whole or half band (e.g. 6.0, 6.5)';
  }
}

const BandTarget = (required: boolean) => {
  const decorators = [
    IsNumber({ maxDecimalPlaces: 1 }),
    Min(4.0, { message: 'target band must be at least 4.0' }),
    Max(9.0, { message: 'target band cannot exceed 9.0' }),
    Validate(IsHalfBandConstraint),
  ];
  if (!required) decorators.unshift(IsOptional());
  return (target: object, key: string) =>
    decorators.forEach((d) => d(target, key));
};

export class UpsertLearnerGoalsDto {
  @ApiProperty({
    example: 7.0,
    description: 'Overall target band, 4.0–9.0 in 0.5 steps',
  })
  @BandTarget(true)
  targetOverall: number;

  @ApiPropertyOptional({ example: 7.0 })
  @BandTarget(false)
  targetListening?: number | null;

  @ApiPropertyOptional({ example: 7.5 })
  @BandTarget(false)
  targetReading?: number | null;

  @ApiPropertyOptional({ example: 6.5 })
  @BandTarget(false)
  targetWriting?: number | null;

  @ApiPropertyOptional({ example: 6.5 })
  @BandTarget(false)
  targetSpeaking?: number | null;

  @ApiPropertyOptional({
    example: '2026-12-20',
    description: 'YYYY-MM-DD; today or later; null = not booked yet',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'examDate must be YYYY-MM-DD' })
  examDate?: string | null;

  @ApiProperty({ example: 45, minimum: 10, maximum: 300 })
  @IsInt()
  @Min(10)
  @Max(300)
  minutesPerDay: number;

  @ApiProperty({ example: 5, minimum: 1, maximum: 7 })
  @IsInt()
  @Min(1)
  @Max(7)
  daysPerWeek: number;

  @ApiPropertyOptional({ enum: GOAL_PURPOSES })
  @IsOptional()
  @IsIn(GOAL_PURPOSES)
  purpose?: (typeof GOAL_PURPOSES)[number] | null;
}
