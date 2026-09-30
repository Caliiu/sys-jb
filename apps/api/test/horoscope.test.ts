import type { INestApplication } from '@nestjs/common';
import { type HoroscopeTodayResponse, type LoginResponse, drawDateOf } from '@sysjb/contracts';
import { createPrismaClient } from '@sysjb/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchHoroscope } from '../src/horoscope/horoscope-client.js';
import { normalizeHoroscope, signFromName } from '../src/horoscope/horoscope-normalizer.js';
import {
  HoroscopeScheduler,
  type HoroscopeSyncOutcome,
  type SchedulerClock,
  nextDailyRun,
  syncHoroscope,
} from '../src/horoscope/horoscope-sync.js';
import { type HoroscopeConfig, loadHoroscopeConfig } from '../src/horoscope/horoscope.config.js';
import {
  api,
  createUser,
  KEYS,
  migratorPool,
  resetUsers,
  runtimePool,
  startApp,
  SYNTHETIC_PASSWORD,
} from './helpers.js';
import { TEST_APP_URL } from './env.js';

const NOW = new Date().toISOString();
const TODAY = drawDateOf(NOW, 0);

/** Item no formato REAL da API (signo sem acento, dezenas com hífen, cor composta). */
const realItem = (signo: string, extra: Record<string, unknown> = {}) => ({
  signo,
  previsao: 'Trabalho: a Lua em Gêmeos deixa seu poder de comunicação tinindo.  Sorte e dinheiro: “não” como resposta.',
  dezenas: '78-04-46-45-68',
  cores: 'Verde-pistache-claro',
  ...extra,
});
const SIGNS = [
  'aries',
  'touro',
  'gemeos',
  'cancer',
  'leao',
  'virgem',
  'libra',
  'escorpiao',
  'sagitario',
  'capricornio',
  'aquario',
  'peixes',
];
const body = (date = TODAY, dados: unknown[] = SIGNS.map((s) => realItem(s))) => ({
  usuario: { terminal: '6715', site_app: 'Meu Site/App' },
  consulta: { numero: '128', data: '30/09/2026 16:31:08', ip: '189.00.00.00' },
  informacoes: { tipo_api: 'Horóscopo Diario', data_referencia: date, total_registros: dados.length },
  dados,
});

const CONFIG: HoroscopeConfig = {
  url: new URL('https://horoscopo.test/v1/'),
  token: 'token-de-teste-horoscopo',
  syncMinutes: 1,
  retryMinutes: 15,
};
const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
const noSleep = async () => {};

// ---------------------------------------------------------------------------
// Leitura da resposta (sem banco)
// ---------------------------------------------------------------------------

