import { createHash, createHmac, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { LoginResponse, PublicUser } from '@sysjb/contracts';
import { Errors } from '../common/app-error.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DatabaseService } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { toPublicUser } from '../users/user.mapper.js';
import { type LoginInput, sessionTokenSchema } from '../users/user.schemas.js';
import { UsersRepository } from '../users/users.repository.js';
import { PasswordService } from './password.service.js';

/** Duração absoluta da sessão. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
/** Bloqueio temporário: MAX_FAILURES falhas por CPF dentro da janela. */
export const MAX_FAILURES = 5;
export const FAILURE_WINDOW_MS = 15 * 60 * 1000;

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

@Injectable()
export class AuthService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(PasswordService) private readonly passwords: PasswordService,
  ) {}

  /**
   * Login por CPF + senha. CPF inexistente e senha errada têm a mesma resposta e o mesmo custo.
   * O bloqueio conta tentativas por CPF (inclusive inexistente), para não revelar cadastros.
   */
  async login(tenant: ResolvedTenant, input: LoginInput): Promise<LoginResponse> {
    const identifierHash = createHmac('sha256', this.config.authSecret)
      .update(`${tenant.id}:${input.document}`)
      .digest('hex');
    const windowStart = new Date(Date.now() - FAILURE_WINDOW_MS);

    const { failures, account } = await this.db.withTenant(tenant.id, async (tx) => ({
      failures: await tx.loginFailure.findMany({
        where: { tenantId: tenant.id, identifierHash, createdAt: { gt: windowStart } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      account: await this.users.findByDocument(tx, tenant.id, input.document),
    }));

    if (failures.length >= MAX_FAILURES) {
      // Liberado quando falhas suficientes saírem da janela.
      const releasing = failures[failures.length - MAX_FAILURES]!.createdAt.getTime() + FAILURE_WINDOW_MS;
      throw Errors.tooManyAttempts(Math.max(1, Math.ceil((releasing - Date.now()) / 1000)));
    }

    // Verificação fora da transação: o argon2 é lento de propósito.
    const valid = account
      ? await this.passwords.verify(account.passwordHash, input.password)
      : await this.passwords.verifyDummy(input.password);

    if (!account || !valid) {
      await this.db.withTenant(tenant.id, async (tx) => {
        await tx.loginFailure.deleteMany({ where: { tenantId: tenant.id, createdAt: { lte: windowStart } } });
        await tx.loginFailure.create({ data: { tenantId: tenant.id, identifierHash } });
      });
      throw Errors.invalidCredentials();
    }

    // Token opaco de 256 bits; só o SHA-256 é persistido.
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const user = await this.db.withTenant(tenant.id, async (tx) => {
      await tx.loginFailure.deleteMany({ where: { tenantId: tenant.id, identifierHash } });
      await tx.session.create({
        data: { tenantId: tenant.id, userId: account.id, tokenHash: sha256(token), expiresAt },
      });
      return this.users.findWithWallet(tx, tenant.id, account.id);
    });
    if (!user?.wallet) throw Errors.internal();

    return { token, expiresAt: expiresAt.toISOString(), user: toPublicUser(user, user.wallet) };
  }

  /** Usuário da sessão. Sessão de outra banca, expirada ou revogada é tratada como inexistente. */
  async me(tenant: ResolvedTenant, token: string | undefined): Promise<PublicUser> {
    const tokenHash = this.tokenHash(token);
    const session = await this.db.withTenant(tenant.id, (tx) =>
      tx.session.findFirst({
        where: { tenantId: tenant.id, tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
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
