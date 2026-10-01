import { Inject, Injectable, Logger } from '@nestjs/common';
import { PUSH_LIMITS, type PushPayload } from '@sysjb/contracts';
import webpush, { type PushSubscription as WebPushSubscription, WebPushError } from 'web-push';
import type { UserSession } from '../auth/session.types.js';
import { AppError } from '../common/app-error.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DatabaseService } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { type PushSubscriptionInput, isAllowedPushEndpoint } from './push.schemas.js';

/** Envio de uma notificação para um aparelho; `statusCode` da recusa do serviço de push (WebPushError). */
export type PushSender = (
  subscription: WebPushSubscription,
  body: string,
  options: webpush.RequestOptions,
) => Promise<unknown>;

/** Envios simultâneos por lote (os serviços de push aceitam bem, sem abrir conexões demais). */
const CONCURRENCY = 8;
/** Notificação velha não serve: o serviço de push descarta se o aparelho ficar offline mais que isso. */
const TTL_SECONDS = 6 * 60 * 60;
const SEND_TIMEOUT_MS = 10_000;

/** Host do serviço de push, para o log (o endpoint inteiro identifica o aparelho e não vai para o log). */
const hostOf = (endpoint: string) => {
  try {
    return new URL(endpoint).hostname;
  } catch {
    return '?';
  }
};

/**
 * Notificações Web Push do app instalado: inscrição do aparelho (jogador logado) e envio. Desligadas (sem WEB_PUSH_*):
 * a inscrição responde 503 e nada é enviado. Envio é "melhor esforço": falha de um aparelho não afeta os outros nem
 * quem pediu o envio; inscrição expirada (404/410 do serviço de push) é apagada.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger('Push');
  /** Trocável nos testes (o endpoint de verdade é sempre de um serviço de push externo). */
  sender: PushSender = (subscription, body, options) => webpush.sendNotification(subscription, body, options);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  get enabled(): boolean {
    return this.config.push !== null;
  }

  /**
   * Inscreve (ou renova) o aparelho para o jogador da sessão. O mesmo aparelho com outra conta passa a ser dela. Acima
   * de PUSH_LIMITS.maxPerUser aparelhos, os mais antigos (sem uso) saem.
   */
  async subscribe(tenant: ResolvedTenant, session: UserSession, input: PushSubscriptionInput): Promise<void> {
    if (!this.enabled) throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Notificações indisponíveis.');
    await this.db.withTenant(tenant.id, async (tx) => {
      const now = new Date();
      await tx.pushSubscription.upsert({
        where: { tenantId_endpoint: { tenantId: tenant.id, endpoint: input.endpoint } },
        create: {
          tenantId: tenant.id,
          userId: session.userId,
          endpoint: input.endpoint,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
        },
        update: { userId: session.userId, p256dh: input.keys.p256dh, auth: input.keys.auth, lastSeenAt: now },
      });
      const extra = await tx.pushSubscription.findMany({
        where: { tenantId: tenant.id, userId: session.userId },
        orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
        skip: PUSH_LIMITS.maxPerUser,
        select: { id: true },
      });
      if (extra.length > 0) {
        await tx.pushSubscription.deleteMany({ where: { tenantId: tenant.id, id: { in: extra.map((s) => s.id) } } });
      }
    });
  }

  /** Tira o aparelho do jogador da sessão (sair da conta). Endpoint de outro jogador ou inexistente: nada muda. */
  async unsubscribe(tenant: ResolvedTenant, session: UserSession, endpoint: string): Promise<void> {
    await this.db.withTenant(tenant.id, (tx) =>
      tx.pushSubscription.deleteMany({ where: { tenantId: tenant.id, userId: session.userId, endpoint } }),
    );
  }

  /** Envia a mesma notificação para todos os aparelhos dos jogadores. Devolve quantos aparelhos receberam. */
  async sendToUsers(tenantId: string, userIds: readonly string[], payload: PushPayload): Promise<number> {
    const push = this.config.push;
    if (!push || userIds.length === 0) return 0;
    const subscriptions = await this.db.withTenant(tenantId, (tx) =>
      tx.pushSubscription.findMany({
        where: { tenantId, userId: { in: [...new Set(userIds)] } },
        select: { id: true, endpoint: true, p256dh: true, auth: true },
      }),
    );

    const body = JSON.stringify(payload);
    const options: webpush.RequestOptions = {
      vapidDetails: { subject: push.subject, publicKey: push.publicKey, privateKey: push.privateKey },
      TTL: TTL_SECONDS,
      urgency: 'normal',
      timeout: SEND_TIMEOUT_MS,
    };
    const gone: string[] = [];
    let delivered = 0;
    for (let i = 0; i < subscriptions.length; i += CONCURRENCY) {
      await Promise.all(
        subscriptions.slice(i, i + CONCURRENCY).map(async (sub) => {
          // Defesa extra: inscrição gravada antes de uma mudança na lista de serviços não recebe.
          if (!isAllowedPushEndpoint(sub.endpoint)) return void gone.push(sub.id);
          try {
            await this.sender({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, options);
            delivered += 1;
          } catch (error) {
            const status = error instanceof WebPushError ? error.statusCode : undefined;
            if (status === 404 || status === 410) gone.push(sub.id);
            else this.logger.warn(`envio recusado por ${hostOf(sub.endpoint)} (${status ?? 'sem resposta'})`);
          }
        }),
      );
    }
    if (gone.length > 0) {
      await this.db.withTenant(tenantId, (tx) =>
        tx.pushSubscription.deleteMany({ where: { tenantId, id: { in: gone } } }),
      );
    }
    return delivered;
  }
}
