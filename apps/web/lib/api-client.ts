import 'server-only';
import http from 'node:http';
import type { ApiError } from '@sysjb/contracts';
import type { ApiResult } from './api-result';
import { apiBaseUrl, serviceKeyFor } from './server-env';

export type { ApiResult } from './api-result';

const TIMEOUT_MS = 5_000;

/**
 * Chama a API a partir do servidor Next. O Host enviado é o hostname da banca que o
 * navegador acessou; a API resolve a banca por ele e confere a credencial.
 * Usa node:http porque o fetch não permite definir o header Host.
 */
export function apiRequest<T>(
  hostname: string,
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: unknown,
  options: { sessionToken?: string; operatorToken?: string } = {},
) {
  const key = serviceKeyFor(hostname);
  if (!key) {
    return Promise.resolve<ApiResult<T>>({
      ok: false,
      status: 404,
      error: { statusCode: 404, code: 'TENANT_NOT_FOUND', message: 'Hostname sem credencial configurada no web.' },
    });
  }

  const url = new URL(path, apiBaseUrl());
  const payload = body === undefined ? undefined : JSON.stringify(body);

  return new Promise<ApiResult<T>>((resolve) => {
    const req = http.request(
      url,
      {
        method,
        timeout: TIMEOUT_MS,
        headers: {
          Host: hostname,
          Authorization: `Bearer ${key}`,
          Accept: 'application/json',
          ...(options.sessionToken ? { 'X-Session-Token': options.sessionToken } : {}),
          ...(options.operatorToken ? { 'X-Operator-Token': options.operatorToken } : {}),
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const status = res.statusCode ?? 502;
          let parsed: unknown;
          try {
            parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            parsed = undefined;
          }
          if (status >= 200 && status < 300) resolve({ ok: true, status, data: (parsed ?? null) as T });
          else resolve({ ok: false, status, error: (parsed as ApiError) ?? unavailable(status) });
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => resolve({ ok: false, status: 502, error: unavailable(502) }));
    if (payload) req.write(payload);
    req.end();
  });
}

function unavailable(status: number): ApiError {
  return { statusCode: status, code: 'INTERNAL_ERROR', message: 'API indisponível.' };
}
