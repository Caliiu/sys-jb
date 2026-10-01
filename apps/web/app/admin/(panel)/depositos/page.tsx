import WalletMovementsRoute from '@/components/admin/WalletMovementsRoute';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Depósitos' };

/** Carteira > Depósitos: filtros sempre; a lista só depois de pesquisar. */
export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <WalletMovementsRoute kind="deposits" searchParams={searchParams} />;
}
