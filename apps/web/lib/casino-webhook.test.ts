import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
let allowedIps = '';
vi.mock('./server-env', () => ({
  apiBaseUrl: () => 'http://api.internal:4000',
  casinoWebhookIpsRaw: () => allowedIps,
}));

const { forwardCasinoWebhook, parseSourceAllowlist, sourceAllowed } = await import('./casino-webhook');

const PROVIDER_IP = '203.0.113.10';

const TOKEN = 'b'.repeat(32);
const post = (body: string, query = `?token=${TOKEN}`, headers: Record<string, string> = {}) =>
  new Request(`https://admin.exemplo.com/integracoes/cassino${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  allowedIps = '';
});

describe('forwardCasinoWebhook', () => {
  it('leva o token do endereço para o cabeçalho, sem IP nem cookies, e devolve a resposta da API', async () => {
    const fetchMock = vi.fn(async () => Response.json({ msg: '', balance: 12.5 }));
    vi.stubGlobal('fetch', fetchMock);
    const body = JSON.stringify({ type: 'BALANCE', user_code: 'x' });
    const res = await forwardCasinoWebhook(
      post(body, `?token=${TOKEN}`, { Cookie: 'x=1', 'X-Forwarded-For': '1.2.3.4' }),
      PROVIDER_IP,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ msg: '', balance: 12.5 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe('http://api.internal:4000/v1/integrations/casino');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Casino-Token': TOKEN,
    });
    expect(new TextDecoder().decode(init.body as Uint8Array)).toBe(body);
    expect(init.redirect).toBe('error');
  });

  it('sem token ou token malformado nem chega à API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await forwardCasinoWebhook(post('{}', ''), PROVIDER_IP)).status).toBe(401);
    expect((await forwardCasinoWebhook(post('{}', '?token=com%20espaco'), PROVIDER_IP)).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('corpo grande demais = 413; API fora do ar = 500 no formato do provedor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('down'))),
    );
    expect((await forwardCasinoWebhook(post('x'.repeat(17 * 1024)), PROVIDER_IP)).status).toBe(413);
    const down = await forwardCasinoWebhook(post('{}'), PROVIDER_IP);
    expect(down.status).toBe(500);
    expect(await down.json()).toEqual({ msg: 'ERROR_INTERNAL', balance: 0 });
  });

  it('com CASINO_WEBHOOK_IPS, só os IPs/faixas da lista passam; o resto nem chega à API', async () => {
    const fetchMock = vi.fn(async () => Response.json({ msg: '', balance: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    allowedIps = '203.0.113.10, 198.51.100.0/24, 2001:db8::/32';

    expect((await forwardCasinoWebhook(post('{}'), '203.0.113.10')).status).toBe(200);
    expect((await forwardCasinoWebhook(post('{}'), '198.51.100.77')).status).toBe(200);
    expect((await forwardCasinoWebhook(post('{}'), '2001:db8::5')).status).toBe(200);
    expect((await forwardCasinoWebhook(post('{}'), '::ffff:203.0.113.10')).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const outside = await forwardCasinoWebhook(post('{}'), '203.0.113.11');
    expect(outside.status).toBe(403);
    expect(await outside.json()).toEqual({ msg: 'FORBIDDEN', balance: 0 });
    expect((await forwardCasinoWebhook(post('{}'), null)).status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    // O log tem só o IP (nunca o token).
    expect(warn.mock.calls.flat().join(' ')).toContain('203.0.113.11');
    expect(warn.mock.calls.flat().join(' ')).not.toContain(TOKEN);
  });

  it('lista com entrada inválida recusa tudo; sem lista aceita e registra o IP', async () => {
    const fetchMock = vi.fn(async () => Response.json({ msg: '', balance: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    allowedIps = '203.0.113.10, 10.0.0.0/33';
    expect((await forwardCasinoWebhook(post('{}'), '203.0.113.10')).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();

    allowedIps = '';
    expect((await forwardCasinoWebhook(post('{}'), '192.0.2.44')).status).toBe(200);
    expect(warn.mock.calls.flat().join(' ')).toContain('192.0.2.44');
  });

  it('formato da lista', () => {
    expect(parseSourceAllowlist('')).toBeNull();
    expect(parseSourceAllowlist(' , ')).toBeNull();
    for (const bad of ['abc', '1.2.3.4/', '1.2.3.4/x', '1.2.3.4/8/1', '2001:db8::/129', '300.1.1.1']) {
      expect(parseSourceAllowlist(bad), bad).toBe('invalid');
    }
    const list = parseSourceAllowlist('10.0.0.0/8');
    if (!list || list === 'invalid') throw new Error('lista');
    expect(sourceAllowed(list, '10.200.1.1')).toBe(true);
    expect(sourceAllowed(list, '11.0.0.1')).toBe(false);
    expect(sourceAllowed(list, 'não-ip')).toBe(false);
  });
});
