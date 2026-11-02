import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Identity headers injected by the API gateway after it has verified the JWT.
 * Downstream services must never trust these headers from an arbitrary client,
 * which is why the gateway also signs every forwarded request with
 * `x-internal-key` (see RolesGuard).
 */
export const USER_HEADERS = {
  USER_ID: 'x-user-id',
  EMAIL: 'x-user-email',
  ROLE: 'x-user-role',
  PROFILE_ID: 'x-profile-id',
  TEACHER_STATUS: 'x-teacher-status',
  INTERNAL_KEY: 'x-internal-key',
} as const;

export type UserRole = 'learner' | 'teacher' | 'admin' | 'system';
export type TeacherStatus = 'pending' | 'approved' | 'rejected';

export interface RequestUser {
  /** accounts.id */
  id: string | null;
  email: string | null;
  role: UserRole;
  /** learner_profiles.id, teacher_profiles.id or admin_profiles.id */
  profileId: string | null;
  /** Only present for teachers. */
  teacherStatus?: TeacherStatus | null;
}

function header(req: Request, name: string): string | null {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function getRequestUser(req: Request): RequestUser | null {
  const role = header(req, USER_HEADERS.ROLE) as UserRole | null;
  if (!role) return null;
  return {
    id: header(req, USER_HEADERS.USER_ID),
    email: header(req, USER_HEADERS.EMAIL),
    role,
    profileId: header(req, USER_HEADERS.PROFILE_ID),
    teacherStatus: header(
      req,
      USER_HEADERS.TEACHER_STATUS,
    ) as TeacherStatus | null,
  };
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser | null => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return getRequestUser(req);
  },
);

/**
 * Resolve the learner id a request is allowed to act on.
 * Learners may only act on themselves; admins/system may target any learner.
 */
export function resolveLearnerId(
  user: RequestUser | null,
  requested?: string | null,
): string {
  if (!user) {
    if (requested) return requested;
    throw new ForbiddenException('Missing user context');
  }
  if (user.role === 'learner') {
    if (!user.profileId)
      throw new ForbiddenException('Learner profile missing');
    return user.profileId;
  }
  if (requested) return requested;
  if (user.profileId) return user.profileId;
  throw new ForbiddenException('learnerId is required');
}

export function isPrivileged(user: RequestUser | null): boolean {
  return user?.role === 'admin' || user?.role === 'system';
}

export function assertOwnerOrPrivileged(
  user: RequestUser | null,
  ownerLearnerId: string,
): void {
  if (isPrivileged(user)) return;
  if (user?.profileId && user.profileId === ownerLearnerId) return;
  throw new ForbiddenException('You do not have access to this resource');
}

export function isTeacher(user: RequestUser | null): boolean {
  return user?.role === 'teacher';
}

/** Teachers may only manage classes once an admin has approved their account. */
export function assertApprovedTeacher(user: RequestUser | null): string {
  if (isPrivileged(user) && user?.profileId) return user.profileId;
  if (!isTeacher(user) || !user?.profileId) {
    throw new ForbiddenException('Teacher access required');
  }
  if (user.teacherStatus && user.teacherStatus !== 'approved') {
    throw new ForbiddenException(
      'Your teacher account has not been approved yet',
    );
  }
  return user.profileId;
}
