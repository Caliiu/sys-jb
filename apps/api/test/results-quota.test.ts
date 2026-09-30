import { drawDateOf } from '@sysjb/contracts';
import { createPrismaClient } from '@sysjb/database';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { planConsulta } from '../src/results/consulta-planner.js';
import { type ResultsConsultaConfig, loadResultsConsultaConfig } from '../src/results/results.config.js';
import { type RecoveryEvent, recoverResults } from '../src/results/results-recovery.js';
import { migratorPool, resetUsers, runtimePool } from './helpers.js';
import { TEST_APP_URL } from './env.js';

const REAL_NOW = new Date().toISOString();
const TODAY = drawDateOf(REAL_NOW, 0);
const YESTERDAY = drawDateOf(REAL_NOW, -1);
/** Hoje às HH:MM em Brasília (UTC-3). */
const todayAt = (hhmm: string) =>
  `${TODAY}T${String(Number(hhmm.slice(0, 2)) + 3).padStart(2, '0')}:${hhmm.slice(3)}:00.000Z`;

const RIO = [9, 11, 14, 16, 18, 21];

// ---------------------------------------------------------------------------
// Planejamento (sem banco)
// ---------------------------------------------------------------------------

describe('planConsulta', () => {
  const base = {
    date: YESTERDAY,
    lottery: 'rj',
    nowIso: REAL_NOW,
    stored: new Set<number>(),
    lastAnsweredAt: null,
    cooldownMinutes: 10,
    force: false,
  };

  it('dia passado sem nada gravado: consulta o dia inteiro (uma requisição)', () => {
    expect(planConsulta(base)).toEqual({ consult: true, missing: RIO });
  });

  it('dia passado completo: não consulta', () => {
    expect(planConsulta({ ...base, stored: new Set(RIO) })).toEqual({ consult: false, reason: 'complete' });
  });

  it('falta uma extração: consulta', () => {
    expect(planConsulta({ ...base, stored: new Set([9, 11, 14, 16, 18]) })).toEqual({ consult: true, missing: [21] });
  });

  it('hoje: extração só conta como saída 30 min depois da hora', () => {
    const today = { ...base, date: TODAY };
    // 09:29: nada saiu ainda.
    expect(planConsulta({ ...today, nowIso: todayAt('09:29') })).toEqual({ consult: false, reason: 'not_yet' });
    // 09:30: a das 09 já deveria ter saído.
    expect(planConsulta({ ...today, nowIso: todayAt('09:30') })).toEqual({ consult: true, missing: [9] });
    // 12:00 com a das 09 e 11 gravadas: o resto ainda não saiu.
    expect(planConsulta({ ...today, nowIso: todayAt('12:00'), stored: new Set([9, 11]) })).toEqual({
      consult: false,
      reason: 'not_yet',
    });
  });

  it('respondida há menos da espera: não repete; depois dela, consulta', () => {
    const now = Date.parse(REAL_NOW);
    const recent = planConsulta({ ...base, lastAnsweredAt: new Date(now - 9 * 60_000) });
    expect(recent).toMatchObject({ consult: false, reason: 'cooldown' });
    expect(recent.consult === false && recent.retryAt?.getTime()).toBe(now + 60_000);
    expect(planConsulta({ ...base, lastAnsweredAt: new Date(now - 10 * 60_000) }).consult).toBe(true);
  });

  it('extração pedida: só ela conta', () => {
    expect(planConsulta({ ...base, extraction: 21, stored: new Set([21]) })).toEqual({
      consult: false,
      reason: 'complete',
    });
    expect(planConsulta({ ...base, extraction: 21, stored: new Set([9]) })).toEqual({
      consult: true,
      extraction: 21,
      missing: [21],
    });
  });

  it('sigla fora do catálogo: só a espera vale', () => {
    expect(planConsulta({ ...base, lottery: 'zz' })).toEqual({ consult: true, missing: null });
    expect(planConsulta({ ...base, lottery: 'zz', lastAnsweredAt: new Date() }).consult).toBe(false);
  });

  it('--force ignora completo, "ainda não saiu" e a espera', () => {
    expect(planConsulta({ ...base, stored: new Set(RIO), lastAnsweredAt: new Date(), force: true })).toEqual({
      consult: true,
      missing: null,
    });
  });
});

