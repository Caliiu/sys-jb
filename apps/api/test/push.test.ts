import { createECDH, randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type LoginResponse,
  type PushPayload,
  type SaveDrawRequest,
  defaultQuotes,
  drawDateOf,
  fazendinhaPrizeFrom,
} from '@sysjb/contracts';
import webpush, { WebPushError } from 'web-push';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadPushConfig } from '../src/push/push.config.js';
import { isAllowedPushEndpoint } from '../src/push/push.schemas.js';
import { PushService } from '../src/push/push.service.js';
import { ResultNotifier } from '../src/push/result-notifier.js';
import {
  api,
  asTenant,
  createUser,
  KEYS,
  loginOperator,
  migratorPool,
  resetUsers,
  RESULTS_WEBHOOK_TOKEN,
  runtimePool,
  startApp,
  SYNTHETIC_PASSWORD,
  tenantId,
} from './helpers.js';

const NOW = new Date().toISOString();
const day = (offset: number) => drawDateOf(NOW, offset);
const TODAY = day(0);

const VAPID = webpush.generateVAPIDKeys();
const PUSH = { publicKey: VAPID.publicKey, privateKey: VAPID.privateKey, subject: 'mailto:suporte@exemplo.com' };

/** Inscrição como o navegador gera (chaves com o formato real). */
function deviceSubscription(endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`) {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    endpoint,
    keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') },
  };
}

/** Envios capturados pelo envio falso (o endpoint de verdade é sempre de um serviço externo). */
let sent: Array<{ endpoint: string; payload: PushPayload; ttl: number | undefined }> = [];
/** Endpoints que o "serviço de push" dá como expirados (410). */
const expired = new Set<string>();

let app: INestApplication;
let pushApp: INestApplication;
let auroraId: string;

beforeAll(async () => {
  app = await startApp();
  pushApp = await startApp({ push: PUSH });
  pushApp.get(PushService).sender = async (subscription, body, options) => {
    if (expired.has(subscription.endpoint)) {
      throw new WebPushError('Gone', 410, {}, '', subscription.endpoint);
    }
    sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(body) as PushPayload, ttl: options.TTL });
  };
  auroraId = await tenantId('aurora');
});
afterAll(async () => {
  await Promise.all([app.close(), pushApp.close()]);
  await Promise.all([migratorPool.end(), runtimePool.end()]);
});
beforeEach(async () => {
  await resetUsers();
  sent = [];
  expired.clear();
});

async function player(target: INestApplication = pushApp, tenant: 'aurora' | 'boreal' = 'aurora') {
  const person = await createUser(target, tenant);
  const login = await api(target, tenant).post('/v1/auth/login', {
    document: person.document,
    password: SYNTHETIC_PASSWORD,
  });
  return {
    id: person.id,
    http: api(target, tenant, KEYS[tenant], { 'X-Session-Token': (login.body as LoginResponse).token }),
  };
}

const subscriptions = async () =>
  (
    await asTenant(migratorPool, auroraId, (c) =>
      c.query<{ user_id: string; endpoint: string }>(
        'SELECT user_id, endpoint FROM push_subscriptions ORDER BY endpoint',
      ),
    )
  ).rows;

describe('configuração das notificações', () => {
  it('sem chaves fica desligada; chave inválida ou contato inválido não sobem (sem mostrar a chave)', () => {
    expect(loadPushConfig({})).toBeNull();
    const env = {
      WEB_PUSH_VAPID_PUBLIC_KEY: VAPID.publicKey,
      WEB_PUSH_VAPID_PRIVATE_KEY: VAPID.privateKey,
      WEB_PUSH_SUBJECT: 'mailto:suporte@exemplo.com',
    };
    expect(loadPushConfig(env)).toEqual(PUSH);
    expect(loadPushConfig({ ...env, WEB_PUSH_SUBJECT: 'https://banca.exemplo.com' })).not.toBeNull();
    expect(() => loadPushConfig({ ...env, WEB_PUSH_VAPID_PRIVATE_KEY: '' })).toThrow(/PRIVATE_KEY/);
    expect(() => loadPushConfig({ ...env, WEB_PUSH_VAPID_PUBLIC_KEY: 'abc' })).toThrow(/PUBLIC_KEY/);
    expect(() => loadPushConfig({ ...env, WEB_PUSH_SUBJECT: 'suporte@exemplo.com' })).toThrow(/SUBJECT/);
    try {
      loadPushConfig({ ...env, WEB_PUSH_VAPID_PRIVATE_KEY: `${VAPID.privateKey}xx` });
    } catch (error) {
      expect((error as Error).message).not.toContain(VAPID.privateKey);
    }
  });

  it('só serviços de push conhecidos, em HTTPS, porta padrão e sem credenciais', () => {
    for (const ok of [
      'https://fcm.googleapis.com/fcm/send/abc',
      'https://web.push.apple.com/QK2k',
      'https://updates.push.services.mozilla.com/wpush/v2/x',
      'https://wns2-bl2p.notify.windows.com/w/?token=x',
    ]) {
      expect(isAllowedPushEndpoint(ok), ok).toBe(true);
    }
    for (const bad of [
      'http://fcm.googleapis.com/fcm/send/abc',
      'https://fcm.googleapis.com:8443/fcm/send/abc',
      'https://user:pw@fcm.googleapis.com/x',
      'https://127.0.0.1/x',
      'https://localhost/x',
      'https://169.254.169.254/latest/meta-data',
      'https://fcm.googleapis.com.evil.com/x',
      'https://evilpush.services.mozilla.com.evil.com/x',
      'https://notify.windows.com.evil.com/x',
      'nao-e-url',
    ]) {
      expect(isAllowedPushEndpoint(bad), bad).toBe(false);
    }
  });
});

describe('/v1/me/push-subscriptions', () => {
  it('exige sessão; notificações desligadas = 503', async () => {
    expect((await api(pushApp, 'aurora').post('/v1/me/push-subscriptions', deviceSubscription())).status).toBe(401);
    const off = await player(app);
    const res = await off.http.post('/v1/me/push-subscriptions', deviceSubscription());
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('recusa endpoint fora dos serviços de push e chaves fora do formato', async () => {
    const { http } = await player();
    const valid = deviceSubscription();
    for (const body of [
      { ...valid, endpoint: 'https://127.0.0.1/push' },
      { ...valid, endpoint: 'http://fcm.googleapis.com/fcm/send/x' },
      { ...valid, keys: { ...valid.keys, p256dh: 'curta' } },
      { ...valid, keys: { ...valid.keys, auth: randomBytes(8).toString('base64url') } },
      { ...valid, extra: true },
      { endpoint: valid.endpoint },
    ]) {
      expect((await http.post('/v1/me/push-subscriptions', body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(await subscriptions()).toEqual([]);
  });

  it('inscreve, renova sem duplicar e passa o aparelho para a conta que entrou nele', async () => {
    const first = await player();
    const device = deviceSubscription();
    expect((await first.http.post('/v1/me/push-subscriptions', device)).status).toBe(204);
    expect((await first.http.post('/v1/me/push-subscriptions', device)).status).toBe(204);
    expect(await subscriptions()).toEqual([{ user_id: first.id, endpoint: device.endpoint }]);

    const second = await player();
    expect((await second.http.post('/v1/me/push-subscriptions', device)).status).toBe(204);
    expect(await subscriptions()).toEqual([{ user_id: second.id, endpoint: device.endpoint }]);
  });

  it('no máximo 10 aparelhos por jogador: os mais antigos saem', async () => {
    const { http } = await player();
    const devices = Array.from({ length: 11 }, (_, i) =>
      deviceSubscription(`https://fcm.googleapis.com/fcm/send/aparelho-${String(i).padStart(2, '0')}`),
    );
    for (const device of devices) expect((await http.post('/v1/me/push-subscriptions', device)).status).toBe(204);
    const kept = (await subscriptions()).map((s) => s.endpoint);
    expect(kept).toHaveLength(10);
    expect(kept).not.toContain(devices[0]!.endpoint);
  });

  it('sair tira só o próprio aparelho; outra banca não vê nem mexe', async () => {
    const owner = await player();
    const other = await player();
    const device = deviceSubscription();
    await owner.http.post('/v1/me/push-subscriptions', device);

    const boreal = await player(pushApp, 'boreal');
    expect((await boreal.http.delete('/v1/me/push-subscriptions').send({ endpoint: device.endpoint })).status).toBe(
      204,
    );
    expect((await other.http.delete('/v1/me/push-subscriptions').send({ endpoint: device.endpoint })).status).toBe(204);
    expect(await subscriptions()).toHaveLength(1);

    expect((await owner.http.delete('/v1/me/push-subscriptions').send({ endpoint: device.endpoint })).status).toBe(204);
    expect(await subscriptions()).toEqual([]);
  });
});

