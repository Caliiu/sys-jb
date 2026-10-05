import { Inject, Injectable } from '@nestjs/common';
import {
  type FazendinhaModeId,
  MAX_PULE_NUMBER,
  type PrizeClaim,
  type PrizeTicket,
  type PrizeTicketItem,
  PRIZES_MAX_DAYS_BACK,
  type PrizesReport,
  drawDateOf,
  fazendinhaPrizeLabel,
  isPrizeDate,
  lotteryPrizeLabel,
} from '@sysjb/contracts';
import type { UserSession } from '../auth/session.types.js';
import { AppError } from '../common/app-error.js';
import { DatabaseService } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';

/** Item premiado como gravado pela apuração (pule_prizes.items). */
interface StoredItem {
  position: number;
  guesses: string[];
  prizeCents: number;
}

const storedItems = (items: unknown): StoredItem[] => (Array.isArray(items) ? (items as StoredItem[]) : []);

@Injectable()
export class PrizesService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  /**
   * Pules premiadas do jogador da sessão na data do jogo, na ordem da extração (hora) e do pule, com os itens premiados
   * como no comprovante. Só aparecem depois de pagas (a apuração espera a carência do resultado).
   */
  report(tenant: ResolvedTenant, session: UserSession, date: string): Promise<PrizesReport> {
    if (!isPrizeDate(new Date().toISOString(), date)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Consulte de hoje até ${PRIZES_MAX_DAYS_BACK} dias atrás.`, [
        { field: 'date', message: 'Data fora do período de consulta.' },
      ]);
    }
    const owner = { tenantId: tenant.id, userId: session.userId };

    return this.db.withTenant(tenant.id, async (tx) => {
      const prizes = await tx.pulePrize.findMany({
        where: { ...owner, drawDate: new Date(`${date}T00:00:00Z`) },
        orderBy: [{ drawHour: 'asc' }, { puleNumber: 'asc' }],
      });
      const numbersOf = (game: string) => prizes.filter((p) => p.game === game).map((p) => p.puleNumber);
      const [tickets, bets] = await Promise.all([
        tx.lotteryTicket.findMany({
          where: { ...owner, puleNumber: { in: numbersOf('lotteries') } },
          select: {
            puleNumber: true,
            items: { select: { position: true, modality: true, placement: true, amountCents: true } },
          },
        }),
        tx.fazendinhaBet.findMany({
          where: { ...owner, puleNumber: { in: numbersOf('fazendinha') } },
          select: { puleNumber: true, mode: true, stakeCents: true },
        }),
      ]);
      const ticketItems = new Map(tickets.map((t) => [t.puleNumber, t.items]));
      const betOf = new Map(bets.map((b) => [b.puleNumber, b]));

      const result: PrizeTicket[] = prizes.map((prize) => {
        const items: PrizeTicketItem[] = storedItems(prize.items).map((stored) => {
          if (prize.game === 'fazendinha') {
            const bet = betOf.get(prize.puleNumber);
            const mode = (bet?.mode.toLowerCase() ?? 'grupo') as FazendinhaModeId;
            return {
              label: fazendinhaPrizeLabel(mode, bet?.stakeCents ?? 0),
              amountCents: bet?.stakeCents ?? 0,
              prizeCents: stored.prizeCents,
              guesses: stored.guesses,
            };
          }
          const item = ticketItems.get(prize.puleNumber)?.find((i) => i.position === stored.position);
          return {
            label: item ? lotteryPrizeLabel(item.modality, item.placement) : `ITEM ${stored.position}`,
            amountCents: Number(item?.amountCents ?? 0n),
            prizeCents: stored.prizeCents,
            guesses: stored.guesses,
          };
        });
        return {
          puleNumber: prize.puleNumber,
          lottery: prize.lottery,
          hour: prize.drawHour,
          items,
          prizeCents: Number(prize.prizeCents),
        };
      });
      return { date, tickets: result, totalPrizeCents: result.reduce((sum, t) => sum + t.prizeCents, 0) };
    });
  }

  /**
   * Reclame: situação do prêmio de uma pule do jogador da sessão ("pago em" = dia da apuração, em Brasília). A resposta
   * nunca distingue pule inexistente, de outro jogador, ainda não apurada ou sem prêmio (não serve para sondar pules).
   */
  async claim(tenant: ResolvedTenant, session: UserSession, puleNumber: number): Promise<PrizeClaim> {
    // O número da pule é integer no banco: acima disso, a pule não existe.
    if (puleNumber > MAX_PULE_NUMBER) return { status: 'not_found' };
    const prize = await this.db.withTenant(tenant.id, (tx) =>
      tx.pulePrize.findFirst({
        where: { tenantId: tenant.id, userId: session.userId, puleNumber },
        select: { settledAt: true },
      }),
    );
    return prize ? { status: 'paid', paidOn: drawDateOf(prize.settledAt.toISOString(), 0) } : { status: 'not_found' };
  }
}
