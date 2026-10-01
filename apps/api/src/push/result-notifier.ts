import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { type ResultSource, drawDateOf, resultsViewPath } from '@sysjb/contracts';
import { DatabaseService } from '../database/database.service.js';
import { PushService } from './push.service.js';

export interface ArrivedResult extends ResultSource {
  /** YYYY-MM-DD (Brasília). */
  date: string;
}

/** "2026-10-01" -> "01/10". */
const dayMonth = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/**
 * "Resultado saiu": quando chega o resultado de uma extração, avisa quem apostou (Loterias ou Fazendinha) nos sorteios
 * ligados a ela, em cada banca. Uma notificação por jogador e sorteio, que abre o resultado. Roda depois de gravar o
 * resultado, em segundo plano: quem chamou não espera e falha aqui não volta para ele. Resultado de antes de ontem
 * (recuperação atrasada) não avisa.
 */
@Injectable()
export class ResultNotifier implements OnApplicationShutdown {
  private readonly logger = new Logger('Push');
  private readonly pending = new Set<Promise<void>>();

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(PushService) private readonly push: PushService,
  ) {}

  /** Agenda os avisos do resultado e volta na hora. */
  resultArrived(result: ArrivedResult): void {
    if (!this.push.enabled) return;
    const task = this.notify(result)
      .catch((error: unknown) => {
        this.logger.error(`avisos do resultado ${result.lottery} ${result.date} falharam: ${(error as Error).message}`);
      })
      .finally(() => this.pending.delete(task));
    this.pending.add(task);
  }

  /** Espera os avisos em andamento (desligamento da API e testes). */
  async idle(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.idle();
  }

  private async notify(result: ArrivedResult): Promise<void> {
    const now = new Date().toISOString();
    if (result.date > drawDateOf(now, 0) || result.date < drawDateOf(now, -1)) return;
    const drawDate = new Date(`${result.date}T00:00:00Z`);

    const tenants = await this.db.client.tenant.findMany({ where: { active: true }, select: { id: true } });
    let delivered = 0;
    for (const { id: tenantId } of tenants) {
      const audiences = await this.db.withTenant(tenantId, async (tx) => {
        const draws = await tx.draw.findMany({
          where: { tenantId, resultLottery: result.lottery, resultExtraction: result.extraction },
          select: { id: true, name: true, drawMinutes: true },
        });
        return Promise.all(
          draws.map(async (draw) => {
            const where = { tenantId, lottery: draw.name, drawHour: Math.floor(draw.drawMinutes / 60), drawDate };
            const [tickets, bets] = await Promise.all([
              tx.lotteryTicket.findMany({ where, select: { userId: true }, distinct: ['userId'] }),
              tx.fazendinhaBet.findMany({ where, select: { userId: true }, distinct: ['userId'] }),
            ]);
            return { draw, userIds: [...new Set([...tickets, ...bets].map((row) => row.userId))] };
          }),
        );
      });

      for (const { draw, userIds } of audiences) {
        delivered += await this.push.sendToUsers(tenantId, userIds, {
          title: 'Resultado saiu',
          body: `${draw.name} de ${dayMonth(result.date)}. Toque para conferir.`,
          url: resultsViewPath(result.date, [draw.id]),
          tag: `result:${draw.id}:${result.date}`,
        });
      }
    }
    if (delivered > 0) {
      this.logger.log(`resultado ${result.lottery} ${result.date}: ${delivered} aviso(s) enviado(s)`);
    }
  }
}
