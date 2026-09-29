import { Injectable } from '@nestjs/common';
import { isPrizeDate, type PrizeClaim, PRIZES_MAX_DAYS_BACK, type PrizesReport } from '@sysjb/contracts';
import type { UserSession } from '../auth/session.types.js';
import { AppError } from '../common/app-error.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';

@Injectable()
export class PrizesService {
  /**
   * Pules premiadas do jogador da sessão na data. Ainda não há apuração de resultados: nenhuma pule é
   * premiada, então a lista vem vazia. A janela de datas já é a definitiva (a mesma da tela).
   */
  async report(_tenant: ResolvedTenant, _session: UserSession, date: string): Promise<PrizesReport> {
    if (!isPrizeDate(new Date().toISOString(), date)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Consulte de hoje até ${PRIZES_MAX_DAYS_BACK} dias atrás.`, [
        { field: 'date', message: 'Data fora do período de consulta.' },
      ]);
    }
    return { date, tickets: [], totalPrizeCents: 0 };
  }

  /**
   * Reclame: situação do prêmio de uma pule do jogador da sessão. Sem apuração, nenhum prêmio foi pago; e a
   * resposta nunca distingue pule inexistente, de outro jogador ou sem prêmio (não serve para sondar pules).
   */
  async claim(_tenant: ResolvedTenant, _session: UserSession, _puleNumber: number): Promise<PrizeClaim> {
    return { status: 'not_found' };
  }
}
