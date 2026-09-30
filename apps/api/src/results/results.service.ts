import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type LotteryResultsResponse,
  type PublicLotteryResult,
  compareResults,
  resultFullPrizes,
  resultLotteryName,
} from '@sysjb/contracts';
import { AppError } from '../common/app-error.js';
import { DatabaseService } from '../database/database.service.js';
import { type NormalizedResult, normalizeWebhook } from './result-normalizer.js';
import { type StoreOutcome, storeResult } from './results.store.js';

/** Resposta ao provedor, no formato da documentação dele ({ codigo, mensagem }). */
export interface WebhookAck {
  codigo: 200 | 201;
  mensagem: string;
}

export const resultKey = (r: Pick<NormalizedResult, 'date' | 'lottery' | 'extraction'>) =>
  `${r.lottery} ${r.date} ${String(r.extraction).padStart(2, '0')}h`;

/**
 * Resultados das loterias (globais, sem banca). Recebimento pelo webhook do provedor e leitura para o jogador.
 * A consulta ativa ao provedor fica no script results:fetch (usa o mesmo storeResult).
 */
@Injectable()
export class ResultsService {
  private readonly logger = new Logger('Results');

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  /**
   * Resultado enviado pelo provedor. Inválido = 422 (o provedor reenvia até receber 200/201). Repetido = 200 sem
   * alterar nada; diferente do gravado = correção (nova revisão, a anterior fica no histórico).
   */
  async receiveWebhook(body: unknown): Promise<WebhookAck> {
    const normalized = normalizeWebhook(body, new Date().toISOString());
    if (!normalized.ok) {
      this.logger.warn(`webhook recusado: ${normalized.issues.map((i) => i.field).join(', ')}`);
      throw new AppError(422, 'VALIDATION_ERROR', 'Resultado inválido.', normalized.issues);
    }
    const outcome = await storeResult(this.db.client, normalized.result, 'WEBHOOK');
    this.logOutcome(normalized.result, outcome);
    return outcome.status === 'created'
      ? { codigo: 201, mensagem: 'Resultado recebido e armazenado.' }
      : { codigo: 200, mensagem: 'Resultado recebido com sucesso.' };
  }

  private logOutcome(result: NormalizedResult, outcome: StoreOutcome): void {
    const key = resultKey(result);
    if (outcome.status === 'updated')
      this.logger.warn(`resultado ${key} corrigido pelo provedor (revisão ${outcome.revision})`);
    else if (outcome.status === 'created') this.logger.log(`resultado ${key} recebido`);
  }

  /** Resultados de um dia (data já conferida por quem chama), na ordem da tela. */
  async byDate(date: string): Promise<LotteryResultsResponse> {
    const rows = await this.db.client.lotteryResult.findMany({ where: { drawDate: new Date(`${date}T00:00:00Z`) } });
    const results: PublicLotteryResult[] = rows.map((row) => ({
      lottery: row.lottery,
      lotteryName: resultLotteryName(row.lottery, row.extraction),
      extraction: row.extraction,
      // 6º e 7º calculados da soma e da multiplicação nas loterias de 7 prêmios.
      prizes: resultFullPrizes({
        lottery: row.lottery,
        extraction: row.extraction,
        prizes: row.prizes,
        sum: row.sumValue,
        multiplication: row.multiplication,
      }),
      sum: row.sumValue,
      multiplication: row.multiplication,
      skipped: row.skipped,
      super5: row.super5,
      updatedAt: row.updatedAt.toISOString(),
    }));
    return { date, results: results.sort(compareResults) };
  }
}
