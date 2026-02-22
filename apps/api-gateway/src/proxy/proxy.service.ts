import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Request, Response } from 'express';
import { lastValueFrom } from 'rxjs';
import { AxiosRequestConfig } from 'axios';

@Injectable()
export class ProxyService {
    private readonly logger = new Logger(ProxyService.name);

    constructor(private readonly httpService: HttpService) { }

    async forward(req: Request, res: Response, targetUrl: string): Promise<void> {
        const method = req.method.toLowerCase() as
            | 'get'
            | 'post'
            | 'put'
            | 'patch'
            | 'delete';

        // Build forwarding headers — pass through auth + content-type
        const headers: Record<string, string> = {};
        if (req.headers['authorization']) {
            headers['Authorization'] = req.headers['authorization'] as string;
        }
        if (req.headers['content-type']) {
            headers['Content-Type'] = req.headers['content-type'] as string;
        }
        headers['X-Forwarded-For'] =
            (req.headers['x-forwarded-for'] as string) || req.ip || '';

        const config: AxiosRequestConfig = {
            url: targetUrl,
            method,
            headers,
            params: req.query,
            data: ['post', 'put', 'patch'].includes(method) ? req.body : undefined,
            // Don't throw on non-2xx — let the downstream response pass through
            validateStatus: () => true,
        };

        this.logger.debug(`Proxying ${req.method} ${req.url} → ${targetUrl}`);

        try {
            const response = await lastValueFrom(
                this.httpService.request(config),
            );

            // Copy status and data straight through to the client
            res.status(response.status).json(response.data);
        } catch (err: any) {
            this.logger.error(`Proxy error → ${targetUrl}: ${err.message}`);
            res.status(502).json({
                statusCode: 502,
                message: 'Bad Gateway — downstream service unavailable',
                error: err.message,
            });
        }
    }
}
