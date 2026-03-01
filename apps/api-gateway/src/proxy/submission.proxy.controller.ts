import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ProxyService } from '../proxy/proxy.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

/**
 * Proxies:
 *   /api/attempts/*               → submission-service /attempts/*
 *   /api/writing-submissions/*    → submission-service /writing-submissions/*
 *   /api/speaking-submissions/*   → submission-service /speaking-submissions/*
 *   /api/learners/*               → submission-service /learners/*
 */
@ApiTags('Submissions (Proxy)')
@Controller('api')
export class SubmissionProxyController {
    private readonly baseUrl: string;

    constructor(private readonly proxyService: ProxyService) {
        this.baseUrl =
            process.env.SUBMISSION_SERVICE_URL || 'http://localhost:5003';
    }

    @All('attempts')
    @All('attempts/*')
    @ApiOperation({ summary: 'Proxy attempt routes → submission-service :5003' })
    async proxyAttempts(@Req() req: Request, @Res() res: Response): Promise<void> {
        const path = req.url.replace(/^\/api/, '');
        await this.proxyService.forward(req, res, `${this.baseUrl}${path}`);
    }

    @All('stats')
    @All('stats/*')
    @ApiOperation({ summary: 'Proxy stats routes → submission-service :5003' })
    async proxyStats(@Req() req: Request, @Res() res: Response): Promise<void> {
        const path = req.url.replace(/^\/api/, '');
        await this.proxyService.forward(req, res, `${this.baseUrl}${path}`);
    }

    @All('writing-submissions')
    @All('writing-submissions/*')
    @ApiOperation({ summary: 'Proxy writing submission routes → submission-service :5003' })
    async proxyWriting(@Req() req: Request, @Res() res: Response): Promise<void> {
        const path = req.url.replace(/^\/api/, '');
        await this.proxyService.forward(req, res, `${this.baseUrl}${path}`);
    }

    @All('speaking-submissions')
    @All('speaking-submissions/*')
    @ApiOperation({ summary: 'Proxy speaking submission routes → submission-service :5003' })
    async proxySpeaking(@Req() req: Request, @Res() res: Response): Promise<void> {
        const path = req.url.replace(/^\/api/, '');
        await this.proxyService.forward(req, res, `${this.baseUrl}${path}`);
    }

    @All('learners')
    @All('learners/*')
    @ApiOperation({ summary: 'Proxy learner routes → submission-service :5003' })
    async proxyLearners(@Req() req: Request, @Res() res: Response): Promise<void> {
        const path = req.url.replace(/^\/api/, '');
        await this.proxyService.forward(req, res, `${this.baseUrl}${path}`);
    }
}
