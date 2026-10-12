import { CrmRoute } from '@/lib/admin/crm-route';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Apostadores inativos' };

/** CRM > Apostadores inativos: abre em 1 a 7 dias sem depositar, os há mais tempo sem depositar primeiro. */
export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <CrmRoute list="inactive" searchParams={searchParams} />;
}
