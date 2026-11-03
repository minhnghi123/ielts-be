import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { getRequestUser, USER_HEADERS, UserRole } from './user-context';

export const ROLES_KEY = 'roles';
export const PUBLIC_KEY = 'isPublic';

/** Restrict a handler/controller to the given roles (admin, learner, system). */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
/** Opt a handler out of the identity requirement. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/**
 * Guard used inside every downstream service.
 *
 * 1. If INTERNAL_API_KEY is configured, the request must carry a matching
 *    `x-internal-key` header — only the gateway (or trusted server code) has it,
 *    so identity headers cannot be forged by calling a service directly.
 * 2. Unless the route is @Public(), an identity header set must be present.
 * 3. If @Roles() is declared, the caller's role must be one of them.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const req = context.switchToHttp().getRequest<Request>();
    const targets = [context.getHandler(), context.getClass()];

    const internalKey = process.env.INTERNAL_API_KEY;
    if (internalKey) {
      const provided = req.headers[USER_HEADERS.INTERNAL_KEY];
      if (provided !== internalKey) {
        throw new UnauthorizedException(
          'Requests must go through the API gateway',
        );
      }
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_KEY,
      targets,
    );
    if (isPublic) return true;

    const user = getRequestUser(req);
    if (!user) throw new UnauthorizedException('Authentication required');

    const roles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      targets,
    );
    if (roles?.length && !roles.includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
