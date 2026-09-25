import type { PublicWallet } from '@sysjb/contracts';
import type { ReactNode } from 'react';

const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const WALLET_LABELS: Array<[keyof PublicWallet, string]> = [
  ['balanceJb', 'Saldo JB'],
  ['bonusJb', 'Bônus JB'],
  ['prizesJb', 'Prêmios JB'],
  ['totalAvailableJb', 'Total disponível JB'],
  ['balanceGames', 'Saldo Games'],
  ['bonusGames', 'Bônus Games'],
  ['prizesGames', 'Prêmios Games'],
  ['totalAvailableGames', 'Total disponível Games'],
  ['withdrawable', 'Sacável'],
];

/** Carteira somente leitura. Valores da API em centavos; exibidos em reais. */
export function WalletView({ wallet }: { wallet: PublicWallet }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
      {WALLET_LABELS.map(([key, label]) => (
        <div key={key} className="flex justify-between border-b border-slate-100 py-1">
          <dt className="text-slate-500">{label}</dt>
          <dd className="font-mono tabular-nums" title={`${wallet[key]} centavos`}>
            {brl(wallet[key])}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}
