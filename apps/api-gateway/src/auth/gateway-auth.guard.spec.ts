import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { GatewayAuthGuard } from './gateway-auth.guard';

const SECRET = 'test-secret';

function ctx(
  method: string,
  url: string,
  headers: Record<string, string> = {},
): ExecutionContext {
  const req: any = { method, originalUrl: url, url, headers };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('GatewayAuthGuard', () => {
  const jwt = new JwtService({ secret: SECRET });
  const guard = new GatewayAuthGuard(jwt);
  const learner = `Bearer ${jwt.sign({ sub: 'u1', role: 'learner', profileId: 'p1' })}`;
  const admin = `Bearer ${jwt.sign({ sub: 'u2', role: 'admin', profileId: 'a1' })}`;
  const teacher = `Bearer ${jwt.sign({ sub: 'u3', role: 'teacher', profileId: 't1', teacherStatus: 'approved' })}`;
  const pendingTeacher = `Bearer ${jwt.sign({ sub: 'u4', role: 'teacher', profileId: 't2', teacherStatus: 'pending' })}`;

  afterEach(() => delete process.env.INTERNAL_API_KEY);

  it('lets anyone browse the test catalogue', () => {
    expect(guard.canActivate(ctx('GET', '/api/tests?skill=reading'))).toBe(
      true,
    );
    expect(guard.canActivate(ctx('POST', '/api/auth/login'))).toBe(true);
  });

  it('blocks anonymous access to protected routes', () => {
    expect(() => guard.canActivate(ctx('GET', '/api/attempts'))).toThrow(
      'Authentication required',
    );
    expect(() =>
      guard.canActivate(
        ctx('GET', '/api/attempts', { authorization: 'Bearer nope' }),
      ),
    ).toThrow('Invalid or expired token');
  });

  it('lets learners start attempts but not create tests', () => {
    expect(
      guard.canActivate(
        ctx('POST', '/api/tests/abc/attempts', { authorization: learner }),
      ),
    ).toBe(true);
    expect(() =>
      guard.canActivate(ctx('POST', '/api/tests', { authorization: learner })),
    ).toThrow('Teacher or admin access required');
    expect(() =>
      guard.canActivate(
        ctx('DELETE', '/api/tests/abc', { authorization: learner }),
      ),
    ).toThrow('Teacher or admin access required');
    expect(() =>
      guard.canActivate(
        ctx('GET', '/api/auth/users', { authorization: learner }),
      ),
    ).toThrow('Admin access required');
  });

  it('lets admins manage content', () => {
    expect(
      guard.canActivate(ctx('POST', '/api/tests', { authorization: admin })),
    ).toBe(true);
    expect(
      guard.canActivate(
        ctx('GET', '/api/analytics/admin/global-stats', {
          authorization: admin,
        }),
      ),
    ).toBe(true);
  });

  it('accepts the internal key only on system routes', () => {
    process.env.INTERNAL_API_KEY = 'k';
    expect(
      guard.canActivate(
        ctx('PUT', '/api/attempts/x/ai-feedback', { 'x-internal-key': 'k' }),
      ),
    ).toBe(true);
    expect(() =>
      guard.canActivate(
        ctx('DELETE', '/api/tests/x', { 'x-internal-key': 'k' }),
      ),
    ).toThrow();
    expect(() =>
      guard.canActivate(
        ctx('PUT', '/api/attempts/x/ai-feedback', {
          'x-internal-key': 'wrong',
        }),
      ),
    ).toThrow('Authentication required');
  });

  it('lets approved teachers author tests and manage classes, but not admin routes', () => {
    expect(guard.canActivate(ctx('POST', '/api/tests', { authorization: teacher }))).toBe(true);
    expect(guard.canActivate(ctx('POST', '/api/classes', { authorization: teacher }))).toBe(true);
    expect(guard.canActivate(ctx('GET', '/api/teacher/dashboard', { authorization: teacher }))).toBe(true);
    expect(() =>
      guard.canActivate(ctx('GET', '/api/auth/teachers', { authorization: teacher })),
    ).toThrow('Admin access required');
    expect(() =>
      guard.canActivate(ctx('PATCH', '/api/tests/abc/visibility', { authorization: teacher })),
    ).toThrow('Admin access required');
  });

  it('blocks pending teachers from authoring until approved', () => {
    expect(() =>
      guard.canActivate(ctx('POST', '/api/tests', { authorization: pendingTeacher })),
    ).toThrow('not been approved');
    expect(guard.canActivate(ctx('GET', '/api/classes', { authorization: pendingTeacher }))).toBe(true);
  });

  it('learners may join and read classes but not call teacher routes', () => {
    expect(guard.canActivate(ctx('POST', '/api/classes/join', { authorization: learner }))).toBe(true);
    expect(() =>
      guard.canActivate(ctx('GET', '/api/teacher/dashboard', { authorization: learner })),
    ).toThrow('Teacher or admin access required');
  });
});
