/**
 * Leitura de respostas de APIs de terceiros (Loteria Integrada: resultados e horóscopo), com as mesmas travas:
 * corpo com tamanho máximo (sem confiar no Content-Length) e mensagem de erro limpa para o log.
 */

/** O corpo passou do limite: a leitura para no meio e a conexão é cancelada. */
export class ResponseTooLargeError extends Error {
  constructor() {
    super('resposta grande demais');
    this.name = 'ResponseTooLargeError';
  }
}

/** Corpo JSON com limite de tamanho; corpo que não é JSON vira undefined (o status decide o que fazer). */
export async function readJsonLimited(res: Response, maxBytes: number): Promise<unknown> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel();
    throw new ResponseTooLargeError();
  }
  if (!res.body) return undefined;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new ResponseTooLargeError();
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return undefined;
  }
}

/** Mensagem de erro do provedor, só texto curto e imprimível (vai para o log). */
export function providerMessage(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const record = body as Record<string, unknown>;
  const raw = [record.mensagem, record.erro, record.message].find((v) => typeof v === 'string') as string | undefined;
  const clean = raw
    ?.replace(/[^\p{L}\p{N}\p{P}\p{Zs}]/gu, '')
    .trim()
    .slice(0, 200);
  return clean || null;
}