describe('normalização da resposta', () => {
  it('formato real da API: 12 signos, dezenas com hífen, cor composta, texto limpo', () => {
    const out = normalizeHoroscope(body(), NOW);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.batch.date).toBe(TODAY);
    expect(out.batch.readings).toHaveLength(12);
    expect(out.batch.readings[0]).toEqual({
      sign: 'aries',
      text: 'Trabalho: a Lua em Gêmeos deixa seu poder de comunicação tinindo. Sorte e dinheiro: “não” como resposta.',
      tens: ['78', '04', '46', '45', '68'],
      colors: ['Verde-pistache-claro'],
    });
  });

  it('formato da documentação: signo com acento, dezenas e cores com vírgula, data DD/MM/YYYY', () => {
    const [y, m, d] = TODAY.split('-');
    const out = normalizeHoroscope(
      body(`${d}/${m}/${y}`, [
        { signo: 'Escorpião', previsao: 'Hoje é um bom dia.', dezenas: '04, 18, 29', cores: 'Vermelho, Branco' },
      ]),
      NOW,
    );
    expect(out.ok && out.batch.readings).toEqual([
      { sign: 'escorpiao', text: 'Hoje é um bom dia.', tens: ['04', '18', '29'], colors: ['Vermelho', 'Branco'] },
    ]);
  });

  it('item ruim é descartado sozinho (sem derrubar os outros), com o motivo', () => {
    const out = normalizeHoroscope(
      body(TODAY, [
        realItem('aries'),
        realItem('ofiuco'),
        realItem('aries'),
        realItem('touro', { dezenas: '12-ab-30' }),
        realItem('gemeos', { previsao: '   ' }),
        realItem('cancer', { previsao: 'x'.repeat(2001) }),
        { signo: 'leao' },
        realItem('virgem', { cores: null, dezenas: ['7', 15] }),
      ]),
      NOW,
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.batch.readings.map((r) => r.sign)).toEqual(['aries', 'virgem']);
    expect(out.batch.readings[1]).toMatchObject({ tens: ['07', '15'], colors: [] });
    expect(out.batch.rejected).toEqual([
      { index: 1, reason: 'signo desconhecido' },
      { index: 2, reason: 'signo repetido' },
      { index: 3, reason: 'dezenas inválidas' },
      { index: 4, reason: 'previsão vazia ou longa demais' },
      { index: 5, reason: 'previsão vazia ou longa demais' },
      { index: 6, reason: 'formato inesperado' },
    ]);
  });

  it('caracteres de controle viram espaço (o texto vai para a tela como texto)', () => {
    const out = normalizeHoroscope(body(TODAY, [realItem('aries', { previsao: 'Linha 1\u0000\u0007\nLinha 2' })]), NOW);
    expect(out.ok && out.batch.readings[0]!.text).toBe('Linha 1 Linha 2');
  });

  it('recusa: formato estranho, data futura ou inválida, nenhuma previsão válida', () => {
    expect(normalizeHoroscope({ foo: 1 }, NOW)).toEqual({ ok: false, reason: 'resposta em formato inesperado' });
    expect(normalizeHoroscope(body(drawDateOf(NOW, 1)), NOW)).toEqual({
      ok: false,
      reason: 'data de referência inválida',
    });
    expect(normalizeHoroscope(body('ontem'), NOW)).toEqual({ ok: false, reason: 'data de referência inválida' });
    expect(normalizeHoroscope(body(TODAY, [realItem('ofiuco')]), NOW)).toEqual({
      ok: false,
      reason: 'nenhuma previsão válida',
    });
  });

  it('nome do signo → id', () => {
    expect(['Áries', 'aries', 'GÊMEOS', 'Câncer', 'Sagitário', 'Capricórnio'].map(signFromName)).toEqual([
      'aries',
      'aries',
      'gemeos',
      'cancer',
      'sagitario',
      'capricornio',
    ]);
    expect(signFromName('Serpentário')).toBeNull();
  });
});

describe('configuração', () => {
  const env = { HOROSCOPE_API_TOKEN: 'UrIQ-Ipdr-cZjZ-fUPm' };
  it('sem token = desligada; padrões 00:01 e 15 min; só HTTPS; valida horário e espera', () => {
    expect(loadHoroscopeConfig({})).toBeNull();
    expect(loadHoroscopeConfig(env)).toMatchObject({ syncMinutes: 1, retryMinutes: 15 });
    expect(loadHoroscopeConfig(env)?.url.href).toBe('https://api.lotoserv.com/horoscopo/v1/');
    expect(loadHoroscopeConfig({ ...env, HOROSCOPE_SYNC_AT: '06:30' })?.syncMinutes).toBe(390);
    expect(() => loadHoroscopeConfig({ ...env, HOROSCOPE_SYNC_AT: '24:00' })).toThrow(/SYNC_AT/);
    expect(() => loadHoroscopeConfig({ ...env, HOROSCOPE_RETRY_MINUTES: '0' })).toThrow(/RETRY/);
    expect(() => loadHoroscopeConfig({ ...env, HOROSCOPE_API_URL: 'http://api.exemplo.com/' })).toThrow(/HTTPS/);
    expect(() => loadHoroscopeConfig({ HOROSCOPE_API_TOKEN: 'curto' })).toThrow(expect.not.stringContaining('curto'));
  });
});

// ---------------------------------------------------------------------------
// Cliente (fetch falso)
// ---------------------------------------------------------------------------

