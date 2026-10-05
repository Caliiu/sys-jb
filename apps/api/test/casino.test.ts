import { randomBytes, randomUUID } from 'node:crypto';
import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import type { CasinoGamesPage, CasinoLaunchResponse, CasinoLobby, LoginResponse } from '@sysjb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { normalizeCatalog, normalizeProviders } from '../src/casino/casino-catalog.js';
import { casinoUserCode, displayIdFromUserCode } from '../src/casino/casino-user-code.js';
import { toCents } from '../src/casino/casino-webhook.service.js';
import { CasinoService } from '../src/casino/casino.service.js';
import { loadCasinoConfig } from '../src/casino/casino.config.js';
import { digestKey } from '../src/config/config.js';
import {
  api,
  asTenant,
  createUser,
  KEYS,
  loginOperator,
  migratorPool,
  resetUsers,
  runtimePool,
  startApp,
  SYNTHETIC_PASSWORD,
  tenantId,
} from './helpers.js';
import { TEST_TENANTS } from './env.js';

const AGENT_TOKEN = randomBytes(12).toString('hex');
const SECRET_KEY = randomBytes(12).toString('hex');
const WEBHOOK_TOKEN = randomBytes(16).toString('hex');

/** Catálogo do "provedor" falso (dados sintéticos). */
const CATALOG = {
  status: 1,
  data: [
    ...Array.from({ length: 14 }, (_, i) => ({
      name: `Fortune Sintético ${i + 1}`,
      image_url: `https://cdn.example.test/pg/${i + 1}.png`,
      status: true,
      original: true,
      game_code: `${100 + i}`,
      provider: { name: 'PGSOFT' },
    })),
    {
      name: 'Roleta 100%_Teste',
      image_url: 'javascript:alert(1)',
      status: true,
      original: false,
      game_code: 'rol-1',
      provider: { name: 'Evolution' },
    },
    {
      name: 'Desligado',
      image_url: null,
      status: false,
      original: false,
      game_code: 'off-1',
      provider: { name: 'Evolution' },
    },
    { name: '', game_code: 'x', provider: { name: 'Evolution' } },
    { name: 'Código ruim', game_code: '<script>', provider: { name: 'Evolution' } },
  ],
};

/** Provedores e carteiras do "provedor" falso. */
const PROVIDERS = {
  status: 1,
  data: [
    { id: 1, name: 'pgsoft', wallet: { name: 'Carteira Oficial  (Slots)' }, status: 1 },
    { id: 2, name: 'Evolution', wallet: { name: 'OFICIAL - Evolution' }, status: 1 },
    { id: 3, name: 'Desligado', wallet: { name: 'Carteira Oficial (Slots)' }, status: 0 },
  ],
};

let launches: Array<Record<string, unknown>> = [];
let launchUrl = 'https://games.example.test/launch?token=abc';
let provider: Server;
let providerPort = 0;
let app: INestApplication;
let auroraId: string;

beforeAll(async () => {
  provider = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let raw = '';
    req.on('data', (chunk: Buffer) => (raw += chunk.toString()));
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'GET' && url.pathname === '/api/v2/providers') {
        res.end(JSON.stringify(PROVIDERS));
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/v2/games') {
        const ok =
          url.searchParams.get('agentToken') === AGENT_TOKEN && url.searchParams.get('secretKey') === SECRET_KEY;
        res.statusCode = ok ? 200 : 401;
        res.end(JSON.stringify(ok ? CATALOG : { status: false }));
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/v2/game_launch') {
        const body = JSON.parse(raw) as Record<string, unknown>;
        launches.push(body);
        res.end(JSON.stringify({ status: true, msg: '', launch_url: launchUrl, user_balance: body.user_balance }));
        return;
      }
      res.statusCode = 404;
      res.end('{}');
    });
  });
  await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const port = (provider.address() as AddressInfo).port;
  providerPort = port;

  const casino = loadCasinoConfig({
    PLAYFIVERS_AGENT_TOKEN: AGENT_TOKEN,
    PLAYFIVERS_SECRET_KEY: SECRET_KEY,
    PLAYFIVERS_API_URL: `http://127.0.0.1:${port}`,
    CASINO_WEBHOOK_TOKEN: WEBHOOK_TOKEN,
  });
  app = await startApp({ casino: casino && { ...casino, catalogSyncMs: null } });
  auroraId = await tenantId('aurora');
});
afterAll(async () => {
  await app.close();
  await new Promise((resolve) => provider.close(resolve));
  await Promise.all([migratorPool.end(), runtimePool.end()]);
});
beforeEach(async () => {
  await resetUsers();
  launches = [];
  launchUrl = 'https://games.example.test/launch?token=abc';
  await app.get(CasinoService).syncCatalog();
});

