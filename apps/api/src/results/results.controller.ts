import { Body, Controller, Get, Header, HttpCode, Inject, Post, Query, Res, UseGuards } from '@nestjs/common';
import { type LotteryResultsResponse, RESULTS_DAYS_BACK, isReportDate } from '@sysjb/contracts';
import type { Response } from 'express';
import { SessionGuard } from '../auth/session.guard.js';
import { AppError } from '../common/app-error.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { type ReportDateQuery, reportDateQuerySchema } from '../reports/reports.schemas.js';
import { TenantGuard } from '../tenancy/tenant.guard.js';
import { ResultsWebhookGuard } from './results-webhook.guard.js';
import { ResultsService, type WebhookAck } from './results.service.js';

/**
 * Webhook do provedor de resultados (Loteria Integrada). Sem banca: o resultado vale para todas. A API não é exposta
 * à internet; o web repassa o POST público (/integracoes/resultados) para cá sem alterar corpo nem cabeçalhos do token.
 */
@Controller('v1/integrations/results')
@UseGuards(ResultsWebhookGuard)
export class ResultsWebhookController {
  constructor(@Inject(ResultsService) private readonly results: ResultsService) {}

  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async receive(@Body() body: unknown, @Res({ passthrough: true }) res: Response): Promise<WebhookAck> {
    const ack = await this.results.receiveWebhook(body);
    res.status(ack.codigo);
    return ack;
  }
}

/** Resultados para o jogador logado (tela Resultados > Resultado loterias): hoje e os 7 dias anteriores. */
@Controller('v1/results')
@UseGuards(TenantGuard, SessionGuard)
export class ResultsController {
  constructor(@Inject(ResultsService) private readonly results: ResultsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  byDate(@Query(new ZodValidationPipe(reportDateQuerySchema)) query: ReportDateQuery): Promise<LotteryResultsResponse> {
    if (!isReportDate(new Date().toISOString(), query.date, RESULTS_DAYS_BACK)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Payload inválido.', [
        { field: 'date', message: 'Data fora do período de consulta.' },
      ]);
    }
    return this.results.byDate(query.date);
  }
}