describe('cliente da API de horóscopo', () => {
  it('GET com Bearer e redirect: "error"; devolve o corpo', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => json(200, body()));
    await expect(fetchHoroscope(CONFIG, { fetchImpl, sleep: noSleep })).resolves.toMatchObject({
      dados: expect.any(Array),
    });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe('https://horoscopo.test/v1/');
    expect(init?.method).toBe('GET');
    expect(init?.redirect).toBe('error');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer token-de-teste-horoscopo');
  });

  it('"Ainda não há previsões" = not_ready; token/limite = fatal; nenhum dos dois repete', async () => {
    const notReady = vi.fn(async () =>
      json(401, { status: 'error', code: '401', message: 'Ainda não há previsões registradas para 30/09/2026' }),
    );
    await expect(fetchHoroscope(CONFIG, { fetchImpl: notReady, sleep: noSleep })).rejects.toMatchObject({
      kind: 'not_ready',
      status: 401,
    });
    expect(notReady).toHaveBeenCalledTimes(1);

    const limit = vi.fn(async () =>
      json(401, { message: 'Seu módulo atingiu o limite de 10000 requisições diárias.' }),
    );
    await expect(fetchHoroscope(CONFIG, { fetchImpl: limit, sleep: noSleep })).rejects.toMatchObject({ kind: 'fatal' });
    expect(limit).toHaveBeenCalledTimes(1);
  });

  it('5xx e rede repetem e desistem como retryable; resposta grande demais é fatal; nunca expõe o token', async () => {
    const down = vi.fn(async () => json(503, {}));
    await expect(fetchHoroscope(CONFIG, { fetchImpl: down, sleep: noSleep })).rejects.toMatchObject({
      kind: 'retryable',
    });
    expect(down).toHaveBeenCalledTimes(3);

    const offline = vi.fn(async () => Promise.reject(new TypeError('fetch failed')));
    await expect(fetchHoroscope(CONFIG, { fetchImpl: offline, sleep: noSleep })).rejects.toMatchObject({
      kind: 'retryable',
    });

    const big = vi.fn(async () => new Response('x'.repeat(256_001), { status: 200 }));
    const error = await fetchHoroscope(CONFIG, { fetchImpl: big, sleep: noSleep }).catch((e: Error) => e);
    expect(error).toMatchObject({ kind: 'fatal' });
    expect((error as Error).message).not.toContain(CONFIG.token);
  });
});

// ---------------------------------------------------------------------------
// Agendador (relógio falso)
// ---------------------------------------------------------------------------

describe('horário da busca diária (Brasília)', () => {
  it('00:01 de Brasília = 03:01 UTC; depois do horário, amanhã', () => {
    expect(new Date(nextDailyRun(Date.parse('2026-09-30T02:59:00Z'), 1)).toISOString()).toBe(
      '2026-09-30T03:01:00.000Z',
    );
    expect(new Date(nextDailyRun(Date.parse('2026-09-30T03:01:00Z'), 1)).toISOString()).toBe(
      '2026-10-01T03:01:00.000Z',
    );
    expect(new Date(nextDailyRun(Date.parse('2026-09-30T20:00:00Z'), 1)).toISOString()).toBe(
      '2026-10-01T03:01:00.000Z',
    );
    // 23:30 de Brasília ainda é "hoje" lá (02:30 UTC do dia seguinte).
    expect(new Date(nextDailyRun(Date.parse('2026-10-01T02:30:00Z'), 1)).toISOString()).toBe(
      '2026-10-01T03:01:00.000Z',
    );
  });
});

/** Relógio controlado: timers ficam numa lista e o teste avança o tempo. */
function fakeClock(startIso: string) {
  let now = Date.parse(startIso);
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock: SchedulerClock = {
    now: () => now,
    setTimeout: (fn, ms) => {
      seq += 1;
      timers.set(seq, { at: now + ms, fn });
      return seq;
    },
    clearTimeout: (handle) => void timers.delete(handle as number),
  };
  return {
    clock,
    pending: () => [...timers.values()].map((t) => new Date(t.at).toISOString()).sort(),
    /** Avança até `iso`, disparando os timers vencidos na ordem. */
    async advanceTo(iso: string) {
      const target = Date.parse(iso);
      for (;;) {
        const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > target) break;
        timers.delete(next[0]);
        now = next[1].at;
        next[1].fn();
        await new Promise((r) => setImmediate(r));
      }
      now = target;
    },
  };
}

const stored: HoroscopeSyncOutcome = { status: 'stored', date: TODAY, signs: 12, changed: 12, rejected: [] };