async function player(tenant: 'aurora' | 'boreal' = 'aurora') {
  const person = await createUser(app, tenant, { name: 'Gustavo Sintético' });
  const login = await api(app, tenant).post('/v1/auth/login', {
    document: person.document,
    password: SYNTHETIC_PASSWORD,
  });
  return {
    id: person.id,
    displayId: person.displayId,
    /** Como o jogador vai ao provedor (e volta no webhook). */
    code: `${person.displayId} Gustavo - ${TEST_TENANTS[tenant].name}`,
    http: api(app, tenant, KEYS[tenant], { 'X-Session-Token': (login.body as LoginResponse).token }),
  };
}

async function creditGames(userId: string, amountCents: number) {
  const operator = await loginOperator(app, 'aurora');
  const res = await operator.http.post(`/v1/admin/users/${userId}/wallet/credits`, {
    idempotencyKey: randomUUID(),
    bucket: 'games',
    amountCents,
    note: 'Crédito de games',
  });
  expect(res.status).toBe(201);
  return operator;
}

const webhook = (body: unknown, token: string | null = WEBHOOK_TOKEN) =>
  api(app, 'aurora', KEYS.aurora, token === null ? {} : { 'X-Casino-Token': token }).post(
    '/v1/integrations/casino',
    body,
  );

