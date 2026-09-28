import { Inject, Injectable } from '@nestjs/common';
import {
  type AdminDraw,
  type AdminDrawException,
  type AdminDrawsResponse,
  DRAW_GAMES,
  DRAW_MAX_DAY_OFFSET,
  type DrawGame,
  type DrawSchedule,
  type PublicDraw,
  type PublicDrawException,
  dayOffsetOf,
  drawDateOf,
  drawRunsOn,
  minutesToTime,
  timeToMinutes,
} from '@sysjb/contracts';
import type { Draw, DrawException } from '@sysjb/database';
import { recordAudit } from '../admin/audit.js';
import type { AuthenticatedOperator } from '../admin/operator.types.js';
import { AppError } from '../common/app-error.js';
import { hasSqlState, isUniqueViolation } from '../common/prisma-errors.js';
import { DatabaseService, type TenantTx } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import type { CreateDrawExceptionInput, SaveDrawInput } from './draws.schemas.js';

/** Trava do banco: a alteração deixaria apostas vendidas sem sorteio (ou o sorteio já tem apostas). */
const HAS_BETS_SQLSTATE = 'SJ005';

const invalid = (field: string, message: string) =>
  new AppError(400, 'VALIDATION_ERROR', 'Payload inválido.', [{ field, message }]);
const notFound = () => new AppError(404, 'NOT_FOUND', 'Sorteio não encontrado.');

/** Quanto à frente uma exceção pode ser cadastrada. */
const MAX_EXCEPTION_DAYS = 366;

const toDate = (date: string) => new Date(`${date}T00:00:00Z`);
const fromDate = (date: Date) => date.toISOString().slice(0, 10);

/** Campos do cadastro que entram na auditoria quando mudam. */
const FIELD_LABELS: Record<keyof SaveDrawInput, string> = {
  group: 'Grupo',
  name: 'Nome',
  drawTime: 'Horário',
  closesAt: 'Venda até',
  weekdays: 'Dias',
  games: 'Jogos',
  active: 'Ativo',
  sortOrder: 'Ordem',
};

function toAdminDraw(row: Draw): AdminDraw {
  return {
    id: row.id,
    group: row.groupName,
    name: row.name,
    hour: Math.floor(row.drawMinutes / 60),
    drawTime: minutesToTime(row.drawMinutes),
    closesAt: minutesToTime(row.closesMinutes),
    weekdays: [...row.weekdays].sort((a, b) => a - b),
    games: DRAW_GAMES.filter((game) => row[game]),
    active: row.active,
    sortOrder: row.sortOrder,
  };
}

const toPublicDraw = ({ active: _active, sortOrder: _sortOrder, ...draw }: AdminDraw): PublicDraw => draw;

const toPublicException = (row: DrawException): PublicDrawException => ({
  date: fromDate(row.date),
  drawId: row.drawId,
  kind: row.kind === 'EXTRA' ? 'EXTRA' : 'CANCEL',
});

const ORDER = [{ sortOrder: 'asc' as const }, { name: 'asc' as const }];

/**
 * Cadastro de sorteios da banca (uma lista para Loterias e Fazendinha). O painel altera com auditoria; a
 * venda consulta daqui e o banco confere de novo (trigger draw_for_sale). Travas de apostas vendidas no
 * banco (SQLSTATE SJ005), para valer também contra compras concorrentes.
 */
