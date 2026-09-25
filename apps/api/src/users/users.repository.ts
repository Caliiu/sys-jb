import { Injectable } from '@nestjs/common';
import type { User, Wallet } from '@sysjb/database';
import type { TenantTx } from '../database/database.service.js';
import type { CreateUserInput, UpdateUserInput } from './user.schemas.js';

/** Usuário sem o hash da senha: é o que circula fora do login. */
export type SafeUser = Omit<User, 'passwordHash'>;
const OMIT_SECRET = { passwordHash: true } as const;

export type NewUserData = Omit<CreateUserInput, 'password'> & { passwordHash: string };

/** 'YYYY-MM-DD' -> Date à meia-noite UTC (coluna DATE, sem fuso). */
const toDateOnly = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/**
 * Acesso a users. Toda operação recebe tenantId e filtra por ele explicitamente,
 * além do RLS aplicado pela transação de DatabaseService.withTenant.
 */
@Injectable()
export class UsersRepository {
  create(tx: TenantTx, tenantId: string, input: NewUserData): Promise<SafeUser> {
    return tx.user.create({
      omit: OMIT_SECRET,
      data: {
        tenantId,
        name: input.name,
        email: input.email,
        phone: input.phone,
        document: input.document,
        avatar: input.avatar,
        birthDate: toDateOnly(input.birthDate),
        passwordHash: input.passwordHash,
      },
    });
  }

  /** Única leitura que traz o hash da senha; uso exclusivo do login. */
  findByDocument(
    tx: TenantTx,
    tenantId: string,
    document: string,
  ): Promise<{ id: string; passwordHash: string } | null> {
    return tx.user.findFirst({
      where: { tenantId, document },
      select: { id: true, passwordHash: true },
    });
  }

  findWithWallet(tx: TenantTx, tenantId: string, id: string): Promise<(SafeUser & { wallet: Wallet | null }) | null> {
    return tx.user.findFirst({ where: { id, tenantId }, omit: OMIT_SECRET, include: { wallet: true } });
  }

  /** Atualiza apenas os campos presentes no patch. Retorna false se o usuário não existe nesta banca. */
  async update(tx: TenantTx, tenantId: string, id: string, patch: UpdateUserInput): Promise<boolean> {
    const data: UpdateUserInput = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.email !== undefined) data.email = patch.email;
    if (patch.phone !== undefined) data.phone = patch.phone;
    if (patch.document !== undefined) data.document = patch.document;
    if (patch.avatar !== undefined) data.avatar = patch.avatar;
    const { count } = await tx.user.updateMany({ where: { id, tenantId }, data });
    return count === 1;
  }
}

/** Carteira: somente criação e leitura. Não há operação de movimentação nesta fase. */
@Injectable()
export class WalletsRepository {
  createForUser(tx: TenantTx, tenantId: string, userId: string): Promise<Wallet> {
    return tx.wallet.create({ data: { tenantId, userId } });
  }
}
