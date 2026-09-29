import { Inject, Injectable } from '@nestjs/common';
import { type OperatorLoginResponse, type PublicOperator, ROLE_PERMISSIONS } from '@sysjb/contracts';
import { LoginThrottleService } from '../auth/login-throttle.service.js';
import { PasswordService } from '../auth/password.service.js';
import { newSessionToken, sha256 } from '../auth/session-tokens.js';
import { Errors } from '../common/app-error.js';
import { DatabaseService, enterTenant } from '../database/database.service.js';
import { TENANT_SELECT, toResolvedTenant } from '../tenancy/tenant-mapper.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { type OperatorLoginInput, operatorTokenSchema } from './admin.schemas.js';
import type { AuthenticatedOperator } from './operator.types.js';

/** Duração absoluta da sessão do operador (mais curta que a do cliente). */
export const OPERATOR_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/** Espaço de nomes do controle de tentativas do painel (não há banca antes do login). */
const THROTTLE_SCOPE = 'console';

export function toPublicOperator(operator: AuthenticatedOperator): PublicOperator {
  return {
    id: operator.id,
    name: operator.name,
    email: operator.email,
    role: operator.role,
    permissions: ROLE_PERMISSIONS[operator.role],
  };
}

/** Operador e banca de uma sessão válida. A banca é a do operador, nunca a do endereço acessado. */
export interface OperatorContext {
  operator: AuthenticatedOperator;
  tenant: ResolvedTenant;
}

@Injectable()
export class OperatorAuthService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(LoginThrottleService) private readonly throttle: LoginThrottleService,
  ) {}

  /**
   * Login por e-mail + senha no painel único: o e-mail (único no sistema) identifica a banca. E-mail
   * inexistente, operador ou banca inativos e senha errada têm a mesma resposta e o mesmo custo; as
   * tentativas são contadas por e-mail, existindo ou não.
   */
  async login(input: OperatorLoginInput): Promise<OperatorLoginResponse> {
    const identifierHash = this.throttle.identifierHash(THROTTLE_SCOPE, 'operator', input.email);

    const failures = await this.db.client.operatorLoginFailure.findMany({
      where: { identifierHash, createdAt: { gt: this.throttle.windowStart() } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    this.throttle.assertNotLocked(failures);

    const account = await this.db.withLookup('app.login_email', input.email, (tx) =>
      tx.operator.findFirst({
        where: { email: input.email },
        select: {
          id: true,
          tenantId: true,
          name: true,
          email: true,
          role: true,
          active: true,
          passwordHash: true,
          tenant: { select: { active: true } },
        },
      }),
    );

    const usable = account?.active && account.tenant.active ? account : null;
    const valid = usable
      ? await this.passwords.verify(usable.passwordHash, input.password)
      : await this.passwords.verifyDummy(input.password);

    if (!usable || !valid) {
      await this.recordFailure(identifierHash);
      throw Errors.invalidOperatorCredentials();
    }

    const { token, tokenHash } = newSessionToken();
    const expiresAt = new Date(Date.now() + OPERATOR_SESSION_TTL_MS);
    await this.db.withTenant(usable.tenantId, (tx) =>
      tx.operatorSession.create({
        data: { tenantId: usable.tenantId, operatorId: usable.id, tokenHash, expiresAt },
      }),
    );
    await this.db.client.operatorLoginFailure.deleteMany({ where: { identifierHash } });

    const { passwordHash: _passwordHash, active: _active, tenant: _tenant, tenantId: _tenantId, ...operator } = usable;
    return { token, expiresAt: expiresAt.toISOString(), operator: toPublicOperator(operator) };
  }

  /**
   * Operador e banca da sessão, numa só transação: acha a sessão pelo hash do token (sem saber a
   * banca), entra na banca dela e confere o operador. Sessão expirada, revogada, de operador inativo ou
   * de banca inativa é inválida.
   */
  async authenticate(token: string | undefined): Promise<OperatorContext> {
    const tokenHash = this.tokenHash(token);
    const found = await this.db.withLookup('app.session_hash', tokenHash, async (tx) => {
      const session = await tx.operatorSession.findFirst({
        where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
        select: { tenantId: true, operatorId: true },
      });
      if (!session) return null;

      await enterTenant(tx, session.tenantId);
      return tx.operator.findFirst({
        where: { id: session.operatorId, tenantId: session.tenantId, active: true },
        select: { id: true, name: true, email: true, role: true, tenant: { select: TENANT_SELECT } },
      });
    });
    if (!found?.tenant.active) throw Errors.sessionInvalid();

    const { tenant, ...operator } = found;
    return { operator, tenant: toResolvedTenant(tenant) };
  }

  /** Idempotente: sessão inexistente ou já encerrada também resulta em sucesso. */
  async logout(token: string | undefined): Promise<void> {
    const parsed = operatorTokenSchema.safeParse(token);
    if (!parsed.success) return;
    const tokenHash = sha256(parsed.data);
    await this.db.withLookup('app.session_hash', tokenHash, async (tx) => {
      const session = await tx.operatorSession.findFirst({
        where: { tokenHash, revokedAt: null },
        select: { tenantId: true },
      });
      if (!session) return;
      await enterTenant(tx, session.tenantId);
      await tx.operatorSession.updateMany({
        where: { tenantId: session.tenantId, tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  private async recordFailure(identifierHash: string): Promise<void> {
    const windowStart = this.throttle.windowStart();
    await this.db.client.$transaction([
      this.db.client.operatorLoginFailure.deleteMany({ where: { createdAt: { lte: windowStart } } }),
      this.db.client.operatorLoginFailure.create({ data: { identifierHash } }),
    ]);
  }

  private tokenHash(token: string | undefined): string {
    const parsed = operatorTokenSchema.safeParse(token);
    if (!parsed.success) throw Errors.sessionInvalid();
    return sha256(parsed.data);
  }
}
