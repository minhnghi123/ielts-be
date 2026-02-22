import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ProxyService } from './proxy.service';
import { AuthProxyController } from './auth.proxy.controller';
import { TestProxyController } from './test.proxy.controller';
import { SubmissionProxyController } from './submission.proxy.controller';
import { AnalyticsProxyController } from './analytics.proxy.controller';

@Module({
    imports: [
        HttpModule.register({
            timeout: 30000,
            maxRedirects: 5,
        }),
    ],
    controllers: [
        AuthProxyController,
        TestProxyController,
        SubmissionProxyController,
        AnalyticsProxyController,
    ],
    providers: [ProxyService],
})
export class ProxyModule { }
