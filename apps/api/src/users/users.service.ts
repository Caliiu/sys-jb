import { Inject, Injectable } from '@nestjs/common';
import type { PublicUser } from '@sysjb/contracts';
import { AppError, Errors } from '../common/app-error.js';
import { conflictingUserField, isUniqueViolation } from '../common/prisma-errors.js';
import { PasswordService } from '../auth/password.service.js';
import { DatabaseService } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { toPublicUser } from './user.mapper.js';
import type { CreateUserInput, UpdateUserInput } from './user.schemas.js';
import { UsersRepository, WalletsRepository } from './users.repository.js';

const FIELD_LABEL = { phone: 'Telefone', document: 'CPF', email: 'Email' } as const;

function mapUniqueViolation(error: unknown): never {
  if (isUniqueViolation(error)) {
    const field = conflictingUserField(error);
    const message = field ? `${FIELD_LABEL[field]} já cadastrado nesta banca.` : 'Dados já cadastrados nesta banca.';
    throw new AppError(409, 'CONFLICT', message, field ? [{ field, message: 'Já cadastrado.' }] : undefined);
  }
  throw error;
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(WalletsRepository) private readonly wallets: WalletsRepository,
    @Inject(PasswordService) private readonly passwords: PasswordService,
  ) {}

  /** Usuário e carteira zerada na mesma transação: se a carteira falhar, nada é persistido. */
  async create(tenant: ResolvedTenant, input: CreateUserInput): Promise<PublicUser> {
    // Hash fora da transação: o argon2 é deliberadamente lento e não deve segurar conexão do pool.
    const { password, ...data } = input;
    const passwordHash = await this.passwords.hash(password);
    try {
      return await this.db.withTenant(tenant.id, async (tx) => {
        const user = await this.users.create(tx, tenant.id, { ...data, passwordHash });
        const wallet = await this.wallets.createForUser(tx, tenant.id, user.id);
        return toPublicUser(user, wallet);
      });
    } catch (error) {
      mapUniqueViolation(error);
    }
  }

  async get(tenant: ResolvedTenant, id: string): Promise<PublicUser> {
    const found = await this.db.withTenant(tenant.id, (tx) => this.users.findWithWallet(tx, tenant.id, id));
    if (!found) throw Errors.userNotFound();
    if (!found.wallet) throw Errors.internal(); // invariante: todo usuário tem carteira
    return toPublicUser(found, found.wallet);
  }

  async update(tenant: ResolvedTenant, id: string, patch: UpdateUserInput): Promise<PublicUser> {
    let result: Awaited<ReturnType<UsersRepository['findWithWallet']>>;
    try {
      result = await this.db.withTenant(tenant.id, async (tx) => {
        const updated = await this.users.update(tx, tenant.id, id, patch);
        return updated ? this.users.findWithWallet(tx, tenant.id, id) : null;
      });
    } catch (error) {
      mapUniqueViolation(error);
    }
    if (!result) throw Errors.userNotFound();
    if (!result.wallet) throw Errors.internal();
    return toPublicUser(result, result.wallet);
  }
}
