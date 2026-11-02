import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { USER_HEADERS } from '@app/common';

export interface AssignmentEligibility {
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

/**
 * Thin internal HTTP client for classroom-service. test-service never reads
 * classroom tables directly; it asks the owning service with the internal key.
 */
@Injectable()
export class ClassroomClient {
    private readonly logger = new Logger(ClassroomClient.name);
    private readonly baseUrl = process.env.CLASSROOM_SERVICE_URL || 'http://localhost:5005';
    private readonly accessCache = new Map<string, { allowed: boolean; until: number }>();

    private headers(): Record<string, string> {
        const h: Record<string, string> = {
            'Content-Type': 'application/json',
            [USER_HEADERS.ROLE]: 'system',
        };
        if (process.env.INTERNAL_API_KEY) h[USER_HEADERS.INTERNAL_KEY] = process.env.INTERNAL_API_KEY;
        return h;
    }

    private async getJson<T>(path: string): Promise<T | null> {
        try {
            const res = await fetch(`${this.baseUrl}${path}`, { headers: this.headers() });
            if (!res.ok) {
                this.logger.warn(`classroom-service ${path} → ${res.status}`);
                return null;
            }
            const body = (await res.json()) as { data?: T } | T;
            return (body as { data?: T }).data !== undefined ? (body as { data: T }).data : (body as T);
        } catch (err) {
            this.logger.warn(`classroom-service unreachable (${path}): ${String(err)}`);
            return null;
        }
    }

    /** Can this learner open a private test through one of their class assignments? */
    async canAccessTest(learnerId: string, testId: string): Promise<boolean> {
        const key = `${learnerId}:${testId}`;
        const cached = this.accessCache.get(key);
        if (cached && cached.until > Date.now()) return cached.allowed;
        const data = await this.getJson<{ allowed: boolean }>(
            `/internal/access?learnerId=${learnerId}&testId=${testId}`,
        );
        const allowed = data?.allowed === true;
        this.accessCache.set(key, { allowed, until: Date.now() + 60_000 });
        return allowed;
    }

    async getEligibility(assignmentId: string, learnerId: string): Promise<AssignmentEligibility> {
        const data = await this.getJson<AssignmentEligibility>(
            `/internal/assignments/${assignmentId}/eligibility?learnerId=${learnerId}`,
        );
        if (!data) {
            throw new ServiceUnavailableException('Classroom service is unavailable, please try again');
        }
        return data;
    }

    /** Number of assignments referencing a test (blocks deletion). Unknown → 0. */
    async countAssignments(testId: string): Promise<number> {
        const data = await this.getJson<{ count: number }>(`/internal/assignments/count?testId=${testId}`);
        return data?.count ?? 0;
    }
}
