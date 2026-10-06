import 'server-only';
import { apiBaseUrl, paymentsWebhookIpsRaw } from './server-env';
import { cachedAllowlist, checkSource } from './source-allowlist';

/** Um aviso de depósito tem menos de 1 KB; folga para campos extras do gateway. */
const MAX_BODY_BYTES = 16 * 1024;
const TIMEOUT_MS = 15_000;
const GATEWAY = /^[a-z0-9]{2,20}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

const sourceAllowlist = cachedAllowlist(paymentsWebhookIpsRaw);

const reply = (status: number) =>
  Response.json({ ok: status === 200 }, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * Aviso (webhook) do gateway de pagamento. O endereço de cada depósito (d) ou saque (s) leva o id e a assinatura dele
 * (/integracoes/pagamentos/<gateway>?d=...&t=... ou ?s=...&t=...); aqui passam id, assinatura (no formato certo) e
 * o corpo JSON (com
 * limite de tamanho) para a API, que não é exposta à internet. A API confere a assinatura e só aproveita do corpo quem
 * pagou; situação e valor ela confere no próprio gateway. Antes, a origem precisa estar em PAYMENTS_WEBHOOK_IPS: com a
 * lista, nem um endereço vazado (com a assinatura) serve a quem não é o gateway. O web não guarda segredo nenhum da
 * integração e nunca registra o endereço (com a assinatura) nem o corpo (tem o CPF de quem pagou). O IP do gateway não
 * é repassado à API (o limite por IP pararia os avisos de todos os depósitos). API fora do ar = 502 (o gateway reenvia;
 * a conferência automática também cobre).
 */
export async function forwardPaymentWebhook(
  request: Request,
  gateway: string,
  sourceIp: string | null,
): Promise<Response> {
  if (!checkSource(sourceAllowlist(), sourceIp, 'pagamentos', 'PAYMENTS_WEBHOOK_IPS')) {
    await request.body?.cancel();
    return reply(403);
  }
  const params = new URL(request.url).searchParams;
  // Aviso de um depósito (d) ou de um saque (s): exatamente um dos dois.
  const depositId = params.get('d');
  const withdrawalId = params.get('s');
  const subject: ['d' | 's', string] | null =
    depositId !== null && withdrawalId === null
      ? ['d', depositId]
      : withdrawalId !== null && depositId === null
        ? ['s', withdrawalId]
        : null;
  const token = params.get('t') ?? '';
  if (!GATEWAY.test(gateway) || !subject || !UUID.test(subject[1]) || !TOKEN.test(token)) {
    await request.body?.cancel();
    return reply(401);
  }
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    await request.body?.cancel();
    return reply(413);
  }
  const body = await readLimited(request);
  if (body === null) return reply(413);

  const target = new URL(`/v1/integrations/payments/${gateway}`, apiBaseUrl());
  target.searchParams.set(subject[0], subject[1]);
  target.searchParams.set('t', token);
  let res: Response;
  try {
    res = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return reply(502);
  }
  await res.body?.cancel();
  return reply(res.status === 200 ? 200 : res.status === 401 ? 401 : 502);
}

/** Corpo com limite de tamanho (null = passou do limite), sem confiar no Content-Length. Vazio = objeto vazio. */
async function readLimited(request: Request): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!request.body) return new TextEncoder().encode('{}') as Uint8Array<ArrayBuffer>;
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
  if (size === 0) return new TextEncoder().encode('{}') as Uint8Array<ArrayBuffer>;
  const out = new Uint8Array(new ArrayBuffer(size));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
