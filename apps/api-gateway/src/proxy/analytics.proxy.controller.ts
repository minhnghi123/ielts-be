import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ProxyService } from '../proxy/proxy.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

/**
 * Proxies:
 *   /api/analytics/*  → analytics-service /analytics/*
 */
@ApiTags('Analytics (Proxy)')
@Controller('api')
export class AnalyticsProxyController {
    private readonly baseUrl: string;

    constructor(private readonly proxyService: ProxyService) {
        this.baseUrl =
            process.env.ANALYTICS_SERVICE_URL || 'http://localhost:5004';
    }

    @All('analytics')
    @All('analytics/*')
    @ApiOperation({ summary: 'Proxy analytics routes → analytics-service :5004' })
    async proxy(@Req() req: Request, @Res() res: Response): Promise<void> {
        const path = req.url.replace(/^\/api/, '');
        await this.proxyService.forward(req, res, `${this.baseUrl}${path}`);
    }
}
