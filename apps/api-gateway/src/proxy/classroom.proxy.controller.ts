import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ProxyService } from './proxy.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

/**
 * Proxies /api/classes/** and /api/teacher/** → classroom-service :5005
 */
@ApiTags('Classroom (Proxy)')
@Controller('api')
export class ClassroomProxyController {
    private readonly baseUrl: string;

    constructor(private readonly proxyService: ProxyService) {
        this.baseUrl = process.env.CLASSROOM_SERVICE_URL || 'http://localhost:5005';
    }

    @All(['classes', 'classes/*', 'teacher', 'teacher/*'])
    @ApiOperation({ summary: 'Proxy classroom routes → classroom-service :5005' })
    async proxy(@Req() req: Request, @Res() res: Response): Promise<void> {
        const path = (req.originalUrl || req.url).replace(/^\/api/, '');
        await this.proxyService.forward(req, res, `${this.baseUrl}${path}`);
    }
}
