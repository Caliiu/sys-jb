import { Controller, Get, Header, Inject, Param, Query, UseGuards } from '@nestjs/common';
import type { AdminPlayerStatement } from '@sysjb/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { userIdSchema } from '../users/user.schemas.js';
import { type PlayerStatementQuery, playerStatementQuerySchema } from './admin.schemas.js';
import { ConsoleGuard } from './console.guard.js';
import { OperatorGuard, RequirePermission } from './operator.guard.js';
import { PlayerStatementService } from './player-statement.service.js';

/** Extrato da carteira de um apostador da banca: só consulta, com `users.read` (quem vê o apostador vê o extrato). */
@Controller('v1/admin/users')
@UseGuards(ConsoleGuard, OperatorGuard)
export class PlayerStatementController {
  constructor(@Inject(PlayerStatementService) private readonly statements: PlayerStatementService) {}

  @Get(':id/statement')
  @RequirePermission('users.read')
  @Header('Cache-Control', 'no-store')
  get(
    @CurrentTenant() tenant: ResolvedTenant,
    @Param('id', new ZodValidationPipe(userIdSchema)) id: string,
    @Query(new ZodValidationPipe(playerStatementQuerySchema)) query: PlayerStatementQuery,
  ): Promise<AdminPlayerStatement> {
    return this.statements.statement(tenant, id, query);
  }
}
