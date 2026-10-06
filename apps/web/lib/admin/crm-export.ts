import 'server-only';
import { CRM_LIMITS, type CrmList } from '@sysjb/contracts';
import { headers } from 'next/headers';
import { adminApi } from './admin-api';
import { readOperatorToken } from './admin-session';
import { crmInactiveCsv, crmNeverDepositedCsv } from './crm-csv';
import { parseCrmQuery } from './crm-query';
import { hostnameOnly, isAdminHost, serviceKeyFor } from '../server-env';

const PAGE_SIZE = 100;
const FILE_NAMES: Record<CrmList, string> = {
  inactive: 'apostadores-inativos',
  'never-deposited': 'nunca-depositantes',
};

/**
 * "Exportar Excel" de uma lista do CRM com os filtros e a ordem da URL (todas as páginas, até CRM_LIMITS.exportMaxRows).
 * Rotas não passam pelo layout do painel, então o host é conferido aqui; a sessão e a permissão, pela API.
 */
export async function exportCrmList(list: CrmList, request: Request): Promise<Response> {
  const hostname = hostnameOnly((await headers()).get('host'));
  const token = await readOperatorToken();
  if (!hostname || !isAdminHost(hostname) || !serviceKeyFor(hostname) || !token) {
    return new Response(null, { status: 404 });
  }

  const query = parseCrmQuery(list, Object.fromEntries(new URL(request.url).searchParams));
  const session = { hostname, token };
  const items: unknown[] = [];
  for (let page = 1; items.length < CRM_LIMITS.exportMaxRows; page += 1) {
    const res = await adminApi.crmList(session, { ...query, page, pageSize: PAGE_SIZE });
    if (!res.ok) return new Response(null, { status: res.status === 401 || res.status === 403 ? res.status : 502 });
    items.push(...res.data.items);
    if (page >= res.data.totalPages) break;
  }

  const rows = items.slice(0, CRM_LIMITS.exportMaxRows);
  const csv =
    list === 'inactive'
      ? crmInactiveCsv(rows as Parameters<typeof crmInactiveCsv>[0])
      : crmNeverDepositedCsv(rows as Parameters<typeof crmNeverDepositedCsv>[0]);
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${FILE_NAMES[list]}-${day}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