describe('configuração da cota', () => {
  const env = { RESULTS_API_TOKEN: 't'.repeat(20) };

  it('padrões: sem cota (só conta), para em 90%, espera 10 min', () => {
    expect(loadResultsConsultaConfig(env)).toMatchObject({
      monthlyQuota: null,
      quotaStopPercent: 90,
      cooldownMinutes: 10,
    });
  });

  it('lê os valores e recusa fora da faixa', () => {
    expect(
      loadResultsConsultaConfig({
        ...env,
        RESULTS_API_MONTHLY_QUOTA: '5000',
        RESULTS_API_QUOTA_STOP_PERCENT: '80',
        RESULTS_API_COOLDOWN_MINUTES: '0',
      }),
    ).toMatchObject({ monthlyQuota: 5000, quotaStopPercent: 80, cooldownMinutes: 0 });
    expect(() => loadResultsConsultaConfig({ ...env, RESULTS_API_MONTHLY_QUOTA: '0' })).toThrow(/MONTHLY_QUOTA/);
    expect(() => loadResultsConsultaConfig({ ...env, RESULTS_API_QUOTA_STOP_PERCENT: '101' })).toThrow(/STOP_PERCENT/);
    expect(() => loadResultsConsultaConfig({ ...env, RESULTS_API_COOLDOWN_MINUTES: '5.5' })).toThrow(/COOLDOWN/);
  });
});

// ---------------------------------------------------------------------------
// Recuperação (banco real, provedor falso)
// ---------------------------------------------------------------------------

// Credencial de runtime: prova também os privilégios que a recuperação usa.
const prisma = createPrismaClient({ connectionString: TEST_APP_URL, max: 2 });

afterAll(async () => {
  await prisma.$disconnect();
  await Promise.all([migratorPool.end(), runtimePool.end()]);
});
beforeEach(resetUsers);

const CONFIG: ResultsConsultaConfig = {
  url: new URL('https://consulta.test/v1/'),
  token: 'token-de-teste-123',
  monthlyQuota: null,
  quotaStopPercent: 90,
  cooldownMinutes: 10,
};

const numbersFor = (extraction: number) =>
  Object.fromEntries([1, 2, 3, 4, 5].map((p) => [String(p), String(extraction * 100 + p).padStart(4, '0')]));

/** Provedor falso: devolve as extrações pedidas (ou as do dia) e registra as chamadas. */
function provider(options: { status?: number; extractions?: number[] } = {}) {
  const calls: URLSearchParams[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    const params = new URL(String(url)).searchParams;
    calls.push(params);
    const status = options.status ?? 200;
    if (status !== 200) return Response.json({ mensagem: 'erro simulado' }, { status });
    const wanted = params.get('extracao');
    const extractions = (options.extractions ?? RIO).filter((e) => !wanted || e === Number(wanted));
    if (extractions.length === 0) return Response.json({ mensagem: 'Nenhum resultado' }, { status: 404 });
    return Response.json({
      dados: {
        resultados: extractions.map((e) => ({
          data: params.get('data'),
          loteria: params.get('loteria'),
          extracao: String(e).padStart(2, '0'),
          resultado: numbersFor(e),
        })),
      },
    });
  });
  return { fetchImpl, calls };
}

async function run(
  request: { date?: string; lotteries?: string[]; extraction?: number; force?: boolean },
  fake: ReturnType<typeof provider>,
  config: Partial<ResultsConsultaConfig> = {},
  now?: string,
) {
  const events: RecoveryEvent[] = [];
  const summary = await recoverResults(
    prisma,
    { ...CONFIG, ...config },
    { date: request.date ?? YESTERDAY, lotteries: request.lotteries ?? ['rj'], ...request },
    {
      onEvent: (e) => events.push(e),
      client: { fetchImpl: fake.fetchImpl as unknown as typeof fetch, sleep: async () => {} },
      now: now ? () => new Date(now) : undefined,
    },
  );
  return { summary, events };
}

const consultations = async () =>
  (
    await migratorPool.query(
      'SELECT lottery, extraction, status, http_status, responses, items FROM result_consultations ORDER BY requested_at',
    )
  ).rows;

/** Uso anterior do mês: uma consulta por resposta (como a role de migração, que pode inserir direto). */
const spend = (responses: number) =>
  migratorPool.query(
    `INSERT INTO result_consultations (draw_date, lottery, status, http_status, responses, items)
     SELECT $1, 'ln', 'OK', 200, 1, 1 FROM generate_series(1, $2::int)`,
    [YESTERDAY, responses],
  );

