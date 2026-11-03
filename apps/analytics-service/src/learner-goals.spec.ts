import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpsertLearnerGoalsDto } from './dto/learner-goals.dto';
import {
  daysBetweenIso,
  isValidIsoDate,
  todayIsoDate,
} from './analytics-service.service';

describe('learner goals helpers', () => {
  it('todayIsoDate returns YYYY-MM-DD in Asia/Ho_Chi_Minh', () => {
    // 2026-03-01T17:30Z is already 2026-03-02 00:30 in UTC+7
    expect(todayIsoDate(new Date('2026-03-01T17:30:00Z'))).toBe('2026-03-02');
    expect(todayIsoDate(new Date('2026-03-01T16:30:00Z'))).toBe('2026-03-01');
  });

  it('daysBetweenIso counts calendar days', () => {
    expect(daysBetweenIso('2026-01-01', '2026-01-08')).toBe(7);
    expect(daysBetweenIso('2026-01-08', '2026-01-01')).toBe(-7);
    expect(daysBetweenIso('2026-02-28', '2026-03-01')).toBe(1);
  });

  it('isValidIsoDate rejects impossible dates', () => {
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('2026-12-20')).toBe(true);
  });
});

describe('UpsertLearnerGoalsDto validation', () => {
  const base = { targetOverall: 7, minutesPerDay: 45, daysPerWeek: 5 };

  const errorsFor = async (plain: Record<string, unknown>) =>
    (await validate(plainToInstance(UpsertLearnerGoalsDto, plain))).map(
      (e) => e.property,
    );

  it('accepts a minimal valid payload', async () => {
    expect(await errorsFor(base)).toEqual([]);
  });

  it('rejects quarter bands and out-of-range bands', async () => {
    expect(await errorsFor({ ...base, targetOverall: 6.25 })).toContain(
      'targetOverall',
    );
    expect(await errorsFor({ ...base, targetOverall: 3.5 })).toContain(
      'targetOverall',
    );
    expect(await errorsFor({ ...base, targetReading: 9.5 })).toContain(
      'targetReading',
    );
    expect(await errorsFor({ ...base, targetReading: 6.5 })).toEqual([]);
  });

  it('validates study budget and purpose', async () => {
    expect(await errorsFor({ ...base, minutesPerDay: 5 })).toContain(
      'minutesPerDay',
    );
    expect(await errorsFor({ ...base, daysPerWeek: 8 })).toContain(
      'daysPerWeek',
    );
    expect(await errorsFor({ ...base, purpose: 'fun' })).toContain('purpose');
    expect(await errorsFor({ ...base, examDate: '20/12/2026' })).toContain(
      'examDate',
    );
  });
});