describe('aviso de "resultado saiu"', () => {
  /** Sorteio que só fecha às 23:58, ligado ao Rio 21h: dá para apostar para hoje a qualquer hora do teste. */
  const LATE_DRAW: SaveDrawRequest = {
    group: 'TESTE',
    name: 'LT TESTE PUSH',
    code: '',
    drawTime: '23:59',
    closesAt: '23:58',
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    games: ['lotteries', 'fazendinha'],
    result: { lottery: 'rj', extraction: 21 },
    active: true,
    sortOrder: 9000,
  };

  async function bettor() {
    const person = await player();
    await asTenant(migratorPool, auroraId, (c) =>
      c.query('SELECT wallet_manual_adjust($1, $2, 0, 0, $3)', [person.id, 10_000, 'crédito de teste']),
    );
    const bet = await person.http.post('/v1/fazendinha/bets', {
      idempotencyKey: randomUUID(),
      drawDate: TODAY,
      lottery: LATE_DRAW.name,
      hour: 23,
      mode: 'grupo',
      stakeCents: 100,
      prizeCents: fazendinhaPrizeFrom(defaultQuotes(), 'grupo', 100),
      numbers: [7],
    });
    expect(bet.status).toBe(201);
    return person;
  }

  const webhook = (date = TODAY) =>
    api(pushApp, 'aurora').raw().post('/v1/integrations/results').set({ 'X-Auth-Token': RESULTS_WEBHOOK_TOKEN }).send({
      res_data: date,
      res_extracao: '21',
      res_loteria: 'rj',
      primeiro_premio: '9423',
      segundo_premio: '1254',
      terceiro_premio: '9751',
      quarto_premio: '4571',
      quinto_premio: '0325',
    });

  let drawId: string;
  beforeEach(async () => {
    const operator = await loginOperator(pushApp, 'aurora');
    const created = await operator.http.post('/v1/admin/draws', LATE_DRAW);
    expect(created.status).toBe(201);
    drawId = (created.body as { draws: Array<{ id: string; name: string }> }).draws.find(
      (d) => d.name === LATE_DRAW.name,
    )!.id;
  });

  it('avisa quem apostou no sorteio ligado ao resultado, uma vez, abrindo o resultado', async () => {
    const winner = await bettor();
    const device = deviceSubscription();
    await winner.http.post('/v1/me/push-subscriptions', device);
    // Inscrito sem aposta e jogador de outra banca: nada.
    const idle = await player();
    await idle.http.post('/v1/me/push-subscriptions', deviceSubscription());
    const boreal = await player(pushApp, 'boreal');
    await boreal.http.post('/v1/me/push-subscriptions', deviceSubscription());

    expect((await webhook()).status).toBe(201);
    await pushApp.get(ResultNotifier).idle();
    expect(sent).toEqual([
      {
        endpoint: device.endpoint,
        ttl: 21_600,
        payload: {
          title: 'Resultado saiu',
          body: `LT TESTE PUSH de ${TODAY.slice(8, 10)}/${TODAY.slice(5, 7)}. Toque para conferir.`,
          url: `/resultados/loterias/${TODAY}/resultado?sorteios=${drawId}`,
          tag: `result:${drawId}:${TODAY}`,
        },
      },
    ]);

    // Reenvio igual do provedor não avisa de novo.
    expect((await webhook()).status).toBe(200);
    await pushApp.get(ResultNotifier).idle();
    expect(sent).toHaveLength(1);
  });

  it('aparelho expirado (410) sai da lista; resultado de antes de ontem não avisa', async () => {
    const winner = await bettor();
    const device = deviceSubscription();
    await winner.http.post('/v1/me/push-subscriptions', device);
    expired.add(device.endpoint);

    await webhook();
    await pushApp.get(ResultNotifier).idle();
    expect(sent).toEqual([]);
    expect(await subscriptions()).toEqual([]);

    await winner.http.post('/v1/me/push-subscriptions', deviceSubscription());
    await webhook(day(-2));
    await pushApp.get(ResultNotifier).idle();
    expect(sent).toEqual([]);
  });

  it('notificações desligadas: o webhook segue igual e nada é enviado', async () => {
    const res = await api(app, 'aurora')
      .raw()
      .post('/v1/integrations/results')
      .set({ 'X-Auth-Token': RESULTS_WEBHOOK_TOKEN })
      .send({
        res_data: TODAY,
        res_extracao: '21',
        res_loteria: 'rj',
        primeiro_premio: '9423',
        segundo_premio: '1254',
        terceiro_premio: '9751',
        quarto_premio: '4571',
        quinto_premio: '0325',
      });
    expect(res.status).toBe(201);
    expect(sent).toEqual([]);
  });
});
