import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import {
  type DrawOverdueResponse,
  type DrawSchedule,
  type LoginResponse,
  OVERDUE_DAYS_BACK,
  drawDateOf,
  overdueGroups,
} from '@sysjb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { OverdueApiError, fetchOverdue } from '../src/overdue/overdue-client.js';
import { loadOverdueConfig } from '../src/overdue/overdue.config.js';
import { normalizeOverdue } from '../src/overdue/overdue-normalizer.js';
import {
  api,
  asTenant,
  createUser,
  KEYS,
  migratorPool,
  resetUsers,
  runtimePool,
  startApp,
  SYNTHETIC_PASSWORD,
  tenantId,
} from './helpers.js';

const NOW = new Date().toISOString();
const day = (offset: number) => drawDateOf(NOW, offset);
const TODAY = day(0);

/** Milhar com a cabeça no grupo (dezena = grupo × 4; o grupo 25 termina em 00). */
const headOf = (group: number) => `12${String((group * 4) % 100).padStart(2, '0')}`;
const prizesWithHead = (group: number) => [headOf(group), '1111', '2222', '3333', '4444'];

// ---------------------------------------------------------------------------
// Regra (sem banco)
// ---------------------------------------------------------------------------

describe('overdueGroups', () => {
  it('conta só a cabeça, o dia mais recente de cada grupo, em qualquer ordem', () => {
    const groups = overdueGroups(
      [
        { date: '2026-09-20', prizes: prizesWithHead(13) },
        { date: '2026-09-28', prizes: prizesWithHead(13) },
        { date: '2026-09-25', prizes: prizesWithHead(10) },
        // 2º prêmio em diante não conta (1111 = grupo 3, 2222 = 6...).
        { date: '2026-09-30', prizes: ['0000', '1111', '2222', '3333', '4444'] },
      ],
      '2026-09-30',
    );
    expect(groups).toHaveLength(25);
    const byGroup = new Map(groups.map((g) => [g.group, g]));
    expect(byGroup.get(13)).toEqual({ group: 13, lastDate: '2026-09-28', days: 2 });
    expect(byGroup.get(10)).toEqual({ group: 10, lastDate: '2026-09-25', days: 5 });
    expect(byGroup.get(25)).toEqual({ group: 25, lastDate: '2026-09-30', days: 0 });
    expect(byGroup.get(3)).toEqual({ group: 3, lastDate: null, days: null });
  });

  it('ordem: sem registro primeiro (por grupo), depois do mais atrasado ao mais recente', () => {
    const groups = overdueGroups(
      [
        { date: '2026-09-29', prizes: prizesWithHead(1) },
        { date: '2026-09-10', prizes: prizesWithHead(2) },
        { date: '2026-09-29', prizes: prizesWithHead(3) },
      ],
      '2026-09-30',
    );
    const order = groups.map((g) => g.group);
    expect(order.slice(0, 22)).toEqual([...Array.from({ length: 22 }, (_, i) => i + 4)]);
    expect(order.slice(22)).toEqual([2, 1, 3]);
  });

  it('5 dígitos (Federal) usa os dois últimos; ignora resultado futuro ou sem prêmio', () => {
    const groups = overdueGroups(
      [
        { date: '2026-09-30', prizes: ['54321'] },
        { date: '2026-10-01', prizes: prizesWithHead(7) },
        { date: '2026-09-29', prizes: [] },
      ],
      '2026-09-30',
    );
    // 21 -> grupo 6 (Cabra).
    expect(groups.find((g) => g.group === 6)).toMatchObject({ days: 0 });
    expect(groups.find((g) => g.group === 7)).toMatchObject({ lastDate: null });
  });

  it('atravessa a mudança de mês e de ano', () => {
    const [first] = overdueGroups([{ date: '2025-12-31', prizes: prizesWithHead(1) }], '2026-03-01').filter(
      (g) => g.group === 1,
    );
    expect(first!.days).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// HTTP + banco
// ---------------------------------------------------------------------------

/** Provedor falso da API de atrasados (HTTP local): cada teste define a resposta; guarda as requisições. */
const provider = {
  requests: [] as Array<{ url: URL; authorization: string | undefined }>,
  respond: (_url: URL): { status: number; body: unknown; delayMs?: number } => ({ status: 500, body: {} }),
};
const providerServer: Server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  provider.requests.push({ url, authorization: req.headers.authorization });
  const { status, body, delayMs = 0 } = provider.respond(url);
  setTimeout(() => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  }, delayMs);
});
const PROVIDER_TOKEN = 'token-atrasados-teste';

let app: INestApplication;
/** Mesma API com a integração de atrasados ligada, apontando para o provedor falso. */
let providerApp: INestApplication;

beforeAll(async () => {
  await new Promise<void>((resolve) => providerServer.listen(0, '127.0.0.1', resolve));
  const { port } = providerServer.address() as AddressInfo;
  app = await startApp();
  providerApp = await startApp({
    overdue: { url: new URL(`http://127.0.0.1:${port}/atrasados/v1/`), token: PROVIDER_TOKEN, cacheMinutes: 30 },
  });
});
afterAll(async () => {
  await Promise.all([app.close(), providerApp.close()]);
  await new Promise((resolve) => providerServer.close(resolve));
  await Promise.all([migratorPool.end(), runtimePool.end()]);
});
beforeEach(async () => {
  await resetUsers();
  provider.requests = [];
});

async function playerHttp(tenant: 'aurora' | 'boreal' = 'aurora', target: INestApplication = app) {
  const person = await createUser(target, tenant);
  const login = await api(target, tenant).post('/v1/auth/login', {
    document: person.document,
    password: SYNTHETIC_PASSWORD,
  });
  return api(target, tenant, KEYS[tenant], { 'X-Session-Token': (login.body as LoginResponse).token });
}

async function drawId(tenant: 'aurora' | 'boreal', name: string) {
  const id = await tenantId(tenant);
  const { rows } = await asTenant(migratorPool, id, (c) =>
    c.query<{ id: string }>('SELECT id FROM draws WHERE tenant_id = $1 AND name = $2', [id, name]),
  );
  return rows[0]!.id;
}

async function insertResult(date: string, lottery: string, extraction: number, prizes: string[]) {
  await migratorPool.query(
    `INSERT INTO lottery_results (draw_date, lottery, extraction, prizes, source) VALUES ($1, $2, $3, $4, 'CONSULTA')`,
    [date, lottery, extraction, prizes],
  );
}

describe('GET /v1/draws/:id/overdue', () => {
  it('exige sessão', async () => {
    const id = await drawId('aurora', 'LT PT RIO 09HS');
    expect((await api(app, 'aurora').get(`/v1/draws/${id}/overdue`)).status).toBe(401);
  });

  it('usa o resultado ligado ao sorteio, só a cabeça e só o período', async () => {
    // LT PT RIO 09HS = rj 09h.
    await insertResult(day(-110), 'rj', 9, prizesWithHead(13));
    await insertResult(day(-3), 'rj', 9, prizesWithHead(10));
    await insertResult(day(-1), 'rj', 9, prizesWithHead(20));
    await insertResult(day(0), 'rj', 9, prizesWithHead(5));
    // Outra extração e outra loteria não contam.
    await insertResult(day(0), 'rj', 11, prizesWithHead(13));
    await insertResult(day(0), 'sp', 9, prizesWithHead(13));
    // Fora do período não conta.
    await insertResult(day(-(OVERDUE_DAYS_BACK + 1)), 'rj', 9, prizesWithHead(1));

    const http = await playerHttp();
    const id = ((await http.get('/v1/draws')).body as DrawSchedule).draws.find((d) => d.name === 'LT PT RIO 09HS')!.id;
    const res = await http.get(`/v1/draws/${id}/overdue`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.body as DrawOverdueResponse;
    expect(body).toMatchObject({ drawId: id, drawName: 'LT PT RIO 09HS', date: TODAY, source: 'history' });
    expect(body.groups).toHaveLength(25);
    expect(body.groups.slice(-4)).toEqual([
      { group: 13, lastDate: day(-110), days: 110 },
      { group: 10, lastDate: day(-3), days: 3 },
      { group: 20, lastDate: day(-1), days: 1 },
      { group: 5, lastDate: TODAY, days: 0 },
    ]);
    expect(body.groups.find((g) => g.group === 1)).toEqual({ group: 1, lastDate: null, days: null });
  });

  it('sem resultados: os 25 grupos sem registro', async () => {
    const http = await playerHttp();
    const res = await http.get(`/v1/draws/${await drawId('aurora', 'LT PT RIO 09HS')}/overdue`);
    expect(res.status).toBe(200);
    expect((res.body as DrawOverdueResponse).groups.every((g) => g.days === null)).toBe(true);
  });

  it('404 igual para sorteio de outra banca, inexistente, inativo ou sem resultado ligado; id inválido = 400', async () => {
    const http = await playerHttp();
    const other = await drawId('boreal', 'LT PT RIO 09HS');
    expect((await http.get(`/v1/draws/${other}/overdue`)).status).toBe(404);
    expect((await http.get('/v1/draws/00000000-0000-4000-8000-000000000000/overdue')).status).toBe(404);

    // Sem correspondência no provedor no cadastro padrão.
    const unlinked = await http.get(`/v1/draws/${await drawId('aurora', 'LT CAPITAL 10HS')}/overdue`);
    expect(unlinked.status).toBe(404);

    const rio = await drawId('aurora', 'LT PT RIO 09HS');
    const auroraId = await tenantId('aurora');
    await asTenant(migratorPool, auroraId, (c) => c.query('UPDATE draws SET active = false WHERE id = $1', [rio]));
    const inactive = await http.get(`/v1/draws/${rio}/overdue`);
    expect(inactive.status).toBe(404);
    expect(inactive.body).toEqual(unlinked.body);

    expect((await http.get('/v1/draws/nao-e-uuid/overdue')).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// API de atrasados do provedor
// ---------------------------------------------------------------------------

const RIO_09 = { lottery: 'rj', extraction: 9 };

/** Último dia de cada grupo no exemplo: grupo g saiu há g dias (o 25 é o mais atrasado); o 24 nunca saiu. */
const SAMPLE_DATES = Array.from({ length: 25 }, (_, i) => (i === 23 ? null : day(-(i + 1))));

/** Resposta no formato real do provedor (grupo ora número, ora texto; posição = colocação no ranking). */
function providerBody(
  lastDates: Array<string | null> = SAMPLE_DATES,
  informacoes: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    usuario: { terminal: 2200, site_app: 'Teste de Sistema', cliente_id: 'XXXX-XXXX-XXXX-XXXX' },
    consulta: { numero: 1, data: '01/10/2026 09:41:52', ip: '127.0.0.1' },
    informacoes: {
      tipo_api: 'Atrasados por Loteria',
      loteria: 'PT Rio de Janeiro',
      sigla: 'rj',
      extracao: '09',
      extracao_nome: 'PPT-RJ 09:30',
      tipo_busca: 'g',
      tipo_nome: 'Grupo',
      posicao: '1',
      posicoes_premio_consideradas: '1º prêmio',
      total_registros: 25,
      limite_retorno: 25,
      data_referencia: TODAY,
      ...informacoes,
    },
    dados: {
      atrasados: lastDates.map((date, i) => ({
        grupo: i < 9 ? String(i + 1).padStart(2, '0') : i + 1,
        animal: 'Bicho',
        emoji: '',
        quadra: '',
        posicao: i + 1,
        dias: date ? i + 1 : null,
        saida: '',
        saida_original: date,
        nunca_saiu: date === null,
      })),
    },
  };
}

const atrasados = (body: Record<string, unknown>) =>
  (body.dados as { atrasados: Array<Record<string, unknown>> }).atrasados;

describe('normalização dos atrasados', () => {
  it('aceita o formato real: grupo como número ou texto, "nunca saiu" sem data', () => {
    const out = normalizeOverdue(providerBody(), RIO_09);
    expect(out?.referenceDate).toBe(TODAY);
    expect(out?.lastDates).toEqual(SAMPLE_DATES);
    const blank = providerBody();
    atrasados(blank)[23]!.saida_original = '';
    expect(normalizeOverdue(blank, RIO_09)?.lastDates[23]).toBeNull();
  });

  it.each([
    ['outra loteria', providerBody(undefined, { sigla: 'sp' })],
    ['outra extração', providerBody(undefined, { extracao: '11' })],
    ['outra posição', providerBody(undefined, { posicao: '1-5' })],
    ['outro tipo de busca', providerBody(undefined, { tipo_busca: 'dz' })],
    ['data de referência inexistente', providerBody(undefined, { data_referencia: '2026-02-30' })],
    ['data de referência fora do calendário', providerBody(undefined, { data_referencia: '2026-13-45' })],
    ['menos de 25 grupos', providerBody(SAMPLE_DATES.slice(1))],
    ['saída depois da referência', providerBody([day(1), ...SAMPLE_DATES.slice(1)])],
    ['sem dados', { informacoes: providerBody().informacoes }],
    ['corpo que não é objeto', 'texto'],
  ])('recusa %s', (_label, body) => {
    expect(normalizeOverdue(body, RIO_09)).toBeNull();
  });

  it('recusa grupo repetido, grupo fora de 1–25 e saída sem data', () => {
    const repeated = providerBody();
    atrasados(repeated)[1]!.grupo = '01';
    expect(normalizeOverdue(repeated, RIO_09)).toBeNull();
    const outOfRange = providerBody();
    atrasados(outOfRange)[0]!.grupo = 26;
    expect(normalizeOverdue(outOfRange, RIO_09)).toBeNull();
    const noDate = providerBody();
    atrasados(noDate)[0]!.saida_original = '';
    expect(normalizeOverdue(noDate, RIO_09)).toBeNull();
  });
});

describe('configuração dos atrasados', () => {
  it('sem token fica desligada; só HTTPS (HTTP só local); sem credencial nem parâmetros na URL', () => {
    expect(loadOverdueConfig({})).toBeNull();
    const config = loadOverdueConfig({ OVERDUE_API_TOKEN: 'xKtc-gyHR-U3Uo-52wq' });
    expect(config?.url.href).toBe('https://api.lotoserv.com/atrasados/v1/');
    expect(config?.cacheMinutes).toBe(30);
    const token = { OVERDUE_API_TOKEN: 't'.repeat(20) };
    expect(() => loadOverdueConfig({ ...token, OVERDUE_API_URL: 'http://api.exemplo.com/' })).toThrow(/HTTPS/);
    expect(loadOverdueConfig({ ...token, OVERDUE_API_URL: 'http://127.0.0.1:9/' })).not.toBeNull();
    expect(() => loadOverdueConfig({ ...token, OVERDUE_API_URL: 'https://u:p@api.exemplo.com/' })).toThrow(
      /credenciais/,
    );
    expect(() => loadOverdueConfig({ ...token, OVERDUE_API_URL: 'https://api.exemplo.com/?loteria=rj' })).toThrow(
      /parâmetros/,
    );
    expect(() => loadOverdueConfig({ ...token, OVERDUE_CACHE_MINUTES: '0' })).toThrow(/OVERDUE_CACHE_MINUTES/);
  });

  it('token inválido: a mensagem não traz o token', () => {
    expect(() => loadOverdueConfig({ OVERDUE_API_TOKEN: 'segredo com espaco' })).toThrow(
      expect.not.stringContaining('segredo'),
    );
  });
});

describe('cliente dos atrasados', () => {
  const config = {
    url: new URL('https://atrasados.test/atrasados/v1/'),
    token: 'token-de-teste-123',
    cacheMinutes: 30,
  };
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const noSleep = async () => {};

  it('manda Bearer, grupo na cabeça da extração e redirect: "error"', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => json(200, { ok: 1 }));
    await expect(fetchOverdue(config, RIO_09, { fetchImpl, sleep: noSleep })).resolves.toEqual({ ok: 1 });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe('https://atrasados.test/atrasados/v1/?loteria=rj&tipo_busca=grupo&posicao=1&extracao=09');
    expect(init?.redirect).toBe('error');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer token-de-teste-123');
  });

  it('403 = loteria fora do plano; 401 não repete; 5xx e rede repetem uma vez', async () => {
    const offPlan = vi.fn(async () => json(403, { success: false, message: 'Loteria inválida ou não disponível.' }));
    await expect(fetchOverdue(config, RIO_09, { fetchImpl: offPlan, sleep: noSleep })).rejects.toMatchObject({
      kind: 'unavailable',
      status: 403,
    });

    const denied = vi.fn(async () => json(401, { status: 'error', code: '401', message: 'Token invalido' }));
    await expect(fetchOverdue(config, RIO_09, { fetchImpl: denied, sleep: noSleep })).rejects.toMatchObject({
      kind: 'fatal',
    });
    expect(denied).toHaveBeenCalledTimes(1);

    const down = vi.fn(async () => json(502, {}));
    await expect(fetchOverdue(config, RIO_09, { fetchImpl: down, sleep: noSleep })).rejects.toBeInstanceOf(
      OverdueApiError,
    );
    expect(down).toHaveBeenCalledTimes(2);

    let calls = 0;
    const flaky = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('fetch failed');
      return json(200, { ok: 2 });
    });
    await expect(fetchOverdue(config, RIO_09, { fetchImpl: flaky, sleep: noSleep })).resolves.toEqual({ ok: 2 });
  });

  it('recusa resposta grande demais sem expor o token', async () => {
    const big = vi.fn(async () => new Response('x'.repeat(128_001), { status: 200 }));
    const error = await fetchOverdue(config, RIO_09, { fetchImpl: big, sleep: noSleep }).catch((e: Error) => e);
    expect(error).toBeInstanceOf(OverdueApiError);
    expect((error as Error).message).not.toContain(config.token);
  });
});

describe('GET /v1/draws/:id/overdue com a API de atrasados', () => {
  const overdue = async (http: Awaited<ReturnType<typeof playerHttp>>, name = 'LT PT RIO 09HS') =>
    http.get(`/v1/draws/${await drawId('aurora', name)}/overdue`);

  const expireCache = () =>
    migratorPool.query("UPDATE overdue_snapshots SET fetched_at = now() - interval '31 minutes'");

  it('busca no provedor e guarda; o próximo pedido lê do cache, sem nova busca', async () => {
    provider.respond = () => ({ status: 200, body: providerBody() });
    const http = await playerHttp('aurora', providerApp);

    const first = await overdue(http);
    expect(first.status).toBe(200);
    const body = first.body as DrawOverdueResponse;
    expect(body.source).toBe('provider');
    expect(body.groups.map((g) => g.group)).toEqual([24, 25, ...Array.from({ length: 23 }, (_, i) => 23 - i)]);
    expect(body.groups[1]).toEqual({ group: 25, lastDate: day(-25), days: 25 });
    expect(body.groups[0]).toEqual({ group: 24, lastDate: null, days: null });

    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]!.authorization).toBe(`Bearer ${PROVIDER_TOKEN}`);
    expect(Object.fromEntries(provider.requests[0]!.url.searchParams)).toEqual({
      loteria: 'rj',
      tipo_busca: 'grupo',
      posicao: '1',
      extracao: '09',
    });
    // Nada do provedor além das datas vai para o jogador.
    expect(JSON.stringify(first.body)).not.toMatch(/cliente_id|XXXX|Teste de Sistema/);

    // Outro jogador, outra banca com o mesmo resultado ligado: mesmo cache.
    expect((await overdue(http)).body).toEqual(body);
    const boreal = await playerHttp('boreal', providerApp);
    const fromBoreal = await boreal.get(`/v1/draws/${await drawId('boreal', 'LT PT RIO 09HS')}/overdue`);
    expect((fromBoreal.body as DrawOverdueResponse).groups).toEqual(body.groups);
    expect(provider.requests).toHaveLength(1);
  });

  it('resultado novo do sorteio ou prazo vencido = nova busca', async () => {
    provider.respond = () => ({ status: 200, body: providerBody() });
    const http = await playerHttp('aurora', providerApp);
    await overdue(http);
    expect(provider.requests).toHaveLength(1);

    // Resultado de outra extração não mexe no cache desta.
    await insertResult(TODAY, 'rj', 11, prizesWithHead(1));
    await overdue(http);
    expect(provider.requests).toHaveLength(1);

    await insertResult(TODAY, 'rj', 9, prizesWithHead(1));
    const fresh = providerBody([TODAY, ...SAMPLE_DATES.slice(1)]);
    provider.respond = () => ({ status: 200, body: fresh });
    const updated = await overdue(http);
    expect(provider.requests).toHaveLength(2);
    expect((updated.body as DrawOverdueResponse).groups.at(-1)).toEqual({ group: 1, lastDate: TODAY, days: 0 });

    await overdue(http);
    expect(provider.requests).toHaveLength(2);
    await expireCache();
    await overdue(http);
    expect(provider.requests).toHaveLength(3);
  });

  it('pedidos simultâneos fazem uma busca só', async () => {
    provider.respond = () => ({ status: 200, body: providerBody(), delayMs: 150 });
    const http = await playerHttp('aurora', providerApp);
    const id = await drawId('aurora', 'LT PT RIO 09HS');
    const responses = await Promise.all(Array.from({ length: 6 }, () => http.get(`/v1/draws/${id}/overdue`)));
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200]);
    expect(provider.requests).toHaveLength(1);
  });

  it('provedor fora do ar: usa o cache vencido; sem cache = 503 sem detalhes', async () => {
    provider.respond = () => ({ status: 200, body: providerBody() });
    const http = await playerHttp('aurora', providerApp);
    const cached = (await overdue(http)).body as DrawOverdueResponse;

    await expireCache();
    provider.respond = () => ({ status: 503, body: { message: 'manutenção' } });
    const stale = await overdue(http);
    expect(stale.status).toBe(200);
    expect((stale.body as DrawOverdueResponse).groups).toEqual(cached.groups);

    // Rio 11h nunca foi buscado.
    const none = await overdue(http, 'LT PT RIO 11HS');
    expect(none.status).toBe(503);
    expect(none.body).toEqual({
      statusCode: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Atrasados indisponíveis no momento. Tente novamente.',
    });
  });

  it('resposta inválida não entra no cache', async () => {
    provider.respond = () => ({ status: 200, body: providerBody(undefined, { extracao: '11' }) });
    const http = await playerHttp('aurora', providerApp);
    expect((await overdue(http)).status).toBe(503);
    const { rows } = await migratorPool.query('SELECT 1 FROM overdue_snapshots');
    expect(rows).toEqual([]);
  });

  it('loteria fora do plano (403): usa os resultados guardados e não pergunta de novo até o prazo', async () => {
    provider.respond = () => ({
      status: 403,
      body: { success: false, message: 'Loteria inválida ou não disponível.' },
    });
    await insertResult(day(-2), 'rj', 16, prizesWithHead(7));
    const http = await playerHttp('aurora', providerApp);

    const res = await overdue(http, 'LT PT RIO 16HS');
    expect(res.status).toBe(200);
    expect((res.body as DrawOverdueResponse).source).toBe('history');
    expect((res.body as DrawOverdueResponse).groups.at(-1)).toEqual({ group: 7, lastDate: day(-2), days: 2 });

    await overdue(http, 'LT PT RIO 16HS');
    expect(provider.requests).toHaveLength(1);
  });
});
