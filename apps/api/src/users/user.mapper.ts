import type { Cents, PublicPromoterFields, PublicUser, PublicWallet } from '@sysjb/contracts';
import type { User, Wallet } from '@sysjb/database';

function toCents(value: bigint): Cents {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('valor monetário fora do intervalo seguro');
  }
  return Number(value);
}

export function toPublicWallet(wallet: Wallet): PublicWallet {
  const balanceJb = toCents(wallet.balanceJb);
  const bonusJb = toCents(wallet.bonusJb);
  const prizesJb = toCents(wallet.prizesJb);
  const balanceGames = toCents(wallet.balanceGames);
  const bonusGames = toCents(wallet.bonusGames);
  const prizesGames = toCents(wallet.prizesGames);
  return {
    balanceJb,
    bonusJb,
    prizesJb,
    balanceGames,
    bonusGames,
    prizesGames,
    // Sem regra de saque nesta fase.
    withdrawable: 0,
    // Totais derivados na leitura (CHECK no banco garante que a soma é um inteiro seguro).
    totalAvailableJb: toCents(wallet.balanceJb + wallet.bonusJb + wallet.prizesJb),
    totalAvailableGames: toCents(wallet.balanceGames + wallet.bonusGames + wallet.prizesGames),
  };
}

/** Ponto único dos campos de promotor: sempre null até existir um modelo definido. */
export function promoterFields(): PublicPromoterFields {
  return { promoter: null, promoterName: null, promoterPhone: null };
}

/** Mapeamento explícito entidade -> contrato público. Nunca expõe tenantId nem timestamps. */
export function toPublicUser(user: User, wallet: Wallet): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email ?? null,
    phone: user.phone,
    document: user.document,
    avatar: user.avatar ?? null,
    displayId: user.displayId,
    wallet: toPublicWallet(wallet),
    ...promoterFields(),
  };
}
