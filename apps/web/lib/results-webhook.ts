import 'server-only';
import { apiBaseUrl } from './server-env';

/** Mesmo limite do corpo JSON da API (um resultado tem menos de 1 KB). */
const MAX_BODY_BYTES = 16 * 1024;
const TIMEOUT_MS = 10_000;

/** Cabeçalhos em que o provedor manda o token; repassados sem alteração (quem confere é a API). */
const TOKEN_HEADERS = ['x-auth-token', 'token', 'authorization'] as const;

const reply = (status: number, codigo: number, mensagem: string) =>
  Response.json({ codigo, mensagem }, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * Webhook de resultados (Loteria Integrada): a API não é exposta à internet, então o POST público chega aqui e é
 * repassado a ela como veio (corpo e token). O web não guarda segredo nenhum da integração. Resposta = a da API;
 * API fora do ar = 502 (o provedor reenvia até receber 200/201).
 */
export async function forwardResultsWebhook(request: Request, clientIp: string | null): Promise<Response> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return reply(413, 413, 'Payload muito grande.');
  const body = await readLimited(request);
  if (body === null) return reply(413, 413, 'Payload muito grande.');

  const headers: Record<string, string> = {
    'Content-Type': request.headers.get('content-type') ?? 'application/json',
    Accept: 'application/json',
  };
  for (const name of TOKEN_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers[name] = value;
  }
  if (clientIp) headers['X-Client-IP'] = clientIp;

  let res: Response;
  try {
    res = await fetch(new URL('/v1/integrations/results', apiBaseUrl()), {
      method: 'POST',
      headers,
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return reply(502, 502, 'Serviço indisponível. Tente novamente.');
  }
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json', 'Cache-Control': 'no-store' },
  });
}

/** Corpo com limite de tamanho (null = passou do limite), sem confiar no Content-Length. */
async function readLimited(request: Request): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(new ArrayBuffer(size));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
