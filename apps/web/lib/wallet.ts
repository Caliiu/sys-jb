import type { PublicWallet } from '@sysjb/contracts';

/**
 * Mapeamento da carteira pública para os três valores exibidos (bolsas LOTERIAS, BONUS e GAMES).
 * Tudo em centavos.
 */
export function balanceAmounts(wallet: PublicWallet) {
  return {
    main: wallet.balanceJb + wallet.prizesJb,
    bonus: wallet.bonusJb,
    games: wallet.totalAvailableGames,
  };
}
