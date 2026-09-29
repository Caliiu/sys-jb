import 'server-only';
import http from 'node:http';
import type { ApiError } from '@sysjb/contracts';
import type { ApiResult } from './api-result';
import { clientIp } from './client-ip';
import { apiBaseUrl, serviceKeyFor } from './server-env';

export type { ApiResult } from './api-result';

const TIMEOUT_MS = 5_000;

/** IP do visitante para o limite de requisições da API (só quando há um confiável; ver client-ip). */
async function clientIpHeader(): Promise<Record<string, string>> {
  const ip = await clientIp();
  return ip ? { 'X-Client-IP': ip } : {};
}

/**
 * Chama a API a partir do servidor Next. O Host enviado é o hostname da banca que o
 * navegador acessou; a API resolve a banca por ele e confere a credencial. O IP do visitante vai junto para o
 * limite de requisições.
 * Usa node:http porque o fetch não permite definir o header Host.
 */
export async function apiRequest<T>(
  hostname: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  options: { sessionToken?: string; operatorToken?: string } = {},
): Promise<ApiResult<T>> {
  const key = serviceKeyFor(hostname);
  if (!key) {
    return {
      ok: false,
      status: 404,
      error: { statusCode: 404, code: 'TENANT_NOT_FOUND', message: 'Hostname sem credencial configurada no web.' },
    };
  }

  const url = new URL(path, apiBaseUrl());
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const forwarded = await clientIpHeader();

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
          ...forwarded,
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

/** Imagens da API (ex.: mural): até 4 MB; maior que isso é descartado. */
const IMAGE_MAX_BYTES = 4 * 1024 * 1024;

export type ImageResult = { ok: true; contentType: string; data: Buffer } | { ok: false; status: number };

/** GET de uma imagem da API (mesma credencial e Host de `apiRequest`). Só aceita resposta `image/*`. */
export async function apiRequestImage(
  hostname: string,
  path: string,
  options: { sessionToken?: string; operatorToken?: string } = {},
): Promise<ImageResult> {
  const key = serviceKeyFor(hostname);
  if (!key) return { ok: false, status: 404 };
  const forwarded = await clientIpHeader();

  return new Promise<ImageResult>((resolve) => {
    const req = http.request(
      new URL(path, apiBaseUrl()),
      {
        method: 'GET',
        timeout: TIMEOUT_MS,
        headers: {
          Host: hostname,
          Authorization: `Bearer ${key}`,
          Accept: 'image/*',
          ...forwarded,
          ...(options.sessionToken ? { 'X-Session-Token': options.sessionToken } : {}),
          ...(options.operatorToken ? { 'X-Operator-Token': options.operatorToken } : {}),
        },
      },
      (res) => {
        const status = res.statusCode ?? 502;
        const contentType = res.headers['content-type'] ?? '';
        if (status !== 200 || !/^image\/[a-z0-9.+-]+$/.test(contentType)) {
          res.resume();
          resolve({ ok: false, status: status === 200 ? 502 : status });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.byteLength;
          if (size > IMAGE_MAX_BYTES) req.destroy(new Error('too large'));
          else chunks.push(c);
        });
        res.on('end', () => resolve({ ok: true, contentType, data: Buffer.concat(chunks) }));
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => resolve({ ok: false, status: 502 }));
    req.end();
  });
}

function unavailable(status: number): ApiError {
  return { statusCode: status, code: 'INTERNAL_ERROR', message: 'API indisponível.' };
}
