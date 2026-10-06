import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let allowedIps = '';
vi.mock('server-only', () => ({}));
vi.mock('./server-env', () => ({
  apiBaseUrl: () => 'http://api.internal:4000',
  paymentsWebhookIpsRaw: () => allowedIps,
}));

const { forwardPaymentWebhook } = await import('./payments-webhook');

const DEPOSIT = '6f0c3a52-1d9b-4c55-8a4e-2f1b9c7d3e10';
const TOKEN = 'A'.repeat(42) + 'b';
const GATEWAY_IP = '203.0.113.10';
const BODY = JSON.stringify({ transactionId: 31484480, transactionType: 'DEPOSITO', clientDocument: '52998224725' });
const post = (query: string, body = BODY) =>
  new Request(`https://trevo.exemplo.com/integracoes/pagamentos/misticpay${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: 'x=1' },
    body,
  });
const signed = `?d=${DEPOSIT}&t=${TOKEN}`;

beforeEach(() => {
  allowedIps = '';
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('forwardPaymentWebhook', () => {
  it('repassa gateway, depósito, assinatura e o corpo JSON à API (sem cookies nem o IP) e responde 200', async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await forwardPaymentWebhook(post(signed), 'misticpay', GATEWAY_IP);

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe(`http://api.internal:4000/v1/integrations/payments/misticpay${signed}`);
    expect(init.redirect).toBe('error');
    expect(new TextDecoder().decode(init.body as Uint8Array)).toBe(BODY);
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Accept: 'application/json' });
  });

  it('com PAYMENTS_WEBHOOK_IPS: só os IPs do gateway passam; os outros = 403 sem chamar a API', async () => {
    allowedIps = '203.0.113.0/24, 2001:db8::1';
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    expect((await forwardPaymentWebhook(post(signed), 'misticpay', '198.51.100.7')).status).toBe(403);
    expect((await forwardPaymentWebhook(post(signed), 'misticpay', null)).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();

    expect((await forwardPaymentWebhook(post(signed), 'misticpay', GATEWAY_IP)).status).toBe(200);
    expect((await forwardPaymentWebhook(post(signed), 'misticpay', `::ffff:${GATEWAY_IP}`)).status).toBe(200);
    expect((await forwardPaymentWebhook(post(signed), 'misticpay', '2001:db8::1')).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('lista com entrada inválida recusa tudo (403); sem lista aceita e registra o IP', async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    allowedIps = '203.0.113.0/99';
    expect((await forwardPaymentWebhook(post(signed), 'misticpay', GATEWAY_IP)).status).toBe(403);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('PAYMENTS_WEBHOOK_IPS com entrada inválida'));
    expect(fetchMock).not.toHaveBeenCalled();

    allowedIps = '';
    expect((await forwardPaymentWebhook(post(signed), 'misticpay', GATEWAY_IP)).status).toBe(200);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining(`de ${GATEWAY_IP} aceito sem PAYMENTS_WEBHOOK_IPS`),
    );
    // O log nunca leva a assinatura nem o CPF do corpo.
    const logged = JSON.stringify([...vi.mocked(console.warn).mock.calls, ...vi.mocked(console.error).mock.calls]);
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain('52998224725');
  });

  it('corpo vazio vira {}; corpo grande demais = 413 sem chamar a API', async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await forwardPaymentWebhook(post(signed, ''), 'misticpay', GATEWAY_IP);
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(new TextDecoder().decode(init.body as Uint8Array)).toBe('{}');

    fetchMock.mockClear();
    const big = await forwardPaymentWebhook(post(signed, 'x'.repeat(17 * 1024)), 'misticpay', GATEWAY_IP);
    expect(big.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('endereço fora do formato: 401 sem chamar a API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    for (const [query, gateway] of [
      ['', 'misticpay'],
      [`?d=nao-uuid&t=${TOKEN}`, 'misticpay'],
      [`?d=${DEPOSIT}&t=curto`, 'misticpay'],
      [signed, '../admin'],
      // Depósito e saque ao mesmo tempo: ambíguo.
      [`?d=${DEPOSIT}&s=${DEPOSIT}&t=${TOKEN}`, 'misticpay'],
      [`?s=nao-uuid&t=${TOKEN}`, 'misticpay'],
    ] as const) {
      expect((await forwardPaymentWebhook(post(query), gateway, GATEWAY_IP)).status).toBe(401);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aviso de saque (?s=): repassa o id do saque e a assinatura à API', async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await forwardPaymentWebhook(post(`?s=${DEPOSIT}&t=${TOKEN}`), 'misticpay', GATEWAY_IP);
    expect(res.status).toBe(200);
    const [url] = fetchMock.mock.calls[0] as unknown as [URL];
    expect(String(url)).toBe(`http://api.internal:4000/v1/integrations/payments/misticpay?s=${DEPOSIT}&t=${TOKEN}`);
  });

  it('assinatura recusada pela API = 401; API fora do ar ou erro = 502 (o gateway reenvia)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({}, { status: 401 })),
    );
    expect((await forwardPaymentWebhook(post(signed), 'misticpay', GATEWAY_IP)).status).toBe(401);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({}, { status: 500 })),
    );
    expect((await forwardPaymentWebhook(post(signed), 'misticpay', GATEWAY_IP)).status).toBe(502);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    expect((await forwardPaymentWebhook(post(signed), 'misticpay', GATEWAY_IP)).status).toBe(502);
  });
});
