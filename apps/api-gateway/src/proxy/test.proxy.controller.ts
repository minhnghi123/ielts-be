import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ProxyService } from '../proxy/proxy.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

/**
 * Proxies:
 *   /api/tests/*      → test-service /tests/*
 *   /api/sections/*   → test-service /sections/*
 *   /api/questions/*  → test-service /questions/*
 */
@ApiTags('Tests (Proxy)')
@Controller('api')
export class TestProxyController {
    private readonly baseUrl: string;

    constructor(private readonly proxyService: ProxyService) {
        this.baseUrl = process.env.TEST_SERVICE_URL || 'http://localhost:5002';
    }

    @All('tests')
    @All('tests/*')
    @ApiOperation({ summary: 'Proxy test routes → test-service :5002' })
    async proxyTests(@Req() req: Request, @Res() res: Response): Promise<void> {
        const path = req.url.replace(/^\/api/, '');
        await this.proxyService.forward(req, res, `${this.baseUrl}${path}`);
    }

    @All('sections')
    @All('sections/*')
    @ApiOperation({ summary: 'Proxy section routes → test-service :5002' })
    async proxySections(@Req() req: Request, @Res() res: Response): Promise<void> {
        const path = req.url.replace(/^\/api/, '');
        await this.proxyService.forward(req, res, `${this.baseUrl}${path}`);
    }

    @All('questions')
    @All('questions/*')
    @ApiOperation({ summary: 'Proxy question routes → test-service :5002' })
    async proxyQuestions(@Req() req: Request, @Res() res: Response): Promise<void> {
        const path = req.url.replace(/^\/api/, '');
        await this.proxyService.forward(req, res, `${this.baseUrl}${path}`);
    }
}
