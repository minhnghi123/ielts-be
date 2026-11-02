import { Injectable, Logger } from '@nestjs/common';
import { internalJson } from './internal-http';

export interface TestMeta {
  id: string;
  skill: string;
  title: string;
  isMock: boolean;
  difficulty?: string;
  status: string;
  visibility: 'public' | 'private';
  createdBy: string;
  ownerRole?: 'admin' | 'teacher';
  durationMinutes?: number;
  description?: string | null;
}

export interface AttemptSummary {
  id: string;
  testId: string;
  learnerId: string;
  assignmentId: string | null;
  attemptNo: number;
  status: string;
  rawScore: number | null;
  bandScore: number | string | null;
  aiFeedback?: string | null;
  startedAt: string;
  submittedAt: string | null;
  expiresAt: string | null;
  draftAnswers?: Record<string, string>;
  questionAttempts?: unknown[];
  test?: { id: string; skill: string; title: string };
  [key: string]: unknown;
}

@Injectable()
export class TestClient {
  private readonly logger = new Logger(TestClient.name);
  private readonly baseUrl =
    process.env.TEST_SERVICE_URL || 'http://localhost:5002';

  async getTest(testId: string): Promise<TestMeta | null> {
    return internalJson<TestMeta>(
      this.logger,
      `${this.baseUrl}/tests/${testId}`,
    );
  }

  /** Full attempt incl. review data (system role sees everything once submitted). */
  async getAttempt(attemptId: string): Promise<AttemptSummary | null> {
    return internalJson<AttemptSummary>(
      this.logger,
      `${this.baseUrl}/attempts/${attemptId}`,
    );
  }

  async getAttemptsForAssignment(
    assignmentId: string,
    learnerId?: string,
  ): Promise<AttemptSummary[]> {
    const qs = new URLSearchParams({ assignmentId });
    if (learnerId) qs.set('learnerId', learnerId);
    return (
      (await internalJson<AttemptSummary[]>(
        this.logger,
        `${this.baseUrl}/internal/attempts?${qs}`,
      )) ?? []
    );
  }
}