describe('agendador', () => {
  const setup = (outcomes: HoroscopeSyncOutcome[], cached = false, start = '2026-09-30T15:00:00Z') => {
    const time = fakeClock(start);
    const run = vi.fn(async () => outcomes.shift() ?? stored);
    const logs: string[] = [];
    const scheduler = new HoroscopeScheduler(
      run,
      async () => cached,
      { syncMinutes: 1, retryMinutes: 15 },
      (level, message) => logs.push(`${level}: ${message}`),
      time.clock,
    );
    return { time, run, logs, scheduler };
  };

  it('ao iniciar: busca se hoje não está no cache; agenda a próxima às 00:01', async () => {
    const { time, run, scheduler } = setup([stored]);
    await scheduler.start();
    expect(run).toHaveBeenCalledTimes(1);
    expect(time.pending()).toEqual(['2026-10-01T03:01:00.000Z']);

    const cached = setup([], true);
    await cached.scheduler.start();
    expect(cached.run).not.toHaveBeenCalled();
  });

  it('"ainda não publicou": tenta a cada 15 min até conseguir, depois só no dia seguinte', async () => {
    const notReady: HoroscopeSyncOutcome = { status: 'not_ready', message: 'Ainda não há previsões' };
    const { time, run, scheduler, logs } = setup([notReady, notReady, stored], true, '2026-09-30T03:00:00Z');
    await scheduler.start();
    await time.advanceTo('2026-09-30T03:01:00Z');
    expect(run).toHaveBeenCalledTimes(1);
    expect(time.pending()).toEqual(['2026-09-30T03:16:00.000Z', '2026-10-01T03:01:00.000Z']);
    await time.advanceTo('2026-09-30T03:31:00Z');
    expect(run).toHaveBeenCalledTimes(3);
    expect(time.pending()).toEqual(['2026-10-01T03:01:00.000Z']);
    expect(logs.at(-1)).toMatch(/^log: horóscopo de .*12 signos/);
  });

  it('falha definitiva (token, limite) não repete no dia; falha passageira repete', async () => {
    const fatal = setup([{ status: 'failed', message: 'HTTP 401 limite', retry: false }]);
    await fatal.scheduler.start();
    expect(fatal.time.pending()).toEqual(['2026-10-01T03:01:00.000Z']);
    expect(fatal.logs).toEqual([
      'log: busca diária às 00:01 (Brasília); hoje ainda não está no cache: buscando agora',
      'error: horóscopo: HTTP 401 limite',
    ]);

    const passing = setup([{ status: 'failed', message: 'rede', retry: true }]);
    await passing.scheduler.start();
    expect(passing.time.pending()).toEqual(['2026-09-30T15:15:00.000Z', '2026-10-01T03:01:00.000Z']);
  });

  it('nova tentativa nunca passa da próxima busca diária; uma busca por vez; stop cancela tudo', async () => {
    const late = setup([{ status: 'not_ready', message: 'x' }], false, '2026-10-01T02:50:00Z');
    await late.scheduler.start();
    // 23:50 de Brasília: +15 min passaria das 00:01, que já vai buscar.
    expect(late.time.pending()).toEqual(['2026-10-01T03:01:00.000Z']);

    let release: (o: HoroscopeSyncOutcome) => void = () => {};
    const slow = setup([]);
    slow.run.mockImplementationOnce(() => new Promise((r) => (release = r)));
    const first = slow.scheduler.execute();
    await slow.scheduler.execute();
    expect(slow.run).toHaveBeenCalledTimes(1);
    release(stored);
    await first;

    slow.scheduler.stop();
    expect(slow.time.pending()).toEqual([]);
    await slow.scheduler.execute();
    expect(slow.run).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Banco e rota do jogador
// ---------------------------------------------------------------------------

const prisma = createPrismaClient({ connectionString: TEST_APP_URL, max: 2 });
let app: INestApplication;

beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
  await Promise.all([migratorPool.end(), runtimePool.end()]);
});
beforeEach(async () => {
  await resetUsers();
  await migratorPool.query('TRUNCATE horoscope_readings');
});

const provider = (payload: unknown, status = 200) => ({
  client: { fetchImpl: vi.fn(async () => json(status, payload)) as unknown as typeof fetch, sleep: noSleep },
});
const cached = async () =>
  (
    await migratorPool.query(
      'SELECT reference_date::text AS date, sign, tens, colors FROM horoscope_readings ORDER BY sign',
    )
  ).rows;

describe('sincronização com o banco (role de runtime)', () => {
  it('grava os 12 signos; repetir não muda nada; correção do provedor atualiza só o signo corrigido', async () => {
    expect(await syncHoroscope(prisma, CONFIG, provider(body()))).toEqual({
      status: 'stored',
      date: TODAY,
      signs: 12,
      changed: 12,
      rejected: [],
    });
    expect(await cached()).toHaveLength(12);
    expect(await syncHoroscope(prisma, CONFIG, provider(body()))).toMatchObject({ changed: 0 });

    const fixed = SIGNS.map((s) => realItem(s, s === 'leao' ? { dezenas: '01-02-03' } : {}));
    expect(await syncHoroscope(prisma, CONFIG, provider(body(TODAY, fixed)))).toMatchObject({ changed: 1 });
    expect((await cached()).find((r) => r.sign === 'leao')).toMatchObject({ tens: ['01', '02', '03'] });
  });

  it('provedor ainda com a previsão de ontem: grava, mas hoje continua pendente (not_ready)', async () => {
    const yesterday = drawDateOf(NOW, -1);
    expect(await syncHoroscope(prisma, CONFIG, provider(body(yesterday)))).toEqual({
      status: 'not_ready',
      message: `o provedor ainda devolve a previsão de ${yesterday}`,
    });
    expect((await cached())[0]).toMatchObject({ date: yesterday });
  });

  it('não publicado, recusa e resposta estranha não gravam nada', async () => {
    const notYet = { message: 'Ainda não há previsões registradas para hoje' };
    expect(await syncHoroscope(prisma, CONFIG, provider(notYet, 401))).toMatchObject({ status: 'not_ready' });
    expect(await syncHoroscope(prisma, CONFIG, provider({ message: 'Token nao fornecido' }, 401))).toMatchObject({
      status: 'failed',
      retry: false,
    });
    expect(await syncHoroscope(prisma, CONFIG, provider({ lixo: true }))).toMatchObject({
      status: 'failed',
      retry: false,
    });
    expect(await cached()).toEqual([]);
  });

  it('role de runtime não exclui; CHECKs recusam dezenas e signos fora do formato', async () => {
    await syncHoroscope(prisma, CONFIG, provider(body()));
    await expect(runtimePool.query('DELETE FROM horoscope_readings')).rejects.toThrow(/permission denied/);
    await expect(
      runtimePool.query(
        `INSERT INTO horoscope_readings (reference_date, sign, text, tens, colors)
         VALUES (CURRENT_DATE - 10, 'aries', 'x', ARRAY['7'], ARRAY[]::text[])`,
      ),
    ).rejects.toThrow(/horoscope_readings_tens/);
    await expect(
      runtimePool.query(
        `INSERT INTO horoscope_readings (reference_date, sign, text, tens, colors)
         VALUES (CURRENT_DATE - 10, 'ofiuco', 'x', ARRAY['07'], ARRAY[]::text[])`,
      ),
    ).rejects.toThrow(/horoscope_readings_sign/);
  });
});

describe('GET /v1/horoscope (jogador)', () => {
  async function playerHttp() {
    const person = await createUser(app, 'aurora');
    const login = await api(app, 'aurora').post('/v1/auth/login', {
      document: person.document,
      password: SYNTHETIC_PASSWORD,
    });
    return api(app, 'aurora', KEYS.aurora, { 'X-Session-Token': (login.body as LoginResponse).token });
  }

  it('exige sessão', async () => {
    expect((await api(app, 'aurora').get('/v1/horoscope')).status).toBe(401);
  });

  it('só o cache de hoje; vazio antes da busca', async () => {
    const http = await playerHttp();
    expect((await http.get('/v1/horoscope')).body).toEqual({ date: TODAY, readings: [] });

    await syncHoroscope(prisma, CONFIG, provider(body(drawDateOf(NOW, -1))));
    expect((await http.get('/v1/horoscope')).body).toEqual({ date: TODAY, readings: [] });

    await syncHoroscope(prisma, CONFIG, provider(body()));
    const res = await http.get('/v1/horoscope');
    expect(res.headers['cache-control']).toBe('no-store');
    const data = res.body as HoroscopeTodayResponse;
    expect(data.readings).toHaveLength(12);
    expect(data.readings.find((r) => r.sign === 'aries')).toEqual({
      sign: 'aries',
      text: expect.stringContaining('Trabalho:'),
      tens: ['78', '04', '46', '45', '68'],
      colors: ['Verde-pistache-claro'],
    });
  });
});
