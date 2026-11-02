import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { getRequestUser } from '@app/common';
import { TestServiceService } from '../test-service.service';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Teachers may only modify content they authored. Admins/system are unrestricted
 * and learners never reach authoring routes (the gateway blocks them).
 */
@Injectable()
export class ContentOwnerGuard implements CanActivate {
  constructor(private readonly testService: TestServiceService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<Request>();
    const user = getRequestUser(req);
    if (!user || user.role !== 'teacher') return true;
    if (!MUTATING.has(req.method.toUpperCase())) return true;

    const params = req.params as Record<string, string | undefined>;
    const path = (req.originalUrl || req.url).split('?')[0];
    // Attempt routes are learner-facing, not authoring.
    if (/\/attempts(\/|$)/.test(path)) return true;

    let testId: string | null = null;
    if (params.testId) testId = params.testId;
    else if (params.id && /^\/tests\//.test(path)) testId = params.id;
    else if (params.sectionId)
      testId = await this.testService.testIdOfSection(params.sectionId);
    else if (params.groupId)
      testId = await this.testService.testIdOfGroup(params.groupId);
    else if (params.questionId)
      testId = await this.testService.testIdOfQuestion(params.questionId);

    if (!testId) return true; // creation routes — ownership is stamped on insert
    const test = await this.testService.findTestMeta(testId);
    if (!test) throw new NotFoundException(`Test #${testId} not found`);
    if (test.createdBy !== user.id) {
      throw new ForbiddenException('You can only modify tests you created');
    }
    return true;
  }
}
