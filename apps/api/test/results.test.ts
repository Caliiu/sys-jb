import type { INestApplication } from '@nestjs/common';
import { drawDateOf, type LoginResponse, type LotteryResultsResponse, resultFullPrizes } from '@sysjb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsultaError, fetchResults } from '../src/results/consulta-client.js';
import { normalizeConsultaItem, normalizeWebhook } from '../src/results/result-normalizer.js';
import { loadResultsConsultaConfig, parseResultsWebhookToken } from '../src/results/results.config.js';
import {
  api,
  createUser,
  KEYS,
  migratorPool,
  resetUsers,
  RESULTS_WEBHOOK_TOKEN,
  runtimePool,
  startApp,
  SYNTHETIC_PASSWORD,
} from './helpers.js';

const NOW = new Date().toISOString();
const day = (offset: number) => drawDateOf(NOW, offset);
const TODAY = day(0);

/** Exemplo da documentação do provedor (data trocada para hoje). */
function payload(extra: Record<string, unknown> = {}) {
  return {
    res_api_chave: 'cf_chl_***********************',
    res_servidor: 'Global-s1',
    res_data: TODAY,
    res_timestamp: 1790768762,
    res_extracao: '21',
    res_loteria: 'rj',
    res_resultado: '9423,1254,9751,4571,0325,0000,0000,0000,0000,0000',
    res_grupos: '06,14,13,18,06,0,0,0,0,0',
    primeiro_premio: '9423',
    segundo_premio: '1254',
    terceiro_premio: '9751',
    quarto_premio: '4571',
    quinto_premio: '0325',
    sexto_premio: '0',
    setimo_premio: '0',
    oitavo_premio: '0',
    nono_premio: '0',
    decimo_premio: '0',
    res_soma: '29324',
    res_multiplicacao: '923',
    res_salteado: '92',
    res_super5: '0',
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Normalização (sem banco)
// ---------------------------------------------------------------------------

describe('normalização do webhook', () => {
  it('aceita o exemplo da documentação: prêmios "0" no fim são ignorados e super5 "0" vira null', () => {
    const out = normalizeWebhook(payload(), NOW);
    expect(out).toEqual({
      ok: true,
      result: {
        date: TODAY,
        lottery: 'rj',
        extraction: 21,
        prizes: ['9423', '1254', '9751', '4571', '0325'],
        sum: '29324',
        multiplication: '923',
        skipped: '92',
        super5: null,
      },
    });
  });

  it('"0000" é um número válido; 5 dígitos (Federal) também', () => {
    const out = normalizeWebhook(
      payload({
        res_loteria: 'FD',
        res_extracao: 19,
        quinto_premio: '0000',
        primeiro_premio: '12345',
        res_resultado: undefined,
      }),
      NOW,
    );
    expect(out.ok && out.result).toMatchObject({
      lottery: 'fd',
      extraction: 19,
      prizes: ['12345', '1254', '9751', '4571', '0000'],
    });
  });

  it('até 10 prêmios (Paraíba/Bahia)', () => {
    const ten = {
      sexto_premio: '1111',
      setimo_premio: '2222',
      oitavo_premio: '3333',
      nono_premio: '4444',
      decimo_premio: '5555',
    };
    const out = normalizeWebhook(payload({ ...ten, res_resultado: undefined }), NOW);
    expect(out.ok && out.result.prizes).toHaveLength(10);
  });

  it.each([
    ['prêmio depois de um vazio', { sexto_premio: '0', setimo_premio: '1234' }, 'setimo_premio'],
    ['menos de 5 prêmios', { quinto_premio: '0' }, 'quinto_premio'],
    ['prêmio com 3 dígitos', { segundo_premio: '254' }, 'segundo_premio'],
    ['prêmio como número JSON (perderia o zero à esquerda)', { quinto_premio: 325 }, 'quinto_premio'],
    ['data no futuro', { res_data: day(1) }, 'res_data'],
    ['data inexistente', { res_data: '2026-02-30' }, 'res_data'],
    ['extração fora de 00–23', { res_extracao: '24' }, 'res_extracao'],
    ['sigla inválida', { res_loteria: 'r1' }, 'res_loteria'],
    ['campo calculado com letras', { res_soma: '29a' }, 'res_soma'],
    ['res_resultado divergente', { res_resultado: '9423,1254,9751,4571,0326' }, 'res_resultado'],
    ['campo obrigatório ausente', { res_data: undefined }, 'res_data'],
  ])('recusa %s', (_label, extra, field) => {
    const out = normalizeWebhook(payload(extra), NOW);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.issues.map((i) => i.field)).toContain(field);
  });

  it('os erros nunca trazem os valores recebidos', () => {
    const out = normalizeWebhook(payload({ segundo_premio: 'SEGREDO' }), NOW);
    expect(JSON.stringify(out)).not.toContain('SEGREDO');
  });
});

describe('normalização da consulta', () => {
  const item = (extra: Record<string, unknown> = {}) => ({
    data: TODAY,
    data_formatada: '30/09/2026',
    loteria: 'rj',
    extracao: '21',
    titulo: 'Rio 21 horas',
    resultado: { '1': '9423', '2': '1254', '3': '9751', '4': '4571', '5': '0325' },
    Resultado: '9423,1254,9751,4571,0325',
    Soma: '29324',
    Multiplicacao: '923',
    Salteado: '92',
    ...extra,
  });

  it('aceita o exemplo da documentação', () => {
    const out = normalizeConsultaItem(item(), NOW);
    expect(out.ok && out.result).toMatchObject({
      extraction: 21,
      prizes: ['9423', '1254', '9751', '4571', '0325'],
      super5: null,
    });
  });

  it('aceita data DD/MM/YYYY', () => {
    const [y, m, d] = TODAY.split('-');
    expect(normalizeConsultaItem(item({ data: `${d}/${m}/${y}` }), NOW).ok).toBe(true);
  });

  it('recusa posições com buraco e número que perdeu o zero à esquerda', () => {
    expect(normalizeConsultaItem(item({ resultado: { '1': '9423', '3': '1254' } }), NOW).ok).toBe(false);
    expect(
      normalizeConsultaItem(item({ resultado: { '1': 9423, '2': 1254, '3': 9751, '4': 4571, '5': 325 } }), NOW).ok,
    ).toBe(false);
  });
});

describe('6º e 7º prêmios (resultFullPrizes)', () => {
  const rio = (extra: Partial<Parameters<typeof resultFullPrizes>[0]> = {}) =>
    resultFullPrizes({
      lottery: 'rj',
      extraction: 9,
      prizes: ['7977', '5765', '2942', '6262', '2545'],
      sum: '25491',
      multiplication: '987',
      ...extra,
    });

  it('resultado real do Rio 09h (30/09): 6º = soma (últimos 4 dígitos), 7º = multiplicação', () => {
    expect(rio()).toEqual(['7977', '5765', '2942', '6262', '2545', '5491', '987']);
  });

  it('confere a regra com os resultados reais do Rio de 29/09', () => {
    const real = [
      [['3877', '2214', '0499', '1554', '5755'], '13899', '583'],
      [['1616', '6701', '1938', '6360', '1822'], '18437', '828'],
      [['0468', '2416', '8971', '9254', '2981'], '24090', '130'],
    ] as const;
    for (const [prizes, sum, multiplication] of real) {
      const numbers = prizes.map(Number);
      expect(String(numbers.reduce((a, b) => a + b, 0))).toBe(sum);
      expect(String(Math.floor((numbers[0]! * numbers[1]!) / 1000) % 1000).padStart(3, '0')).toBe(multiplication);
      expect(rio({ prizes: [...prizes], sum, multiplication }).slice(5)).toEqual([sum.slice(-4), multiplication]);
    }
  });

  it('completa com zeros à esquerda', () => {
    expect(rio({ sum: '10045', multiplication: '7' }).slice(5)).toEqual(['0045', '007']);
  });

  it('não calcula: já veio com 7 ou mais, loteria de 10 prêmios, fora do catálogo ou sem soma', () => {
    const seven = ['7977', '5765', '2942', '6262', '2545', '1111', '2222'];
    expect(rio({ prizes: seven })).toEqual(seven);
    expect(rio({ lottery: 'ba', extraction: 10 })).toHaveLength(5);
    expect(rio({ lottery: 'zz' })).toHaveLength(5);
    expect(rio({ sum: null, multiplication: null })).toHaveLength(5);
    expect(rio({ multiplication: null })).toEqual(['7977', '5765', '2942', '6262', '2545', '5491']);
  });
});

describe('configuração', () => {
  it('token do webhook: vazio desativa; exige 24 a 32 caracteres visíveis; a mensagem não traz o token', () => {
    expect(parseResultsWebhookToken(undefined)).toBeNull();
    expect(parseResultsWebhookToken('  ')).toBeNull();
    expect(parseResultsWebhookToken('a'.repeat(32))).toBeInstanceOf(Buffer);
    expect(() => parseResultsWebhookToken('curto-demais-segredo')).toThrow(expect.not.stringContaining('segredo'));
    expect(() => parseResultsWebhookToken('a'.repeat(33))).toThrow();
    expect(() => parseResultsWebhookToken(`${'a'.repeat(20)} ${'b'.repeat(5)}`)).toThrow();
  });

  it('consulta: sem token fica desativada; só HTTPS (HTTP só local); sem credencial na URL', () => {
    expect(loadResultsConsultaConfig({})).toBeNull();
    expect(loadResultsConsultaConfig({ RESULTS_API_TOKEN: 't'.repeat(20) })?.url.protocol).toBe('https:');
    expect(() =>
      loadResultsConsultaConfig({ RESULTS_API_TOKEN: 't'.repeat(20), RESULTS_API_URL: 'http://api.exemplo.com/' }),
    ).toThrow(/HTTPS/);
    expect(
      loadResultsConsultaConfig({ RESULTS_API_TOKEN: 't'.repeat(20), RESULTS_API_URL: 'http://127.0.0.1:9/' }),
    ).not.toBeNull();
    expect(() =>
      loadResultsConsultaConfig({ RESULTS_API_TOKEN: 't'.repeat(20), RESULTS_API_URL: 'https://u:p@api.exemplo.com/' }),
    ).toThrow(/credenciais/);
  });
});

// ---------------------------------------------------------------------------
// Cliente da consulta (fetch falso)
// ---------------------------------------------------------------------------

describe('cliente da consulta', () => {
  const config = {
    url: new URL('https://consulta.test/resultados/v1/'),
    token: 'token-de-teste-123',
    monthlyQuota: null,
    quotaStopPercent: 90,
    cooldownMinutes: 10,
  };
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const noSleep = async () => {};

  it('manda Bearer, parâmetros e redirect: "error"; devolve os itens', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      json(200, { dados: { resultados: [{ a: 1 }] } }),
    );
    const items = await fetchResults(
      config,
      { date: TODAY, lottery: 'rj', extraction: 9 },
      { fetchImpl, sleep: noSleep },
    );
    expect(items).toEqual([{ a: 1 }]);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe(`https://consulta.test/resultados/v1/?data=${TODAY}&loteria=rj&extracao=09`);
    expect(init?.redirect).toBe('error');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer token-de-teste-123');
  });

  it('404 = nenhum resultado', async () => {
    const fetchImpl = vi.fn(async () => json(404, { mensagem: 'Nenhum resultado encontrado' }));
    await expect(fetchResults(config, { date: TODAY, lottery: 'rj' }, { fetchImpl, sleep: noSleep })).resolves.toEqual(
      [],
    );
  });

  it('401 (token ou cota) não repete; 5xx e rede repetem e desistem depois', async () => {
    const denied = vi.fn(async () => json(401, { mensagem: 'limite de requisições mensais atingido' }));
    await expect(
      fetchResults(config, { date: TODAY, lottery: 'rj' }, { fetchImpl: denied, sleep: noSleep }),
    ).rejects.toThrow(/HTTP 401.*limite/);
    expect(denied).toHaveBeenCalledTimes(1);

    const down = vi.fn(async () => json(502, {}));
    await expect(
      fetchResults(config, { date: TODAY, lottery: 'rj' }, { fetchImpl: down, sleep: noSleep }),
    ).rejects.toBeInstanceOf(ConsultaError);
    expect(down).toHaveBeenCalledTimes(3);

    let calls = 0;
    const flaky = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('fetch failed');
      return json(200, { dados: { resultados: [] } });
    });
    await expect(
      fetchResults(config, { date: TODAY, lottery: 'rj' }, { fetchImpl: flaky, sleep: noSleep }),
    ).resolves.toEqual([]);
  });

  it('recusa resposta grande demais e formato inesperado, sem expor o token', async () => {
    const big = vi.fn(async () => new Response('x'.repeat(1_000_001), { status: 200 }));
    const error = await fetchResults(config, { date: TODAY, lottery: 'rj' }, { fetchImpl: big, sleep: noSleep }).catch(
      (e: Error) => e,
    );
    expect(error).toBeInstanceOf(ConsultaError);
    expect((error as Error).message).not.toContain(config.token);

    const odd = vi.fn(async () => json(200, { outra: 'coisa' }));
    await expect(
      fetchResults(config, { date: TODAY, lottery: 'rj' }, { fetchImpl: odd, sleep: noSleep }),
    ).rejects.toThrow(/formato inesperado/);
    expect(odd).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// HTTP + banco
// ---------------------------------------------------------------------------

let app: INestApplication;

beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
  await Promise.all([migratorPool.end(), runtimePool.end()]);
});
beforeEach(resetUsers);

