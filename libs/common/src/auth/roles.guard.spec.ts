import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { resolveLearnerId, assertOwnerOrPrivileged } from './user-context';

function ctx(
  headers: Record<string, string>,
  meta: Record<string, any> = {},
): ExecutionContext {
  return {
    getType: () => 'http',
    getHandler: () => meta,
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const reflector = {
    getAllAndOverride: (key: string, [handler]: any[]) => handler[key],
  } as unknown as Reflector;
  const guard = new RolesGuard(reflector);

  afterEach(() => delete process.env.INTERNAL_API_KEY);

  it('rejects anonymous requests', () => {
    expect(() => guard.canActivate(ctx({}))).toThrow('Authentication required');
  });

  it('allows public routes', () => {
    expect(guard.canActivate(ctx({}, { isPublic: true }))).toBe(true);
  });

  it('enforces roles', () => {
    const learner = { 'x-user-role': 'learner', 'x-profile-id': 'p1' };
    expect(() => guard.canActivate(ctx(learner, { roles: ['admin'] }))).toThrow(
      'Insufficient permissions',
    );
    expect(
      guard.canActivate(ctx({ 'x-user-role': 'admin' }, { roles: ['admin'] })),
    ).toBe(true);
  });

  it('requires the internal key when configured', () => {
    process.env.INTERNAL_API_KEY = 'secret';
    expect(() => guard.canActivate(ctx({ 'x-user-role': 'admin' }))).toThrow(
      'API gateway',
    );
    expect(
      guard.canActivate(
        ctx({ 'x-user-role': 'admin', 'x-internal-key': 'secret' }),
      ),
    ).toBe(true);
  });
});

describe('user-context helpers', () => {
  it('learners always resolve to their own profile', () => {
    const user = {
      id: 'a',
      email: null,
      role: 'learner' as const,
      profileId: 'me',
    };
    expect(resolveLearnerId(user, 'someone-else')).toBe('me');
    expect(() => assertOwnerOrPrivileged(user, 'someone-else')).toThrow();
    expect(() => assertOwnerOrPrivileged(user, 'me')).not.toThrow();
  });

  it('admins may target any learner', () => {
    const admin = {
      id: 'a',
      email: null,
      role: 'admin' as const,
      profileId: 'adm',
    };
    expect(resolveLearnerId(admin, 'x')).toBe('x');
    expect(() => assertOwnerOrPrivileged(admin, 'x')).not.toThrow();
  });
});
