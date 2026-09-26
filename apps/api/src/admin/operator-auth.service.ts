import { Inject, Injectable } from '@nestjs/common';
import { type OperatorLoginResponse, type PublicOperator, ROLE_PERMISSIONS } from '@sysjb/contracts';
import { LoginThrottleService } from '../auth/login-throttle.service.js';
import { PasswordService } from '../auth/password.service.js';
import { newSessionToken, sha256 } from '../auth/session-tokens.js';
import { Errors } from '../common/app-error.js';
import { DatabaseService } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { type OperatorLoginInput, operatorTokenSchema } from './admin.schemas.js';
import type { AuthenticatedOperator } from './operator.types.js';

/** Duração absoluta da sessão do operador (mais curta que a do cliente). */
export const OPERATOR_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export function toPublicOperator(operator: AuthenticatedOperator): PublicOperator {
  return {
    id: operator.id,
    name: operator.name,
    email: operator.email,
    role: operator.role,
    permissions: ROLE_PERMISSIONS[operator.role],
  };
}

@Injectable()
export class OperatorAuthService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(LoginThrottleService) private readonly throttle: LoginThrottleService,
  ) {}

  /**
   * Login por e-mail + senha. E-mail inexistente, operador inativo e senha errada têm a mesma
   * resposta e o mesmo custo; as tentativas são contadas por e-mail (como no login do cliente).
   */
  async login(tenant: ResolvedTenant, input: OperatorLoginInput): Promise<OperatorLoginResponse> {
    const identifierHash = this.throttle.identifierHash(tenant.id, 'operator', input.email);

    const { failures, account } = await this.db.withTenant(tenant.id, async (tx) => ({
      failures: await this.throttle.recentFailures(tx, tenant.id, identifierHash),
      account: await tx.operator.findFirst({
        where: { tenantId: tenant.id, email: input.email },
        select: { id: true, name: true, email: true, role: true, active: true, passwordHash: true },
      }),
    }));
    this.throttle.assertNotLocked(failures);

    const usable = account?.active ? account : null;
    const valid = usable
      ? await this.passwords.verify(usable.passwordHash, input.password)
      : await this.passwords.verifyDummy(input.password);

    if (!usable || !valid) {
      await this.throttle.recordFailure(tenant.id, identifierHash);
      throw Errors.invalidOperatorCredentials();
    }

    const { token, tokenHash } = newSessionToken();
    const expiresAt = new Date(Date.now() + OPERATOR_SESSION_TTL_MS);
    await this.db.withTenant(tenant.id, async (tx) => {
      await this.throttle.clear(tx, tenant.id, identifierHash);
      await tx.operatorSession.create({
        data: { tenantId: tenant.id, operatorId: usable.id, tokenHash, expiresAt },
      });
    });

    const { passwordHash: _passwordHash, active: _active, ...operator } = usable;
    return { token, expiresAt: expiresAt.toISOString(), operator: toPublicOperator(operator) };
  }

  /** Operador da sessão. Sessão de outra banca, expirada, revogada ou de operador inativo é inválida. */
  async authenticate(tenant: ResolvedTenant, token: string | undefined): Promise<AuthenticatedOperator> {
    const tokenHash = this.tokenHash(token);
    const session = await this.db.withTenant(tenant.id, (tx) =>
      tx.operatorSession.findFirst({
        where: {
          tenantId: tenant.id,
          tokenHash,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          operator: { active: true },
        },
        select: { operator: { select: { id: true, name: true, email: true, role: true } } },
      }),
    );
    if (!session) throw Errors.sessionInvalid();
    return session.operator;
  }

  /** Idempotente: sessão inexistente ou já encerrada também resulta em sucesso. */
  async logout(tenant: ResolvedTenant, token: string | undefined): Promise<void> {
    const parsed = operatorTokenSchema.safeParse(token);
    if (!parsed.success) return;
    await this.db.withTenant(tenant.id, (tx) =>
      tx.operatorSession.updateMany({
        where: { tenantId: tenant.id, tokenHash: sha256(parsed.data), revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
  }

  private tokenHash(token: string | undefined): string {
    const parsed = operatorTokenSchema.safeParse(token);
    if (!parsed.success) throw Errors.sessionInvalid();
    return sha256(parsed.data);
  }
}