const round = (userCode: string, slot: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  webhook({
    type: 'WinBet',
    agent_code: 'AGENTE',
    agent_secret: SECRET_KEY,
    user_code: userCode,
    user_balance: 0,
    game_original: true,
    game_type: 'slot',
    slot: {
      provider_code: 'PGSOFT',
      game_code: '100',
      type: 'slot',
      round_id: `r-${randomUUID()}`,
      txn_id: `t-${randomUUID()}`,
      txn_type: 'debit_credit',
      bet: 0,
      win: 0,
      ...slot,
    },
    ...extra,
  });

const wallet = (userId: string) =>
  asTenant(migratorPool, auroraId, async (c) => {
    const { rows } = await c.query<{ balance_games: string; bonus_games: string; prizes_games: string }>(
      'SELECT balance_games, bonus_games, prizes_games FROM wallets WHERE user_id = $1',
      [userId],
    );
    return rows[0];
  });

const gameId = async (code: string) =>
  (await migratorPool.query<{ id: number }>('SELECT id FROM casino_games WHERE game_code = $1', [code])).rows[0]!.id;

describe('configuração e catálogo', () => {
  it('sem credenciais o cassino fica desligado; URL só https (http só local)', () => {
    expect(loadCasinoConfig({})).toBeNull();
    expect(loadCasinoConfig({ PLAYFIVERS_AGENT_TOKEN: AGENT_TOKEN })).toBeNull();
    expect(() =>
      loadCasinoConfig({
        PLAYFIVERS_AGENT_TOKEN: AGENT_TOKEN,
        PLAYFIVERS_SECRET_KEY: SECRET_KEY,
        PLAYFIVERS_API_URL: 'http://api.example.test',
      }),
    ).toThrow(/HTTPS/);
    expect(() =>
      loadCasinoConfig({
        PLAYFIVERS_AGENT_TOKEN: AGENT_TOKEN,
        PLAYFIVERS_SECRET_KEY: SECRET_KEY,
        CASINO_WEBHOOK_TOKEN: 'curto',
      }),
    ).toThrow(/CASINO_WEBHOOK_TOKEN/);
    const config = loadCasinoConfig({ PLAYFIVERS_AGENT_TOKEN: AGENT_TOKEN, PLAYFIVERS_SECRET_KEY: SECRET_KEY });
    expect(config?.apiUrl.toString()).toBe('https://api.playfivers.com/');
    expect(config?.webhookTokenDigest).toBeNull();
  });

  it('normaliza: descarta inativo, sem nome e código fora do formato; imagem só https', () => {
    const games = normalizeCatalog(CATALOG);
    expect(games).toHaveLength(15);
    expect(games.find((g) => g.gameCode === 'rol-1')).toEqual({
      provider: 'Evolution',
      gameCode: 'rol-1',
      name: 'Roleta 100%_Teste',
      imageUrl: null,
      original: false,
    });
    expect(normalizeCatalog({ data: 'x' })).toEqual([]);
    expect(normalizeCatalog(null)).toEqual([]);
  });

  it('sincroniza de novo sem duplicar e desativa o que saiu', async () => {
    await app.get(CasinoService).syncCatalog();
    const { rows } = await migratorPool.query<{ total: string; active: string }>(
      'SELECT count(*) AS total, count(*) FILTER (WHERE active) AS active FROM casino_games',
    );
    expect(rows[0]).toEqual({ total: '15', active: '15' });

    const saved = CATALOG.data;
    CATALOG.data = saved.filter((g) => g.game_code !== 'rol-1');
    try {
      await app.get(CasinoService).syncCatalog();
    } finally {
      CATALOG.data = saved;
    }
    const after = await migratorPool.query<{ active: boolean }>(
      "SELECT active FROM casino_games WHERE game_code = 'rol-1'",
    );
    expect(after.rows[0]?.active).toBe(false);
  });

  it('PLAYFIVERS_WALLETS: só os provedores da carteira escolhida (nome sem diferença de caixa ou espaços)', async () => {
    const base = loadCasinoConfig({
      PLAYFIVERS_AGENT_TOKEN: AGENT_TOKEN,
      PLAYFIVERS_SECRET_KEY: SECRET_KEY,
      PLAYFIVERS_API_URL: `http://127.0.0.1:${providerPort}`,
      PLAYFIVERS_WALLETS: ' carteira oficial (slots) ',
    })!;
    expect(base.wallets).toEqual(['carteira oficial (slots)']);
    const slots = await startApp({ casino: { ...base, catalogSyncMs: null } });
    const wrong = await startApp({ casino: { ...base, wallets: ['carteira inexistente'], catalogSyncMs: null } });
    try {
      await slots.get(CasinoService).syncCatalog();
      const active = await migratorPool.query<{ provider: string; n: string }>(
        'SELECT provider, count(*) AS n FROM casino_games WHERE active GROUP BY provider',
      );
      expect(active.rows).toEqual([{ provider: 'PGSOFT', n: '14' }]);

      // Carteira que não existe: nada muda (não tira o cassino do ar por erro de configuração).
      await wrong.get(CasinoService).syncCatalog();
      const after = await migratorPool.query<{ n: string }>('SELECT count(*) AS n FROM casino_games WHERE active');
      expect(after.rows[0]).toEqual({ n: '14' });
    } finally {
      await Promise.all([slots.close(), wrong.close()]);
    }
  });

  it('carteira e provedor do PlayFivers: formato conferido', () => {
    expect(normalizeProviders(PROVIDERS)).toEqual([
      { name: 'pgsoft', wallet: 'Carteira Oficial (Slots)' },
      { name: 'Evolution', wallet: 'OFICIAL - Evolution' },
    ]);
    expect(normalizeProviders({ data: [{ name: '<x>', wallet: { name: 'A' } }, { name: 'Y' }] })).toEqual([]);
    expect(normalizeProviders(null)).toEqual([]);
  });

  it('a role de runtime não apaga jogos nem altera rodadas', async () => {
    await expect(runtimePool.query('DELETE FROM casino_games')).rejects.toThrow(/permission denied/);
    await expect(runtimePool.query("UPDATE casino_games SET game_code = 'x'")).rejects.toThrow(/permission denied/);
    await expect(
      runtimePool.query(
        "INSERT INTO casino_transactions (tenant_id, user_id, txn_id, provider, game_code, txn_type, bet_cents, win_cents, balance_after) VALUES (gen_random_uuid(), gen_random_uuid(), 'x', 'p', 'g', 'debit', 0, 0, 0)",
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('lobby e lista do jogador', () => {
  it('exige sessão', async () => {
    expect((await api(app, 'aurora').get('/v1/casino/lobby')).status).toBe(401);
  });

  it('seções por provedor (12 por seção, o maior primeiro) e total para "Ver todos"', async () => {
    const me = await player();
    const res = await me.http.get('/v1/casino/lobby');
    expect(res.status).toBe(200);
    const lobby = res.body as CasinoLobby;
    expect(lobby.available).toBe(true);
    expect(lobby.sections.map((s) => [s.provider, s.total, s.games.length])).toEqual([
      ['PGSOFT', 14, 12],
      ['Evolution', 1, 1],
    ]);
    expect(lobby.sections[0]!.games[0]).toMatchObject({
      name: 'Fortune Sintético 1',
      imageUrl: 'https://cdn.example.test/pg/1.png',
    });
    expect(lobby.topWins).toEqual([]);
  });

  it('lista por provedor e busca (curinga digitado é literal)', async () => {
    const me = await player();
    const all = (await me.http.get('/v1/casino/games?provider=PGSOFT')).body as CasinoGamesPage;
    expect(all).toMatchObject({ total: 14, page: 1, totalPages: 1 });

    const search = (await me.http.get('/v1/casino/games?search=sintético 1')).body as CasinoGamesPage;
    expect(search.items.map((g) => g.name)).toEqual([
      'Fortune Sintético 1',
      'Fortune Sintético 10',
      'Fortune Sintético 11',
      'Fortune Sintético 12',
      'Fortune Sintético 13',
      'Fortune Sintético 14',
    ]);
    expect(
      ((await me.http.get('/v1/casino/games?search=0%25_')).body as CasinoGamesPage).items.map((g) => g.name),
    ).toEqual(['Roleta 100%_Teste']);
    expect(((await me.http.get('/v1/casino/games?search=__')).body as CasinoGamesPage).total).toBe(0);
    expect((await me.http.get('/v1/casino/games?search=a')).status).toBe(400);
    expect((await me.http.get('/v1/casino/games?extra=1')).status).toBe(400);
  });

  it('cassino desligado: lobby avisa e jogo não abre', async () => {
    const off = await startApp();
    try {
      const person = await createUser(off, 'aurora');
      const login = await api(off, 'aurora').post('/v1/auth/login', {
        document: person.document,
        password: SYNTHETIC_PASSWORD,
      });
      const http = api(off, 'aurora', KEYS.aurora, { 'X-Session-Token': (login.body as LoginResponse).token });
      expect((await http.get('/v1/casino/lobby')).body).toEqual({ available: false, sections: [], topWins: [] });
      expect((await http.post(`/v1/casino/games/${await gameId('100')}/launch`, {})).status).toBe(503);
    } finally {
      await off.close();
    }
  });
});

describe('abrir jogo', () => {
  it('manda o id do jogador e o saldo de games em reais; devolve o endereço', async () => {
    const me = await player();
    await creditGames(me.id, 2550);
    const id = await gameId('100');
    const res = await me.http.post(`/v1/casino/games/${id}/launch`, {});
    expect(res.status).toBe(200);
    expect(res.body as CasinoLaunchResponse).toEqual({
      game: { id, name: 'Fortune Sintético 1', provider: 'PGSOFT', imageUrl: 'https://cdn.example.test/pg/1.png' },
      launchUrl: 'https://games.example.test/launch?token=abc',
    });
    expect(launches).toEqual([
      {
        agentToken: AGENT_TOKEN,
        secretKey: SECRET_KEY,
        user_code: `${me.displayId} Gustavo - Banca Aurora Teste`,
        game_code: '100',
        provider: 'PGSOFT',
        game_original: true,
        user_balance: 25.5,
        lang: 'pt',
      },
    ]);
  });

  it('jogo inexistente ou desativado = 404; endereço não-https do provedor = 503', async () => {
    const me = await player();
    expect((await me.http.post('/v1/casino/games/999999/launch', {})).status).toBe(404);
    expect((await me.http.post('/v1/casino/games/abc/launch', {})).status).toBe(400);
    await migratorPool.query("UPDATE casino_games SET active = false WHERE game_code = '101'");
    expect((await me.http.post(`/v1/casino/games/${await gameId('101')}/launch`, {})).status).toBe(404);
    launchUrl = 'http://games.example.test/launch';
    expect((await me.http.post(`/v1/casino/games/${await gameId('100')}/launch`, {})).status).toBe(503);
  });
});

describe('webhook do provedor', () => {
  it('sem token, token errado ou segredo do agente errado = recusado', async () => {
    const me = await player();
    expect((await webhook({ type: 'BALANCE', user_code: me.code }, null)).status).toBe(401);
    expect((await webhook({ type: 'BALANCE', user_code: me.code }, 'x'.repeat(32))).status).toBe(401);
    const bad = await round(me.code, { bet: 1 }, { agent_secret: 'errado' });
    expect(bad.status).toBe(401);
    expect(bad.body).toEqual({ msg: 'INVALID_AGENT', balance: 0 });
  });

  it('o jogador é achado só pelo ID do início: nome ou banca diferentes não mudam a conta', async () => {
    const me = await player();
    await creditGames(me.id, 500);
    const renamed = await webhook({ type: 'BALANCE', user_code: `${me.displayId} Outro Nome - Outra Banca` });
    expect(renamed.body).toEqual({ msg: '', balance: 5 });
    expect((await round(`${me.displayId}`, { bet: 1 })).body).toEqual({ msg: '', balance: 4 });
    const other = await player('boreal');
    // ID de outra banca: credita a conta dele, nunca a deste.
    expect((await round(other.code, { bet: 0, win: 1, txn_type: 'credit' })).body).toEqual({ msg: '', balance: 1 });
    expect(await wallet(me.id)).toMatchObject({ balance_games: '400', prizes_games: '0' });
  });

  it('BALANCE: saldo de games em reais; jogador desconhecido = INVALID_USER', async () => {
    const me = await player();
    await creditGames(me.id, 1234);
    const res = await webhook({ type: 'BALANCE', user_code: me.code });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ msg: '', balance: 12.34 });
    const unknown = await webhook({ type: 'BALANCE', user_code: '2147483000 Ninguém - Banca' });
    expect([unknown.status, unknown.body]).toEqual([404, { msg: 'INVALID_USER', balance: 0 }]);
    expect((await webhook({ type: 'BALANCE', user_code: me.id })).status).toBe(404);
    expect((await webhook({ type: 'BALANCE', user_code: '99999999999 X - Y' })).status).toBe(404);
    expect((await webhook({ type: 'BALANCE', user_code: '0123 X - Y' })).status).toBe(404);
  });

  it('rodada: aposta sai do saldo de games e depois dos prêmios; prêmio entra nos prêmios; extrato registra', async () => {
    const me = await player();
    const operator = await creditGames(me.id, 1000);

    const first = await round(me.code, { bet: 4, win: 7.5 });
    expect([first.status, first.body]).toEqual([200, { msg: '', balance: 13.5 }]);
    expect(await wallet(me.id)).toEqual({ balance_games: '600', bonus_games: '0', prizes_games: '750' });

    const second = await round(me.code, { bet: 10, win: 0, txn_type: 'debit' });
    expect(second.body).toEqual({ msg: '', balance: 3.5 });
    expect(await wallet(me.id)).toEqual({ balance_games: '0', bonus_games: '0', prizes_games: '350' });

    const today = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
    const statement = await operator.http.get(`/v1/admin/users/${me.id}/statement?from=${today}&to=${today}`);
    expect(statement.status).toBe(200);
    const items = (statement.body as { items: Array<{ kind: string; gamesCents: number }> }).items;
    expect(items.filter((i) => i.kind === 'CASINO').map((i) => i.gamesCents)).toEqual([-1000, 350]);
  });

  it('a mesma rodada repetida não aplica de novo; o mesmo txn_id com outro valor é recusado', async () => {
    const me = await player();
    await creditGames(me.id, 1000);
    const txn = `t-${randomUUID()}`;
    const results = await Promise.all([1, 2, 3].map(() => round(me.code, { txn_id: txn, bet: 2, win: 0 })));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(results.map((r) => (r.body as { balance: number }).balance)).toEqual([8, 8, 8]);
    expect(await wallet(me.id)).toMatchObject({ balance_games: '800' });
    const reused = await round(me.code, { txn_id: txn, bet: 3 });
    expect([reused.status, reused.body]).toEqual([500, { msg: 'ERROR_INTERNAL', balance: 0 }]);
    const { rows } = await asTenant(migratorPool, auroraId, (c) =>
      c.query('SELECT count(*)::int AS n FROM casino_transactions WHERE txn_id = $1', [txn]),
    );
    expect(rows[0]).toEqual({ n: 1 });
  });

  it('saldo insuficiente, jogador bloqueado e rodada fora do formato', async () => {
    const me = await player();
    await creditGames(me.id, 100);
    const poor = await round(me.code, { bet: 1.01 });
    expect([poor.status, poor.body]).toEqual([400, { msg: 'INSUFFICIENT_USER_FUNDS', balance: 0 }]);
    expect(await wallet(me.id)).toMatchObject({ balance_games: '100' });

    expect((await round(me.code, { bet: -1 })).status).toBe(500);
    expect((await round(me.code, { txn_type: 'refund' })).status).toBe(500);
    expect((await round(me.code, { txn_id: 'com espaço' })).status).toBe(500);
    expect((await webhook({ type: 'OUTRO', user_code: me.code })).status).toBe(500);

    const operator = await loginOperator(app, 'aurora');
    await operator.http.patch(`/v1/admin/users/${me.id}/status`, { status: 'BLOCKED' });
    expect((await round(me.code, { bet: 0.5 })).status).toBe(404);
    // Prêmio é do jogador mesmo bloqueado.
    expect((await round(me.code, { bet: 0, win: 2, txn_type: 'credit' })).body).toEqual({ msg: '', balance: 3 });
  });

  it('Top ganhos: maiores prêmios da banca com o nome mascarado; outra banca não aparece', async () => {
    const me = await player();
    await creditGames(me.id, 1000);
    await round(me.code, { bet: 1, win: 3, game_code: '100' });
    await round(me.code, { bet: 1, win: 103, game_code: '102' });
    await round(me.code, { bet: 1, win: 0, game_code: '103' });

    const lobby = (await me.http.get('/v1/casino/lobby')).body as CasinoLobby;
    const suffix = String(me.displayId).slice(-2).padStart(2, '0');
    expect(lobby.topWins.map((w) => [w.playerLabel, w.game.name, w.winCents])).toEqual([
      [`Gustavo***${suffix}`, 'Fortune Sintético 3', 10300],
      [`Gustavo***${suffix}`, 'Fortune Sintético 1', 300],
    ]);

    const other = await player('boreal');
    expect(((await other.http.get('/v1/casino/lobby')).body as CasinoLobby).topWins).toEqual([]);
  });
});

describe('user_code', () => {
  it('"<ID> <primeiro nome> - <banca>", sem acento nem símbolo, com tamanho limitado', () => {
    expect(casinoUserCode(10000, 'Carlos Eduardo da Silva', 'Trevo da Sorte')).toBe('10000 Carlos - Trevo da Sorte');
    expect(casinoUserCode(7, '  José  ', 'Banca São João & Cia')).toBe('7 Jose - Banca Sao Joao Cia');
    expect(casinoUserCode(7, '<script>', '')).toBe('7 script - Banca');
    expect(casinoUserCode(7, '***', 'B'.repeat(80))).toBe(`7 Jogador - ${'B'.repeat(40)}`);
  });

  it('lê só o ID do início', () => {
    expect(displayIdFromUserCode('10000 Carlos - Trevo da Sorte')).toBe(10000);
    expect(displayIdFromUserCode('10000')).toBe(10000);
    expect(displayIdFromUserCode('10000abc')).toBeNull();
    expect(displayIdFromUserCode('0 X')).toBeNull();
    expect(displayIdFromUserCode('2147483648 X')).toBeNull();
    expect(displayIdFromUserCode(' 10000 X')).toBeNull();
  });
});

describe('valores', () => {
  it('reais -> centavos sem erro de ponto flutuante', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents('12.345')).toBe(1235);
    expect(toCents(-0.01)).toBeNull();
    expect(toCents('abc')).toBeNull();
    expect(toCents(Number.POSITIVE_INFINITY)).toBeNull();
    expect(toCents(1_000_000_001)).toBeNull();
    expect(digestKey('a')).toHaveLength(32);
  });
});
