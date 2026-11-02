import {
  computeAssignmentStatus,
  evaluateEligibility,
  generateJoinCode,
  mapSubmissionStatus,
  normaliseJoinCode,
  resultsVisible,
  roundHalfBand,
} from './classroom.rules';

const base = {
  id: 'a1',
  classId: 'c1',
  testId: 't1',
  mode: 'mock' as const,
  maxAttempts: 1,
  extraTime: null,
  status: 'open' as const,
  openAt: null,
  dueAt: new Date('2026-01-10T00:00:00Z'),
  closeAt: null,
  allowLate: true,
};
const at = (iso: string) => new Date(iso);

describe('join codes', () => {
  it('avoids ambiguous characters and normalises input', () => {
    for (let i = 0; i < 200; i++)
      expect(generateJoinCode()).toMatch(
        /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/,
      );
    expect(normaliseJoinCode(' ab3-k9q ')).toBe('AB3K9Q');
  });
});

describe('assignment status', () => {
  it('is scheduled before openAt, open inside the window, closed after close', () => {
    const a = {
      ...base,
      openAt: at('2026-01-05T00:00:00Z'),
      closeAt: at('2026-01-12T00:00:00Z'),
    };
    expect(computeAssignmentStatus(a, at('2026-01-04T00:00:00Z'))).toBe(
      'scheduled',
    );
    expect(computeAssignmentStatus(a, at('2026-01-06T00:00:00Z'))).toBe('open');
    expect(computeAssignmentStatus(a, at('2026-01-11T00:00:00Z'))).toBe('open'); // late window
    expect(computeAssignmentStatus(a, at('2026-01-13T00:00:00Z'))).toBe(
      'closed',
    );
  });
  it('closes at dueAt when late work is not allowed', () => {
    expect(
      computeAssignmentStatus(
        { ...base, allowLate: false },
        at('2026-01-11T00:00:00Z'),
      ),
    ).toBe('closed');
    expect(
      computeAssignmentStatus(
        { ...base, allowLate: true },
        at('2026-01-11T00:00:00Z'),
      ),
    ).toBe('open');
  });
  it('archived wins', () => {
    expect(
      computeAssignmentStatus(
        { ...base, status: 'archived' },
        at('2026-01-06T00:00:00Z'),
      ),
    ).toBe('archived');
  });
});

describe('eligibility', () => {
  const now = at('2026-01-06T00:00:00Z');
  it('allows an active member inside the window with attempts left', () => {
    const r = evaluateEligibility({
      assignment: base,
      classStatus: 'active',
      memberStatus: 'active',
      learnerId: 'l1',
      attemptsUsed: 0,
      now,
    });
    expect(r.allowed).toBe(true);
    expect(r.closeAt).toBeNull();
  });
  it('rejects non-members, archived classes, closed windows and exhausted attempts', () => {
    expect(
      evaluateEligibility({
        assignment: base,
        classStatus: 'active',
        memberStatus: 'pending',
        learnerId: 'l1',
        attemptsUsed: 0,
        now,
      }).reason,
    ).toMatch(/not an active member/);
    expect(
      evaluateEligibility({
        assignment: base,
        classStatus: 'archived',
        memberStatus: 'active',
        learnerId: 'l1',
        attemptsUsed: 0,
        now,
      }).reason,
    ).toMatch(/archived/);
    expect(
      evaluateEligibility({
        assignment: { ...base, allowLate: false },
        classStatus: 'active',
        memberStatus: 'active',
        learnerId: 'l1',
        attemptsUsed: 0,
        now: at('2026-01-11T00:00:00Z'),
      }).reason,
    ).toMatch(/closed/);
    expect(
      evaluateEligibility({
        assignment: base,
        classStatus: 'active',
        memberStatus: 'active',
        learnerId: 'l1',
        attemptsUsed: 1,
        now,
      }).reason,
    ).toMatch(/attempts/);
  });
  it('unlimited attempts and extra time per learner', () => {
    const r = evaluateEligibility({
      assignment: { ...base, maxAttempts: 0, extraTime: { l1: 600 } },
      classStatus: 'active',
      memberStatus: 'active',
      learnerId: 'l1',
      attemptsUsed: 5,
      now,
    });
    expect(r.allowed).toBe(true);
    expect(r.extraSeconds).toBe(600);
  });
  it('reports the hard close so test-service can cap expiresAt', () => {
    const r = evaluateEligibility({
      assignment: { ...base, closeAt: at('2026-01-12T00:00:00Z') },
      classStatus: 'active',
      memberStatus: 'active',
      learnerId: 'l1',
      attemptsUsed: 0,
      now,
    });
    expect(r.closeAt).toBe('2026-01-12T00:00:00.000Z');
  });
});

describe('submission status & result visibility', () => {
  it('maps attempt statuses and flags late work (1 min grace)', () => {
    expect(mapSubmissionStatus('in_progress', null, base.dueAt)).toBe(
      'in_progress',
    );
    expect(
      mapSubmissionStatus('expired', at('2026-01-11T00:00:00Z'), base.dueAt),
    ).toBe('expired');
    expect(
      mapSubmissionStatus('submitted', at('2026-01-10T00:00:30Z'), base.dueAt),
    ).toBe('submitted');
    expect(
      mapSubmissionStatus('submitted', at('2026-01-10T00:02:00Z'), base.dueAt),
    ).toBe('late');
  });
  it('honours the result policy', () => {
    const before = at('2026-01-09T00:00:00Z');
    const after = at('2026-01-11T00:00:00Z');
    expect(
      resultsVisible(
        {
          resultPolicy: 'immediately',
          dueAt: base.dueAt,
          resultsReleasedAt: null,
        },
        before,
      ),
    ).toBe(true);
    expect(
      resultsVisible(
        {
          resultPolicy: 'after_due',
          dueAt: base.dueAt,
          resultsReleasedAt: null,
        },
        before,
      ),
    ).toBe(false);
    expect(
      resultsVisible(
        {
          resultPolicy: 'after_due',
          dueAt: base.dueAt,
          resultsReleasedAt: null,
        },
        after,
      ),
    ).toBe(true);
    expect(
      resultsVisible(
        { resultPolicy: 'manual', dueAt: base.dueAt, resultsReleasedAt: null },
        after,
      ),
    ).toBe(false);
    expect(
      resultsVisible(
        {
          resultPolicy: 'manual',
          dueAt: base.dueAt,
          resultsReleasedAt: before,
        },
        after,
      ),
    ).toBe(true);
  });
  it('rounds teacher bands to half steps within 0–9', () => {
    expect(roundHalfBand(6.26)).toBe(6.5);
    expect(roundHalfBand(9.7)).toBe(9);
    expect(roundHalfBand(-1)).toBe(0);
  });
});