const WEBHOOK = '/v1/integrations/results';
const webhook = (body: unknown, headers: Record<string, string> = { 'X-Auth-Token': RESULTS_WEBHOOK_TOKEN }) =>
  api(app, 'aurora')
    .raw()
    .post(WEBHOOK)
    .set(headers)
    .send(body as object);

async function stored() {
  const { rows } = await migratorPool.query(
    'SELECT draw_date::text AS date, lottery, extraction, prizes, sum_value, super5, source, revision FROM lottery_results ORDER BY lottery, extraction',
  );
  return rows;
}

describe('webhook de resultados', () => {
  it('sem token, token errado, Authorization sem Bearer ou um dos cabeçalhos divergente = 401', async () => {
    expect((await webhook(payload(), {})).status).toBe(401);
    expect((await webhook(payload(), { 'X-Auth-Token': 'x'.repeat(32) })).status).toBe(401);
    expect((await webhook(payload(), { Authorization: RESULTS_WEBHOOK_TOKEN })).status).toBe(401);
    expect((await webhook(payload(), { 'X-Auth-Token': RESULTS_WEBHOOK_TOKEN, Token: 'y'.repeat(32) })).status).toBe(
      401,
    );
    // A credencial de serviço de uma banca não abre o webhook.
    expect((await webhook(payload(), { Authorization: `Bearer ${KEYS.aurora}` })).status).toBe(401);
    expect(await stored()).toEqual([]);
  });

  it.each([
    ['X-Auth-Token', { 'X-Auth-Token': RESULTS_WEBHOOK_TOKEN }],
    ['Token', { Token: RESULTS_WEBHOOK_TOKEN }],
    ['Authorization: Bearer', { Authorization: `Bearer ${RESULTS_WEBHOOK_TOKEN}` }],
    [
      'os três juntos (como o provedor manda)',
      {
        'X-Auth-Token': RESULTS_WEBHOOK_TOKEN,
        Token: RESULTS_WEBHOOK_TOKEN,
        Authorization: `Bearer ${RESULTS_WEBHOOK_TOKEN}`,
      },
    ],
  ])('aceita o token em %s', async (_label, headers) => {
    const res = await webhook(payload(), headers);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ codigo: 201, mensagem: 'Resultado recebido e armazenado.' });
  });

  it('grava; reenvio igual responde 200 sem alterar; correção vira revisão 2 com histórico', async () => {
    expect((await webhook(payload())).status).toBe(201);
    const first = await stored();
    expect(first).toEqual([
      {
        date: TODAY,
        lottery: 'rj',
        extraction: 21,
        prizes: ['9423', '1254', '9751', '4571', '0325'],
        sum_value: '29324',
        super5: null,
        source: 'WEBHOOK',
        revision: 1,
      },
    ]);

    const again = await webhook(payload());
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ codigo: 200, mensagem: 'Resultado recebido com sucesso.' });
    expect(await stored()).toEqual(first);

    const fixed = await webhook(payload({ quinto_premio: '0326', res_resultado: undefined }));
    expect(fixed.status).toBe(200);
    const [current] = await stored();
    expect(current).toMatchObject({ prizes: ['9423', '1254', '9751', '4571', '0326'], revision: 2 });
    const { rows: history } = await migratorPool.query('SELECT revision, prizes FROM lottery_result_revisions');
    expect(history).toEqual([{ revision: 1, prizes: ['9423', '1254', '9751', '4571', '0325'] }]);
  });

  it('menos prêmios que o gravado (mesmo começo) ou campo calculado ausente não apagam nada', async () => {
    const seven = { sexto_premio: '5555', setimo_premio: '6666', res_resultado: undefined };
    expect((await webhook(payload(seven))).status).toBe(201);
    expect((await webhook(payload({ res_soma: '0', res_resultado: undefined }))).status).toBe(200);
    const [row] = await stored();
    expect(row).toMatchObject({
      prizes: ['9423', '1254', '9751', '4571', '0325', '5555', '6666'],
      sum_value: '29324',
      revision: 1,
    });
  });

  it('entregas simultâneas do mesmo resultado gravam uma vez', async () => {
    const responses = await Promise.all(Array.from({ length: 8 }, () => webhook(payload())));
    expect(responses.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 200, 200, 200, 201]);
    expect(await stored()).toHaveLength(1);
  });

  it('inválido = 422 com os campos (sem valores); JSON malformado = 400', async () => {
    const res = await webhook(payload({ res_data: day(1), segundo_premio: 'abc' }));
    expect(res.status).toBe(422);
    expect(res.body.details).toEqual(
      expect.arrayContaining([
        { field: 'res_data', message: 'Data no futuro.' },
        { field: 'segundo_premio', message: 'Use 4 ou 5 dígitos.' },
      ]),
    );
    expect(JSON.stringify(res.body)).not.toContain('abc');

    const broken = await api(app, 'aurora')
      .raw()
      .post(WEBHOOK)
      .set({ 'X-Auth-Token': RESULTS_WEBHOOK_TOKEN, 'Content-Type': 'application/json' })
      .send('{"res_data":');
    expect(broken.status).toBe(400);
    expect(await stored()).toEqual([]);
  });

  it('sem RESULTS_WEBHOOK_TOKEN o webhook fica desativado', async () => {
    const disabled = await startApp({ resultsWebhookTokenDigest: null });
    try {
      const res = await api(disabled, 'aurora')
        .raw()
        .post(WEBHOOK)
        .set({ 'X-Auth-Token': RESULTS_WEBHOOK_TOKEN })
        .send(payload());
      expect(res.status).toBe(401);
    } finally {
      await disabled.close();
    }
  });
});

