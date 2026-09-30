import { Controller, Get, Header, Inject, Param, Query, UseGuards } from '@nestjs/common';
import type { AdminTicketDrawOption, AdminTicketList, AdminTicketListItem } from '@sysjb/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { type ListTicketsQuery, listTicketsQuerySchema, ticketNumberSchema } from './admin.schemas.js';
import { ConsoleGuard } from './console.guard.js';
import { OperatorGuard, RequirePermission } from './operator.guard.js';
import { TicketsAdminService } from './tickets-admin.service.js';

/** Bilhetes (pules) da banca do operador: só consulta, com `tickets.read`. */
@Controller('v1/admin/tickets')
@UseGuards(ConsoleGuard, OperatorGuard)
export class TicketsAdminController {
  constructor(@Inject(TicketsAdminService) private readonly tickets: TicketsAdminService) {}

  @Get()
  @RequirePermission('tickets.read')
  @Header('Cache-Control', 'no-store')
  list(
    @CurrentTenant() tenant: ResolvedTenant,
    @Query(new ZodValidationPipe(listTicketsQuerySchema)) query: ListTicketsQuery,
  ): Promise<AdminTicketList> {
    return this.tickets.list(tenant, query);
  }

  /** Declarada antes de `:number`. */
  @Get('draw-options')
  @RequirePermission('tickets.read')
  @Header('Cache-Control', 'no-store')
  drawOptions(@CurrentTenant() tenant: ResolvedTenant): Promise<AdminTicketDrawOption[]> {
    return this.tickets.drawOptions(tenant);
  }

  /** Bilhete pelo número (0 a 2 itens: Loterias e Fazendinha têm numerações próprias). */
  @Get(':number')
  @RequirePermission('tickets.read')
  @Header('Cache-Control', 'no-store')
  search(
    @CurrentTenant() tenant: ResolvedTenant,
    @Param('number', new ZodValidationPipe(ticketNumberSchema)) puleNumber: number,
  ): Promise<AdminTicketListItem[]> {
    return this.tickets.search(tenant, puleNumber);
  }
}
