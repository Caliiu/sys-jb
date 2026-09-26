import { Inject, Injectable } from '@nestjs/common';
import type { LoginResponse, PublicUser } from '@sysjb/contracts';
import { Errors } from '../common/app-error.js';
import { DatabaseService } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { toPublicUser } from '../users/user.mapper.js';
import { type LoginInput, sessionTokenSchema } from '../users/user.schemas.js';
import { UsersRepository } from '../users/users.repository.js';
import { LoginThrottleService } from './login-throttle.service.js';
import { PasswordService } from './password.service.js';
import { newSessionToken, sha256 } from './session-tokens.js';

export { FAILURE_WINDOW_MS, MAX_FAILURES } from './login-throttle.service.js';

/** Duração absoluta da sessão. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(LoginThrottleService) private readonly throttle: LoginThrottleService,
  ) {}

  /**
   * Login por CPF + senha. CPF inexistente e senha errada têm a mesma resposta e o mesmo custo.
   * O bloqueio conta tentativas por CPF (inclusive inexistente), para não revelar cadastros.
   * Conta bloqueada por um operador só é informada depois de a senha conferir.
   */
  async login(tenant: ResolvedTenant, input: LoginInput): Promise<LoginResponse> {
    const identifierHash = this.throttle.identifierHash(tenant.id, 'user', input.document);

    const { failures, account } = await this.db.withTenant(tenant.id, async (tx) => ({
      failures: await this.throttle.recentFailures(tx, tenant.id, identifierHash),
      account: await this.users.findByDocument(tx, tenant.id, input.document),
    }));
    this.throttle.assertNotLocked(failures);

    // Verificação fora da transação: o argon2 é lento de propósito.
    const valid = account
      ? await this.passwords.verify(account.passwordHash, input.password)
      : await this.passwords.verifyDummy(input.password);

    if (!account || !valid) {
      await this.throttle.recordFailure(tenant.id, identifierHash);
      throw Errors.invalidCredentials();
    }
    if (account.status === 'BLOCKED') throw Errors.accountBlocked();

    const { token, tokenHash } = newSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const user = await this.db.withTenant(tenant.id, async (tx) => {
      await this.throttle.clear(tx, tenant.id, identifierHash);
      await tx.session.create({ data: { tenantId: tenant.id, userId: account.id, tokenHash, expiresAt } });
      return this.users.findWithWallet(tx, tenant.id, account.id);
    });
    if (!user?.wallet) throw Errors.internal();

    return { token, expiresAt: expiresAt.toISOString(), user: toPublicUser(user, user.wallet) };
  }

  /** Usuário da sessão. Sessão de outra banca, expirada, revogada ou de usuário bloqueado é tratada como inexistente. */
  async me(tenant: ResolvedTenant, token: string | undefined): Promise<PublicUser> {
    const tokenHash = this.tokenHash(token);
    const session = await this.db.withTenant(tenant.id, (tx) =>
      tx.session.findFirst({
        where: {
          tenantId: tenant.id,
          tokenHash,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          user: { status: 'ACTIVE' },
        },
        include: { user: { omit: { passwordHash: true }, include: { wallet: true } } },
      }),
    );
    if (!session) throw Errors.sessionInvalid();
    if (!session.user.wallet) throw Errors.internal();
    return toPublicUser(session.user, session.user.wallet);
  }

  /** Idempotente: sessão inexistente ou já encerrada também resulta em sucesso. */
  async logout(tenant: ResolvedTenant, token: string | undefined): Promise<void> {
    const parsed = sessionTokenSchema.safeParse(token);
    if (!parsed.success) return;
    await this.db.withTenant(tenant.id, (tx) =>
      tx.session.updateMany({
        where: { tenantId: tenant.id, tokenHash: sha256(parsed.data), revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
  }

  private tokenHash(token: string | undefined): string {
    const parsed = sessionTokenSchema.safeParse(token);
    if (!parsed.success) throw Errors.sessionInvalid();
    return sha256(parsed.data);
  }
}