@Injectable()
export class DrawsService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  /** Sorteios ativos e exceções da janela de apostas (hoje + 6 dias). */
  schedule(tenant: ResolvedTenant): Promise<DrawSchedule> {
    const now = new Date().toISOString();
    return this.db.withTenant(tenant.id, async (tx) => {
      const [draws, exceptions] = await Promise.all([
        tx.draw.findMany({ where: { tenantId: tenant.id, active: true }, orderBy: ORDER }),
        tx.drawException.findMany({
          where: {
            tenantId: tenant.id,
            date: { gte: toDate(drawDateOf(now, 0)), lte: toDate(drawDateOf(now, DRAW_MAX_DAY_OFFSET)) },
          },
          orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        }),
      ]);
      return { draws: draws.map((d) => toPublicDraw(toAdminDraw(d))), exceptions: exceptions.map(toPublicException) };
    });
  }

  /**
   * Sorteios à venda para o jogo na data (ativo, do jogo e corre nesse dia), na transação de quem chama (duas
   * consultas no total): um item por pedido, null quando aquele não está à venda. O horário limite é conferido
   * por quem chama; o banco confere tudo de novo no INSERT.
   */
  async forSale(
    tx: TenantTx,
    tenantId: string,
    requests: ReadonlyArray<{ name: string; hour: number }>,
    game: DrawGame,
    date: string,
  ): Promise<Array<PublicDraw | null>> {
    const [rows, exceptionRows] = await Promise.all([
      tx.draw.findMany({ where: { tenantId, name: { in: requests.map((r) => r.name) } } }),
      tx.drawException.findMany({ where: { tenantId, date: toDate(date) } }),
    ]);
    const exceptions = exceptionRows.map(toPublicException);
    return requests.map(({ name, hour }) => {
      const row = rows.find((r) => r.name === name);
      if (!row?.active || !row[game] || Math.floor(row.drawMinutes / 60) !== hour) return null;
      const draw = toPublicDraw(toAdminDraw(row));
      return drawRunsOn(draw, date, exceptions) ? draw : null;
    });
  }

  // -------------------------------------------------------------------------
  // Painel
  // -------------------------------------------------------------------------

  list(tenant: ResolvedTenant): Promise<AdminDrawsResponse> {
    return this.db.withTenant(tenant.id, (tx) => this.load(tx, tenant.id));
  }

  create(tenant: ResolvedTenant, operator: AuthenticatedOperator, input: SaveDrawInput): Promise<AdminDrawsResponse> {
    const data = toRow(input);
    return this.write(async () =>
      this.db.withTenant(tenant.id, async (tx) => {
        await tx.draw.create({ data: { tenantId: tenant.id, ...data } });
        await recordAudit(tx, {
          tenantId: tenant.id,
          operatorId: operator.id,
          action: 'draw.create',
          targetType: 'tenant',
          targetId: tenant.id,
          details: { fields: [], draw: input.name },
        });
        return this.load(tx, tenant.id);
      }),
    );
  }

  update(
    tenant: ResolvedTenant,
    operator: AuthenticatedOperator,
    id: string,
    input: SaveDrawInput,
  ): Promise<AdminDrawsResponse> {
    const data = toRow(input);
    return this.write(async () =>
      this.db.withTenant(tenant.id, async (tx) => {
        const current = await tx.draw.findFirst({ where: { tenantId: tenant.id, id } });
        if (!current) throw notFound();
        const before = toAdminDraw(current);
        const after: SaveDrawInput = { ...input, weekdays: [...input.weekdays].sort((a, b) => a - b) };
        const changed = (Object.keys(FIELD_LABELS) as Array<keyof SaveDrawInput>).filter((field) =>
          field === 'games'
            ? before.games.join() !== DRAW_GAMES.filter((g) => after.games.includes(g)).join()
            : String(before[field]) !== String(after[field]),
        );
        if (changed.length === 0) return this.load(tx, tenant.id);
        // O banco trava a linha e confere as apostas vendidas (trigger draws_guard_bets).
        await tx.draw.update({ where: { id: current.id }, data });
        await recordAudit(tx, {
          tenantId: tenant.id,
          operatorId: operator.id,
          action: 'draw.update',
          targetType: 'tenant',
          targetId: tenant.id,
          details: { fields: changed.map((field) => FIELD_LABELS[field]), draw: input.name },
        });
        return this.load(tx, tenant.id);
      }),
    );
  }

  remove(tenant: ResolvedTenant, operator: AuthenticatedOperator, id: string): Promise<AdminDrawsResponse> {
    return this.write(async () =>
      this.db.withTenant(tenant.id, async (tx) => {
        const current = await tx.draw.findFirst({ where: { tenantId: tenant.id, id } });
        if (!current) throw notFound();
        await tx.drawException.deleteMany({ where: { tenantId: tenant.id, drawId: id } });
        await tx.draw.delete({ where: { id } });
        await recordAudit(tx, {
          tenantId: tenant.id,
          operatorId: operator.id,
          action: 'draw.delete',
          targetType: 'tenant',
          targetId: tenant.id,
          details: { fields: [], draw: current.name },
        });
        return this.load(tx, tenant.id);
      }),
    );
  }

  createException(
    tenant: ResolvedTenant,
    operator: AuthenticatedOperator,
    input: CreateDrawExceptionInput,
  ): Promise<AdminDrawsResponse> {
    const offset = dayOffsetOf(new Date().toISOString(), input.date);
    if (offset === null) throw invalid('date', 'Data inválida.');
    if (offset < 0 || offset > MAX_EXCEPTION_DAYS) throw invalid('date', 'Escolha uma data de hoje até um ano.');
    if (input.kind === 'EXTRA' && !input.drawId) throw invalid('drawId', 'Escolha o sorteio extra.');

    return this.write(async () =>
      this.db.withTenant(tenant.id, async (tx) => {
        let drawName: string | null = null;
        if (input.drawId) {
          const row = await tx.draw.findFirst({ where: { tenantId: tenant.id, id: input.drawId } });
          if (!row) throw invalid('drawId', 'Sorteio inexistente.');
          const runsOnWeekday = row.weekdays.includes(new Date(`${input.date}T12:00:00Z`).getUTCDay());
          if (input.kind === 'EXTRA' && runsOnWeekday) {
            throw invalid('date', 'O sorteio já corre nesse dia da semana.');
          }
          if (input.kind === 'CANCEL' && !runsOnWeekday) throw invalid('date', 'O sorteio não corre nesse dia.');
          drawName = row.name;
        }
        await tx.drawException.create({
          data: {
            tenantId: tenant.id,
            date: toDate(input.date),
            drawId: input.drawId,
            kind: input.kind,
            note: input.note ?? null,
          },
        });
        await recordAudit(tx, {
          tenantId: tenant.id,
          operatorId: operator.id,
          action: 'draw.exception.create',
          targetType: 'tenant',
          targetId: tenant.id,
          details: { fields: [input.kind], draw: drawName ?? 'Todos', date: input.date },
        });
        return this.load(tx, tenant.id);
      }),
    );
  }

  removeException(tenant: ResolvedTenant, operator: AuthenticatedOperator, id: string): Promise<AdminDrawsResponse> {
    return this.write(async () =>
      this.db.withTenant(tenant.id, async (tx) => {
        const current = await tx.drawException.findFirst({
          where: { tenantId: tenant.id, id },
          include: { draw: { select: { name: true } } },
        });
        if (!current) throw new AppError(404, 'NOT_FOUND', 'Exceção não encontrada.');
        await tx.drawException.delete({ where: { id } });
        await recordAudit(tx, {
          tenantId: tenant.id,
          operatorId: operator.id,
          action: 'draw.exception.delete',
          targetType: 'tenant',
          targetId: tenant.id,
          details: { fields: [current.kind], draw: current.draw?.name ?? 'Todos', date: fromDate(current.date) },
        });
        return this.load(tx, tenant.id);
      }),
    );
  }

  /** Todos os sorteios e as exceções de hoje em diante. */
  private async load(tx: TenantTx, tenantId: string): Promise<AdminDrawsResponse> {
    const today = toDate(drawDateOf(new Date().toISOString(), 0));
    const [draws, exceptions] = await Promise.all([
      tx.draw.findMany({ where: { tenantId }, orderBy: ORDER }),
      tx.drawException.findMany({
        where: { tenantId, date: { gte: today } },
        include: { draw: { select: { name: true } } },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);
    return {
      draws: draws.map(toAdminDraw),
      exceptions: exceptions.map((row): AdminDrawException => ({
        ...toPublicException(row),
        id: row.id,
        drawName: row.draw?.name ?? null,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  /** Traduz as travas do banco para respostas do painel. */
  private async write<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (hasSqlState(error, HAS_BETS_SQLSTATE)) {
        throw new AppError(
          409,
          'DRAW_HAS_BETS',
          'Há apostas vendidas para este sorteio. Não é possível fazer esta alteração antes da apuração.',
        );
      }
      if (isUniqueViolation(error)) {
        const meta = JSON.stringify(error.meta ?? {});
        if (meta.includes('name')) {
          throw new AppError(409, 'CONFLICT', 'Já existe um sorteio com este nome.', [
            { field: 'name', message: 'Já existe um sorteio com este nome.' },
          ]);
        }
        throw new AppError(409, 'CONFLICT', 'Já existe uma exceção para esta data e sorteio.', [
          { field: 'date', message: 'Já existe uma exceção para esta data e sorteio.' },
        ]);
      }
      throw error;
    }
  }
}

/** Cadastro -> colunas. Horário limite depois do sorteio é recusado. */
function toRow(input: SaveDrawInput) {
  const drawMinutes = timeToMinutes(input.drawTime);
  const closesMinutes = timeToMinutes(input.closesAt);
  if (drawMinutes === null) throw invalid('drawTime', 'Horário inválido.');
  if (closesMinutes === null) throw invalid('closesAt', 'Horário inválido.');
  if (closesMinutes > drawMinutes) throw invalid('closesAt', 'A venda precisa fechar até o horário do sorteio.');
  return {
    groupName: input.group,
    name: input.name,
    drawMinutes,
    closesMinutes,
    weekdays: [...input.weekdays].sort((a, b) => a - b),
    lotteries: input.games.includes('lotteries'),
    fazendinha: input.games.includes('fazendinha'),
    active: input.active,
    sortOrder: input.sortOrder,
  };
}
