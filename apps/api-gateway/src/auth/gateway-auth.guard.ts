import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { RequestUser, TeacherStatus, USER_HEADERS } from '@app/common';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | '*';

interface RouteRule {
  method: Method;
  pattern: RegExp;
}

const rule = (method: Method, pattern: RegExp): RouteRule => ({
  method,
  pattern,
});

/** Routes that never require a token. */
const PUBLIC_ROUTES: RouteRule[] = [
  rule('POST', /^\/api\/auth\/(login|register|google)$/),
  rule('GET', /^\/api\/tests(\?.*)?$/),
  rule('GET', /^\/api\/tests\/[0-9a-f-]{36}$/i),
  rule('GET', /^\/api\/health$/),
  rule('GET', /^\/api\/docs/),
];

/** Routes only admins may call. Everything else is available to any signed-in user. */
const ADMIN_ROUTES: RouteRule[] = [
  rule('*', /^\/api\/auth\/users/),
  rule('*', /^\/api\/auth\/teachers/),
  rule('PATCH', /^\/api\/tests\/[^/]+\/visibility$/),
  rule('*', /^\/api\/analytics\/admin\//),
  rule('POST', /^\/api\/analytics\/sync-all$/),
  rule('*', /^\/api\/stats/),
  rule('*', /^\/api\/teacher\/evaluation/),
];

/**
 * Content-authoring routes: admins and (approved) teachers. Ownership of a
 * teacher's own tests is enforced inside test-service.
 */
const AUTHOR_ROUTES: RouteRule[] = [
  rule('POST', /^\/api\/tests/),
  rule(
    'PUT',
    /^\/api\/(tests|sections|groups|questions|writing-tasks|speaking-parts)\//,
  ),
  rule(
    'PATCH',
    /^\/api\/(tests|sections|groups|questions|writing-tasks|speaking-parts)\//,
  ),
  rule(
    'DELETE',
    /^\/api\/(tests|sections|groups|questions|writing-tasks|speaking-parts)\//,
  ),
  rule('POST', /^\/api\/(sections|groups)\//),
  rule('GET', /^\/api\/groups\/[^/]+\/questions/),
  rule('*', /^\/api\/teacher\//),
];

/**
 * Learner-initiated attempt creation is a POST under /api/tests/:id/attempts,
 * so it must be exempted from the "POST /api/tests* is admin" rule above.
 */
const LEARNER_POST_EXCEPTIONS: RegExp[] = [/^\/api\/tests\/[^/]+\/attempts$/];

/** Routes trusted server code (Next.js API routes) may call with the internal key. */
const SYSTEM_ROUTES: RouteRule[] = [
  rule('PUT', /^\/api\/attempts\/[^/]+\/ai-feedback$/),
  rule('GET', /^\/api\/classes\/[^/]+\/submissions\/[^/]+$/),
  rule('POST', /^\/api\/writing-gradings$/),
  rule('POST', /^\/api\/(writing|speaking)-submissions$/),
  rule('GET', /^\/api\/attempts\/[^/]+$/),
  rule('PUT', /^\/api\/analytics\/explanations$/),
  rule('PUT', /^\/api\/analytics\/tutor\/hints$/),
  rule('GET', /^\/api\/drills\/answer-key\/[^/]+$/),
];

function matches(rules: RouteRule[], method: string, path: string): boolean {
  return rules.some(
    (r) => (r.method === '*' || r.method === method) && r.pattern.test(path),
  );
}

@Injectable()
export class GatewayAuthGuard implements CanActivate {
  private readonly logger = new Logger(GatewayAuthGuard.name);

  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: RequestUser }>();
    const method = req.method.toUpperCase();
    const fullPath = req.originalUrl || req.url;
    const path = fullPath.split('?')[0];

    if (method === 'OPTIONS') return true;

    const user = this.authenticate(req);
    req.user = user ?? undefined;

    if (
      matches(PUBLIC_ROUTES, method, fullPath) ||
      matches(PUBLIC_ROUTES, method, path)
    ) {
      return true;
    }

    if (!user) throw new UnauthorizedException('Authentication required');

    if (user.role === 'system') {
      if (matches(SYSTEM_ROUTES, method, path)) return true;
      throw new ForbiddenException('Internal key is not allowed on this route');
    }

    const isAdminRoute =
      matches(ADMIN_ROUTES, method, path) &&
      !(method === 'POST' && LEARNER_POST_EXCEPTIONS.some((p) => p.test(path)));

    if (isAdminRoute && user.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }

    const isAuthorRoute =
      matches(AUTHOR_ROUTES, method, path) &&
      !(method === 'POST' && LEARNER_POST_EXCEPTIONS.some((p) => p.test(path)));
    if (isAuthorRoute && user.role !== 'admin') {
      if (user.role !== 'teacher') {
        throw new ForbiddenException('Teacher or admin access required');
      }
      if (user.teacherStatus && user.teacherStatus !== 'approved') {
        throw new ForbiddenException(
          'Your teacher account has not been approved yet',
        );
      }
    }
    return true;
  }

  private authenticate(req: Request): RequestUser | null {
    const internalKey = process.env.INTERNAL_API_KEY;
    const providedKey = req.headers[USER_HEADERS.INTERNAL_KEY];
    if (
      internalKey &&
      providedKey === internalKey &&
      !req.headers.authorization
    ) {
      return { id: null, email: null, role: 'system', profileId: null };
    }

    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return null;

    try {
      const payload = this.jwtService.verify<{
        sub: string;
        email?: string;
        role?: string;
        profileId?: string;
        teacherStatus?: TeacherStatus;
      }>(auth.slice(7));
      const role =
        payload.role === 'admin'
          ? 'admin'
          : payload.role === 'teacher'
            ? 'teacher'
            : 'learner';
      return {
        id: payload.sub,
        email: payload.email ?? null,
        role,
        profileId: payload.profileId ?? null,
        teacherStatus:
          role === 'teacher' ? (payload.teacherStatus ?? 'pending') : null,
      };
    } catch (err) {
      this.logger.debug(`JWT rejected: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
