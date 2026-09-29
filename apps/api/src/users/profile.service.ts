import { Inject, Injectable } from '@nestjs/common';
import { type PublicProfile, type SupportContact, passwordProblem, supportMessage } from '@sysjb/contracts';
import { PasswordService } from '../auth/password.service.js';
import type { UserSession } from '../auth/session.types.js';
import { AppError, Errors } from '../common/app-error.js';
import { DatabaseService, type TenantTx } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { mapUniqueViolation } from './user-conflicts.js';
import { toPublicProfile } from './user.mapper.js';
import type { UpdateProfileInput } from './user.schemas.js';
import { UsersRepository } from './users.repository.js';

/** O usuário vendo e alterando os PRÓPRIOS dados (sempre o da sessão: não há id vindo do cliente). */
@Injectable()
export class ProfileService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(PasswordService) private readonly passwords: PasswordService,
  ) {}

  get(tenant: ResolvedTenant, userId: string): Promise<PublicProfile> {
    return this.db.withTenant(tenant.id, (tx) => this.load(tx, tenant.id, userId));
  }

  /**
   * WhatsApp do atendimento: o do promotor que indicou o jogador, se ainda for promotor ativo; senão o da banca. A
   * mensagem vem pronta, com o código de unidade (displayId) e, para o promotor, o nome dele.
   */
  support(tenant: ResolvedTenant, userId: string): Promise<SupportContact> {
    return this.db.withTenant(tenant.id, async (tx) => {
      const user = await tx.user.findFirst({
        where: { tenantId: tenant.id, id: userId },
        select: {
          displayId: true,
          referredBy: { select: { name: true, phone: true, status: true, promoterCommissionBps: true } },
        },
      });
      const unitCode = user?.displayId ?? null;
      const promoter = user?.referredBy;
      if (promoter && promoter.status === 'ACTIVE' && promoter.promoterCommissionBps !== null) {
        return { phone: promoter.phone, message: supportMessage({ promoterName: promoter.name, unitCode }) };
      }
      return { phone: tenant.supportPhone, message: supportMessage({ promoterName: null, unitCode }) };
    });
  }

  /** Só e-mail e telefone. CPF, nome e data de nascimento não mudam por aqui. */
  async update(tenant: ResolvedTenant, userId: string, patch: UpdateProfileInput): Promise<PublicProfile> {
    try {
      return await this.db.withTenant(tenant.id, async (tx) => {
        if (!(await this.users.update(tx, tenant.id, userId, patch))) throw Errors.sessionInvalid();
        return this.load(tx, tenant.id, userId);
      });
    } catch (error) {
      mapUniqueViolation(error);
    }
  }

  /**
   * Define a nova senha. Valida com as regras do cadastro (inclusive não conter CPF, telefone ou data de
   * nascimento) e ENCERRA todas as outras sessões do usuário: a atual continua. Assim, quem tinha a conta
   * aberta em outro aparelho (ou um token roubado) perde o acesso ao trocar a senha.
   */
  async changePassword(tenant: ResolvedTenant, session: UserSession, password: string): Promise<void> {
    const personal = await this.db.withTenant(tenant.id, (tx) =>
      tx.user.findFirst({
        where: { id: session.userId, tenantId: tenant.id },
        select: { document: true, phone: true, birthDate: true },
      }),
    );
    if (!personal) throw Errors.sessionInvalid();

    const problem = passwordProblem(password, {
      document: personal.document,
      phone: personal.phone,
      birthDate: personal.birthDate.toISOString().slice(0, 10),
    });
    if (problem)
      throw new AppError(400, 'VALIDATION_ERROR', 'Payload inválido.', [{ field: 'password', message: problem }]);

    // Hash fora da transação: o argon2 é lento de propósito e não deve segurar conexão do pool.
    const passwordHash = await this.passwords.hash(password);
    await this.db.withTenant(tenant.id, async (tx) => {
      if (!(await this.users.setPasswordHash(tx, tenant.id, session.userId, passwordHash)))
        throw Errors.sessionInvalid();
      await tx.session.updateMany({
        where: { tenantId: tenant.id, userId: session.userId, revokedAt: null, id: { not: session.sessionId } },
        data: { revokedAt: new Date() },
      });
    });
  }

  private async load(tx: TenantTx, tenantId: string, userId: string): Promise<PublicProfile> {
    const found = await this.users.findWithWallet(tx, tenantId, userId);
    if (!found) throw Errors.sessionInvalid();
    if (!found.wallet) throw Errors.internal(); // invariante: todo usuário tem carteira
    return toPublicProfile(found, found.wallet);
  }
}
