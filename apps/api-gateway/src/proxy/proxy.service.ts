import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Request, Response } from 'express';
import { lastValueFrom } from 'rxjs';
import { AxiosRequestConfig } from 'axios';
import { RequestUser, USER_HEADERS } from '@app/common';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);

  constructor(private readonly httpService: HttpService) {}

  async forward(req: Request, res: Response, targetUrl: string): Promise<void> {
    const method = req.method.toLowerCase() as HttpMethod;

    const headers: Record<string, string> = {};
    if (req.headers['authorization']) {
      headers['Authorization'] = req.headers['authorization'] as string;
    }
    if (req.headers['content-type']) {
      headers['Content-Type'] = req.headers['content-type'] as string;
    }
    headers['X-Forwarded-For'] =
      (req.headers['x-forwarded-for'] as string) || req.ip || '';

    // Identity headers are set exclusively from the verified token — any
    // client-supplied x-user-* headers are dropped here.
    const user = (req as Request & { user?: RequestUser }).user;
    if (user) {
      headers[USER_HEADERS.ROLE] = user.role;
      if (user.id) headers[USER_HEADERS.USER_ID] = user.id;
      if (user.email) headers[USER_HEADERS.EMAIL] = user.email;
      if (user.profileId) headers[USER_HEADERS.PROFILE_ID] = user.profileId;
      if (user.teacherStatus)
        headers[USER_HEADERS.TEACHER_STATUS] = user.teacherStatus;
    }
    if (process.env.INTERNAL_API_KEY) {
      headers[USER_HEADERS.INTERNAL_KEY] = process.env.INTERNAL_API_KEY;
    }

    const config: AxiosRequestConfig = {
      url: targetUrl,
      method,
      headers,
      data: ['post', 'put', 'patch'].includes(method) ? req.body : undefined,
      validateStatus: () => true,
    };

    this.logger.debug(`Proxying ${req.method} ${req.url} → ${targetUrl}`);

    try {
      const response = await lastValueFrom(this.httpService.request(config));
      if (
        response.status === 204 ||
        response.data === undefined ||
        response.data === ''
      ) {
        res.status(response.status).end();
        return;
      }
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