describe('banco: privilégios e travas', () => {
  it('a role de runtime não exclui, não mexe no histórico nem forja revisão ou identidade', async () => {
    await webhook(payload());
    await expect(runtimePool.query('DELETE FROM lottery_results')).rejects.toThrow(/permission denied/);
    await expect(runtimePool.query('UPDATE lottery_results SET revision = 9')).rejects.toThrow(/permission denied/);
    await expect(runtimePool.query("UPDATE lottery_results SET lottery = 'sp'")).rejects.toThrow(/permission denied/);
    await expect(runtimePool.query('DELETE FROM lottery_result_revisions')).rejects.toThrow(/permission denied/);
    await expect(
      runtimePool.query(
        `INSERT INTO lottery_result_revisions (result_id, revision, prizes, source, received_at)
         SELECT id, 5, prizes, source, now() FROM lottery_results`,
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('CHECKs recusam prêmios fora do formato mesmo sem passar pela API', async () => {
    await expect(
      runtimePool.query(
        `INSERT INTO lottery_results (draw_date, lottery, extraction, prizes, source)
         VALUES (CURRENT_DATE, 'rj', 9, ARRAY['1','2','3','4','5'], 'WEBHOOK')`,
      ),
    ).rejects.toThrow(/lottery_results_prizes_valid/);
  });
});

describe('GET /v1/results (jogador)', () => {
  async function playerHttp() {
    const person = await createUser(app, 'aurora');
    const login = await api(app, 'aurora').post('/v1/auth/login', {
      document: person.document,
      password: SYNTHETIC_PASSWORD,
    });
    return api(app, 'aurora', KEYS.aurora, { 'X-Session-Token': (login.body as LoginResponse).token });
  }

  it('exige sessão', async () => {
    expect((await api(app, 'aurora').get(`/v1/results?date=${TODAY}`)).status).toBe(401);
  });

  it('lista os do dia na ordem do catálogo, com nome; data fora do período = 400', async () => {
    await webhook(payload({ res_loteria: 'ln', res_extracao: '10' }));
    await webhook(payload({ res_loteria: 'sp', res_extracao: '15' }));
    await webhook(payload({ res_loteria: 'rj', res_extracao: '09' }));
    await webhook(payload({ res_loteria: 'zz', res_extracao: '09' }));
    await webhook(payload({ res_loteria: 'rj', res_extracao: '11', res_data: day(-1) }));

    const http = await playerHttp();
    const res = await http.get(`/v1/results?date=${TODAY}`);
    expect(res.status).toBe(200);
    const body = res.body as LotteryResultsResponse;
    expect(body.date).toBe(TODAY);
    expect(body.results.map((r) => [r.lottery, r.extraction, r.lotteryName])).toEqual([
      ['rj', 9, 'PT Rio de Janeiro'],
      ['ln', 10, 'Loteria Nacional'],
      ['sp', 15, 'Bandeirantes São Paulo'],
      ['zz', 9, 'ZZ'],
    ]);
    // 6º (soma 29324 -> 9324) e 7º (multiplicação 923) calculados; fora do catálogo (zz) fica como veio.
    expect(body.results[0]).toMatchObject({
      prizes: ['9423', '1254', '9751', '4571', '0325', '9324', '923'],
      skipped: '92',
      super5: null,
    });
    expect(body.results[3]!.prizes).toEqual(['9423', '1254', '9751', '4571', '0325']);

    expect((await http.get(`/v1/results?date=${day(-8)}`)).status).toBe(400);
    expect((await http.get(`/v1/results?date=${day(1)}`)).status).toBe(400);
    expect((await http.get('/v1/results?date=ontem')).status).toBe(400);
  });
});
