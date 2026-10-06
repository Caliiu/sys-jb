import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { createPrismaClient, type Prisma, type PrismaClient } from '@sysjb/database';
import { APP_CONFIG, type AppConfig } from '../config/config.js';

/** Cliente de transação com o contexto de tenant já aplicado. */
export type TenantTx = Prisma.TransactionClient;

/** Chaves de leitura antes de haver banca (policies *_lookup da migration do painel único). */
export type LookupKey =
  | 'app.login_email'
  | 'app.session_hash'
  | 'app.casino_user'
  | 'app.pix_deposit'
  | 'app.pix_withdrawal';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Define a banca da transação corrente (vale só até o fim dela). */
export async function enterTenant(tx: TenantTx, tenantId: string): Promise<void> {
  if (!UUID_RE.test(tenantId)) throw new Error('tenantId inválido');
  await tx.$queryRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  /** Conexão com a role de runtime (sysjb_app): sem superuser, sem BYPASSRLS. */
  readonly client: PrismaClient;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = createPrismaClient({ connectionString: config.databaseUrl, max: config.dbPoolMax });
  }

  /**
   * Executa `fn` numa transação com `app.tenant_id` definido via set_config(..., is_local = true).
   * O valor vale só para esta transação e para a conexão que a executa; ao fim (commit ou
   * rollback) o PostgreSQL o descarta, então nada vaza para a próxima requisição do pool.
   * Toda consulta a users/wallets deve passar por aqui: sem contexto, o RLS nega acesso.
   */
  withTenant<T>(tenantId: string, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
    return this.client.$transaction(async (tx) => {
      await enterTenant(tx, tenantId);
      return fn(tx);
    });
  }

  /**
   * Leitura por chave, para quando a banca ainda não é conhecida (login e sessão do painel único): a
   * transação enxerga somente a linha cujo e-mail (ou hash de sessão) é `value`. Para seguir na banca
   * do que foi achado, chame `enterTenant` na mesma transação. O valor vale só nela, como em withTenant.
   */
  withLookup<T>(key: LookupKey, value: string, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
    return this.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config(${key}, ${value}, true)`;
      return fn(tx);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
