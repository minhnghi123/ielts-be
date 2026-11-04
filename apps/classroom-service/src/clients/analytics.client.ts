import { Injectable, Logger } from '@nestjs/common';
import { internalJson } from './internal-http';

@Injectable()
export class AnalyticsClient {
  private readonly logger = new Logger(AnalyticsClient.name);
  private readonly baseUrl =
    process.env.ANALYTICS_SERVICE_URL || 'http://localhost:5004';

  async getSummary(learnerId: string): Promise<Record<string, unknown> | null> {
    return internalJson<Record<string, unknown>>(
      this.logger,
      `${this.baseUrl}/analytics/summary/${learnerId}`,
    );
  }

  async getMistakeSummary(learnerId: string): Promise<{ total: number; byCause: Record<string, number>; byQuestionType: Record<string, number>; byStatus: Record<string, number> } | null> {
    return internalJson(this.logger, `${this.baseUrl}/analytics/mistakes/${learnerId}/summary`);
  }

  async getWritingErrors(learnerId: string): Promise<{ total: number; byType: Record<string, number> } | null> {
    return internalJson(this.logger, `${this.baseUrl}/analytics/writing-errors/${learnerId}`);
  }

  async bulkAssignTasks(body: Record<string, unknown>): Promise<{ created: number } | null> {
    return internalJson(this.logger, `${this.baseUrl}/analytics/plan/tasks/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async getBandProfiles(learnerId: string): Promise<unknown[]> {
    return (
      (await internalJson<unknown[]>(
        this.logger,
        `${this.baseUrl}/analytics/band-profiles/${learnerId}`,
      )) ?? []
    );
  }

  async getProgress(learnerId: string): Promise<unknown[]> {
    return (
      (await internalJson<unknown[]>(
        this.logger,
        `${this.baseUrl}/analytics/progress/${learnerId}`,
      )) ?? []
    );
  }
}
