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
