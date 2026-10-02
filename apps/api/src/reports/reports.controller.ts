import { Controller, Get, Header, HttpCode, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { BalanceReport, LotteryMovementReport, PuleDetail, PuleList } from '@sysjb/contracts';
import { CurrentSession, SessionGuard } from '../auth/session.guard.js';
import type { UserSession } from '../auth/session.types.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant, TenantGuard } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { puleNumberSchema, type ReportDateQuery, reportDateQuerySchema } from './reports.schemas.js';
import { ReportsService } from './reports.service.js';

/** Relatórios > Consultar saldo e Movimento loterias: sempre do jogador da sessão. */
@Controller('v1/me/reports')
@UseGuards(TenantGuard, SessionGuard)
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @Get('balance')
  @Header('Cache-Control', 'no-store')
  balance(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentSession() session: UserSession,
    @Query(new ZodValidationPipe(reportDateQuerySchema)) query: ReportDateQuery,
  ): Promise<BalanceReport> {
    return this.reports.balance(tenant, session, query.date);
  }

  @Get('lottery-movement')
  @Header('Cache-Control', 'no-store')
  lotteryMovement(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentSession() session: UserSession,
    @Query(new ZodValidationPipe(reportDateQuerySchema)) query: ReportDateQuery,
  ): Promise<LotteryMovementReport> {
    return this.reports.lotteryMovement(tenant, session, query.date);
  }
}

/** Relatórios > Consultar pule (por data e por código) e Cancelar pule: só as pules do jogador da sessão. */
@Controller('v1/me/pules')
@UseGuards(TenantGuard, SessionGuard)
export class PulesController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentSession() session: UserSession,
    @Query(new ZodValidationPipe(reportDateQuerySchema)) query: ReportDateQuery,
  ): Promise<PuleList> {
    return this.reports.pules(tenant, session, query.date);
  }

  @Get(':puleNumber')
  @Header('Cache-Control', 'no-store')
  detail(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentSession() session: UserSession,
    @Param('puleNumber', new ZodValidationPipe(puleNumberSchema)) puleNumber: number,
  ): Promise<PuleDetail> {
    return this.reports.pule(tenant, session, puleNumber);
  }

  /** Cancela a pule de Loterias do jogador (até o horário limite) e devolve o recibo atualizado. */
  @Post(':puleNumber/cancel')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  cancel(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentSession() session: UserSession,
    @Param('puleNumber', new ZodValidationPipe(puleNumberSchema)) puleNumber: number,
  ): Promise<PuleDetail> {
    return this.reports.cancelPule(tenant, session, puleNumber);
  }
}
