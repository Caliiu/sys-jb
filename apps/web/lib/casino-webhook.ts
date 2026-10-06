import 'server-only';
import { apiBaseUrl, casinoWebhookIpsRaw } from './server-env';
import { cachedAllowlist, checkSource } from './source-allowlist';

/** Uma rodada tem menos de 2 KB; folga para campos extras do provedor. */
const MAX_BODY_BYTES = 16 * 1024;
const TIMEOUT_MS = 10_000;
const TOKEN = /^[\x21-\x7e]{1,512}$/;

const reply = (status: number, msg: string) =>
  Response.json({ msg, balance: 0 }, { status, headers: { 'Cache-Control': 'no-store' } });

const sourceAllowlist = cachedAllowlist(casinoWebhookIpsRaw);

/**
 * Webhook do cassino (PlayFivers: saldo e rodadas). O provedor só chama o endereço cadastrado, então o token vai nele
 * (/integracoes/cassino?token=...); aqui ele passa para o cabeçalho X-Casino-Token e o corpo segue como veio para a
 * API, que confere tudo. Antes, a origem precisa estar em CASINO_WEBHOOK_IPS (a API não é exposta: esta é a porta).
 * O web não guarda segredo da integração e nunca registra o endereço (com o token) nem o corpo. O IP do provedor não é
 * repassado à API: o limite por IP pararia as rodadas de todos os jogadores, que chegam do mesmo endereço. API fora do
 * ar = 500 (ERROR_INTERNAL).
 */
export async function forwardCasinoWebhook(request: Request, sourceIp: string | null): Promise<Response> {
  // Origem: só os IPs do PlayFivers (CASINO_WEBHOOK_IPS). Sem lista, aceita e registra o IP para montar a lista.
  // Só o IP vai para o log (do servidor do provedor; nunca o token nem o corpo).
  if (!checkSource(sourceAllowlist(), sourceIp, 'cassino', 'CASINO_WEBHOOK_IPS')) return reply(403, 'FORBIDDEN');

  const token = new URL(request.url).searchParams.get('token');
  if (!token || !TOKEN.test(token)) return reply(401, 'UNAUTHORIZED');
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return reply(413, 'PAYLOAD_TOO_LARGE');
  const body = await readLimited(request);
  if (body === null) return reply(413, 'PAYLOAD_TOO_LARGE');

  let res: Response;
  try {
    res = await fetch(new URL('/v1/integrations/casino', apiBaseUrl()), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Casino-Token': token },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return reply(500, 'ERROR_INTERNAL');
  }
  return new Response(await res.text(), {
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