describe('recuperação com proteção de cota', () => {
  it('dia inteiro em uma consulta; a segunda execução não gasta nada', async () => {
    const fake = provider();
    const first = await run({}, fake);
    expect(fake.fetchImpl).toHaveBeenCalledTimes(1);
    expect(fake.calls[0]!.has('extracao')).toBe(false);
    expect(first.summary).toMatchObject({ consulted: 1, created: 6, used: 1, stopped: null });
    expect(await consultations()).toEqual([
      { lottery: 'rj', extraction: null, status: 'OK', http_status: 200, responses: 1, items: 6 },
    ]);

    const again = await run({}, fake);
    expect(fake.fetchImpl).toHaveBeenCalledTimes(1);
    expect(again.summary).toMatchObject({ consulted: 0, skipped: 1, used: 1 });
    expect(again.events).toEqual([{ type: 'skipped', lottery: 'rj', reason: 'complete', retryAt: undefined }]);
  });

  it('faltando uma extração, consulta de novo (depois da espera) e só ela é nova', async () => {
    await run({}, provider({ extractions: [9, 11, 14, 16, 18] }));
    const later = await run({}, provider(), { cooldownMinutes: 0 });
    expect(later.summary).toMatchObject({ consulted: 1, created: 1, unchanged: 5 });
  });

  it('"nenhum resultado" é registrado e não se repete dentro da espera', async () => {
    const empty = provider({ extractions: [] });
    const first = await run({}, empty);
    expect(first.events).toContainEqual({ type: 'empty', lottery: 'rj' });
    expect(await consultations()).toMatchObject([{ status: 'EMPTY', http_status: 404, responses: 1, items: 0 }]);

    const soon = await run({}, empty);
    expect(empty.fetchImpl).toHaveBeenCalledTimes(1);
    expect(soon.events[0]).toMatchObject({ type: 'skipped', reason: 'cooldown' });
  });

  it('hoje, antes de sair a primeira extração: não consulta', async () => {
    const fake = provider();
    const early = await run({ date: TODAY }, fake, {}, todayAt('08:00'));
    expect(fake.fetchImpl).not.toHaveBeenCalled();
    expect(early.events[0]).toMatchObject({ reason: 'not_yet' });
  });

  it('para no limite da cota (cota × %) sem chamar o provedor', async () => {
    await spend(45);
    const fake = provider();
    const res = await run({ lotteries: ['rj', 'ln'] }, fake, { monthlyQuota: 50, quotaStopPercent: 90 });
    expect(fake.fetchImpl).not.toHaveBeenCalled();
    expect(res.summary).toMatchObject({ used: 45, limit: 45, stopped: 'quota', consulted: 0 });
    expect(res.events).toEqual([{ type: 'quota', used: 45, limit: 45 }]);
  });

  it('perto do limite, não faz novas tentativas que passariam dele', async () => {
    await spend(44);
    const down = provider({ status: 502 });
    const res = await run({}, down, { monthlyQuota: 50, quotaStopPercent: 90 });
    expect(down.fetchImpl).toHaveBeenCalledTimes(1);
    expect(res.summary).toMatchObject({ used: 45, failed: 1 });
    expect(await consultations()).toContainEqual({
      lottery: 'rj',
      extraction: null,
      status: 'ERROR',
      http_status: 502,
      responses: 1,
      items: 0,
    });
  });

  it('401 (token ou cota do provedor) conta na cota e interrompe as outras siglas', async () => {
    const denied = provider({ status: 401 });
    const res = await run({ lotteries: ['rj', 'ln', 'sp'] }, denied);
    expect(denied.fetchImpl).toHaveBeenCalledTimes(1);
    expect(res.summary).toMatchObject({ stopped: 'unauthorized', failed: 1, used: 1 });
  });

  it('falha de rede sem resposta não conta na cota nem ativa a espera', async () => {
    const offline = { fetchImpl: vi.fn(async () => Promise.reject(new TypeError('fetch failed'))), calls: [] };
    const res = await run({}, offline as unknown as ReturnType<typeof provider>);
    expect(offline.fetchImpl).toHaveBeenCalledTimes(3);
    expect(res.summary).toMatchObject({ used: 0, failed: 1 });
    expect(await consultations()).toMatchObject([{ status: 'ERROR', http_status: null, responses: 0 }]);

    const fake = provider();
    await run({}, fake);
    expect(fake.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('--force consulta mesmo completo e recente', async () => {
    await run({}, provider());
    const fake = provider();
    const res = await run({ force: true }, fake);
    expect(fake.fetchImpl).toHaveBeenCalledTimes(1);
    expect(res.summary).toMatchObject({ consulted: 1, unchanged: 6, used: 2 });
  });

  it('extração pedida vai no parâmetro e só ela é gravada', async () => {
    const fake = provider();
    const res = await run({ extraction: 14 }, fake);
    expect(fake.calls[0]!.get('extracao')).toBe('14');
    expect(res.summary).toMatchObject({ created: 1 });
    expect(await consultations()).toMatchObject([{ extraction: 14, status: 'OK', items: 1 }]);
  });
});

describe('banco: registro de consultas', () => {
  it('somente inclusão, com a data/hora do banco', async () => {
    await run({}, provider());
    await expect(runtimePool.query('DELETE FROM result_consultations')).rejects.toThrow(/permission denied/);
    await expect(runtimePool.query('UPDATE result_consultations SET responses = 0')).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      runtimePool.query(
        `INSERT INTO result_consultations (requested_at, draw_date, lottery, status, responses)
         VALUES ('2020-01-01', CURRENT_DATE, 'rj', 'ERROR', 0)`,
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      runtimePool.query(
        `INSERT INTO result_consultations (draw_date, lottery, status, http_status, responses)
         VALUES (CURRENT_DATE, 'rj', 'OK', NULL, 0)`,
      ),
    ).rejects.toThrow(/result_consultations_answered/);
  });
});
