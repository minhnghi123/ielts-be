import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ProxyService } from '../proxy/proxy.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

/**
 * Proxies all routes starting with /api/analytics → analytics-service :5004
 * Pattern covers:
 *   /api/analytics
 *   /api/analytics/summary/:id
 *   /api/analytics/band-profiles/:id
 *   /api/analytics/progress/:id
 *   /api/analytics/mistakes/:id
 *   /api/analytics/sync/:id
 *   /api/analytics/sync-all
 *   /api/analytics/admin/global-stats
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
    @ApiOperation({ summary: 'Proxy analytics root route → analytics-service :5004' })
    async proxyRoot(@Req() req: Request, @Res() res: Response): Promise<void> {
        const path = (req.originalUrl || req.url).replace(/^\/api/, '');
        await this.proxyService.forward(req, res, `${this.baseUrl}${path}`);
    }

    @All('analytics/*')
    @ApiOperation({ summary: 'Proxy analytics/* routes → analytics-service :5004' })
    async proxyWildcard(@Req() req: Request, @Res() res: Response): Promise<void> {
        const path = (req.originalUrl || req.url).replace(/^\/api/, '');
        await this.proxyService.forward(req, res, `${this.baseUrl}${path}`);
    }
}
