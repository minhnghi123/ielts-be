import { Logger } from '@nestjs/common';
import { USER_HEADERS } from '@app/common';

/** Shared helper: call another service as `system` with the internal key and unwrap TransformInterceptor. */
export async function internalJson<T>(
  logger: Logger,
  url: string,
  init: RequestInit = {},
): Promise<T | null> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    [USER_HEADERS.ROLE]: 'system',
    ...((init.headers as Record<string, string>) || {}),
  };
  if (process.env.INTERNAL_API_KEY)
    headers[USER_HEADERS.INTERNAL_KEY] = process.env.INTERNAL_API_KEY;
  try {
    const res = await fetch(url, { ...init, headers });
    if (!res.ok) {
      logger.warn(`${init.method || 'GET'} ${url} → ${res.status}`);
      return null;
    }
    if (res.status === 204) return null;
    const body = (await res.json()) as { data?: T } | T;
    return body && typeof body === 'object' && 'data' in (body as object)
      ? ((body as { data: T }).data ?? null)
      : (body as T);
  } catch (err) {
    logger.warn(`${init.method || 'GET'} ${url} failed: ${String(err)}`);
    return null;
  }
}
