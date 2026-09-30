import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./server-env', () => ({ apiBaseUrl: () => 'http://api.internal:4000' }));

const { forwardResultsWebhook } = await import('./results-webhook');

const TOKEN = 'a'.repeat(32);
const post = (body: string, headers: Record<string, string> = {}) =>
  new Request('https://admin.exemplo.com/integracoes/resultados', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });

afterEach(() => vi.unstubAllGlobals());

describe('forwardResultsWebhook', () => {
  it('repassa corpo, cabeçalhos do token e IP à API e devolve a resposta dela', async () => {
    const fetchMock = vi.fn(async () => Response.json({ codigo: 201, mensagem: 'ok' }, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const body = JSON.stringify({ res_data: '2026-09-30' });
    const res = await forwardResultsWebhook(
      post(body, { 'X-Auth-Token': TOKEN, Token: TOKEN, Authorization: `Bearer ${TOKEN}`, Cookie: 'x=1' }),
      '203.0.113.5',
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ codigo: 201, mensagem: 'ok' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe('http://api.internal:4000/v1/integrations/results');
    expect(init.redirect).toBe('error');
    expect(new TextDecoder().decode(init.body as Uint8Array)).toBe(body);
    const headers = init.headers as Record<string, string>;
    expect(headers).toMatchObject({
      'x-auth-token': TOKEN,
      token: TOKEN,
      authorization: `Bearer ${TOKEN}`,
      'X-Client-IP': '203.0.113.5',
    });
    // Nada além do necessário chega à API (ex.: cookies).
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain('cookie');
  });

  it('corpo acima de 16 KB = 413 sem chamar a API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await forwardResultsWebhook(post('x'.repeat(16 * 1024 + 1)), null);
    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('API fora do ar = 502 (o provedor reenvia)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('fetch failed'))),
    );
    const res = await forwardResultsWebhook(post('{}', { 'X-Auth-Token': TOKEN }), null);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ codigo: 502 });
  });
});
