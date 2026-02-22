import {
    All,
    Controller,
    Req,
    Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ProxyService } from '../proxy/proxy.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Auth (Proxy)')
@Controller('api/auth')
export class AuthProxyController {
    private readonly baseUrl: string;

    constructor(private readonly proxyService: ProxyService) {
        this.baseUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:5001';
    }

    @All('*')
    @ApiOperation({ summary: 'Proxy all auth routes → auth-service :5001' })
    async proxy(@Req() req: Request, @Res() res: Response): Promise<void> {
        // Strip the /api/auth prefix and forward remainder
        const path = req.url.replace(/^\/api\/auth/, '/auth');
        await this.proxyService.forward(req, res, `${this.baseUrl}${path}`);
    }
}
