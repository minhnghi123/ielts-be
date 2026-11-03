import type {
  ClassAssignment,
  AssignmentStatus,
} from './entities/class-assignment.entity';
import type { SubmissionStatus } from './entities/assignment-submission.entity';

/** Characters that cannot be confused with each other (no 0/O, 1/I). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateJoinCode(
  length = 6,
  random: () => number = Math.random,
): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return code;
}

export function normaliseJoinCode(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

type Window = Pick<
  ClassAssignment,
  'openAt' | 'dueAt' | 'closeAt' | 'allowLate' | 'status'
>;

/** Derive the live status of an assignment from its time window. */
export function computeAssignmentStatus(
  a: Window,
  now: Date = new Date(),
): AssignmentStatus {
  if (a.status === 'archived') return 'archived';
  if (a.openAt && now < new Date(a.openAt)) return 'scheduled';
  const hardClose = effectiveCloseAt(a);
  if (hardClose && now > hardClose) return 'closed';
  return 'open';
}

/** The moment after which no new work is accepted (null = never). */
export function effectiveCloseAt(
  a: Pick<ClassAssignment, 'dueAt' | 'closeAt' | 'allowLate'>,
): Date | null {
  if (a.closeAt) return new Date(a.closeAt);
  if (!a.allowLate) return new Date(a.dueAt);
  return null;
}

export interface EligibilityInput {
  assignment: Window &
    Pick<
      ClassAssignment,
      'mode' | 'maxAttempts' | 'extraTime' | 'id' | 'classId' | 'testId'
    >;
  classStatus: 'active' | 'archived';
  memberStatus: string | null;
  learnerId: string;
  attemptsUsed: number;
  now?: Date;
}

export interface EligibilityResult {
  allowed: boolean;
  reason?: string;
  assignmentId: string;
  classId: string;
  testId: string;
  mode: 'practice' | 'mock';
  maxAttempts: number;
  attemptsUsed: number;
  closeAt: string | null;
  extraSeconds: number;
}

export function evaluateEligibility(
  input: EligibilityInput,
): EligibilityResult {
  const {
    assignment: a,
    classStatus,
    memberStatus,
    learnerId,
    attemptsUsed,
  } = input;
  const now = input.now ?? new Date();
  const close = effectiveCloseAt(a);
  const base: EligibilityResult = {
    allowed: false,
    assignmentId: a.id,
    classId: a.classId,
    testId: a.testId,
    mode: a.mode,
    maxAttempts: a.maxAttempts,
    attemptsUsed,
    closeAt: close ? close.toISOString() : null,
    extraSeconds: Math.max(0, Math.floor(a.extraTime?.[learnerId] ?? 0)),
  };
  if (memberStatus !== 'active')
    return { ...base, reason: 'You are not an active member of this class' };
  if (classStatus !== 'active')
    return { ...base, reason: 'This class has been archived' };
  const status = computeAssignmentStatus(a, now);
  if (status === 'archived')
    return { ...base, reason: 'This assignment has been archived' };
  if (status === 'scheduled')
    return { ...base, reason: 'This assignment is not open yet' };
  if (status === 'closed')
    return { ...base, reason: 'This assignment is closed' };
  if (a.maxAttempts > 0 && attemptsUsed >= a.maxAttempts) {
    return {
      ...base,
      reason: 'You have used all your attempts for this assignment',
    };
  }
  return { ...base, allowed: true };
}

/** Map a test-service attempt status onto the gradebook status. */
export function mapSubmissionStatus(
  attemptStatus: string,
  submittedAt: Date | null,
  dueAt: Date,
): SubmissionStatus {
  if (attemptStatus === 'in_progress') return 'in_progress';
  if (attemptStatus === 'expired') return 'expired';
  if (submittedAt && submittedAt.getTime() > new Date(dueAt).getTime() + 60_000)
    return 'late';
  return 'submitted';
}

/** Can the learner see scores/feedback for this assignment right now? */
export function resultsVisible(
  a: Pick<ClassAssignment, 'resultPolicy' | 'dueAt' | 'resultsReleasedAt'>,
  now: Date = new Date(),
): boolean {
  if (a.resultsReleasedAt && now >= new Date(a.resultsReleasedAt)) return true;
  switch (a.resultPolicy) {
    case 'immediately':
      return true;
    case 'after_due':
      return now >= new Date(a.dueAt);
    case 'manual':
    default:
      return false;
  }
}

export function roundHalfBand(value: number): number {
  return Math.min(9, Math.max(0, Math.round(value * 2) / 2));
}
