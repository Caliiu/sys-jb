import { CrmRoute } from '@/lib/admin/crm-route';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Nunca depositantes' };

/** CRM > Nunca depositantes: abre nos cadastros dos últimos 7 dias, os mais antigos primeiro. */
export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <CrmRoute list="never-deposited" searchParams={searchParams} />;
}
