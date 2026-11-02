import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ProxyService } from './proxy.service';
import { HealthController } from '../health.controller';
import { AuthProxyController } from './auth.proxy.controller';
import { TestProxyController } from './test.proxy.controller';
import { SubmissionProxyController } from './submission.proxy.controller';
import { AnalyticsProxyController } from './analytics.proxy.controller';
import { ClassroomProxyController } from './classroom.proxy.controller';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
  ],
  controllers: [
    HealthController,
    AuthProxyController,
    TestProxyController,
    SubmissionProxyController,
    AnalyticsProxyController,
    ClassroomProxyController,
  ],
  providers: [ProxyService],
})
export class ProxyModule {}
