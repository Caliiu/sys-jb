import type { AdminUserListItem } from '@sysjb/contracts';
import { headers } from 'next/headers';
import { adminApi } from '@/lib/admin/admin-api';
import { readOperatorToken } from '@/lib/admin/admin-session';
import { USERS_CSV_MAX_ROWS, usersCsv } from '@/lib/admin/users-csv';
import { parseUsersQuery } from '@/lib/admin/users-query';
import { hostnameOnly, isAdminHost, serviceKeyFor } from '@/lib/server-env';

const PAGE_SIZE = 100;

/**
 * CSV da lista de apostadores com os filtros da URL (todas as páginas, até USERS_CSV_MAX_ROWS). Rotas não passam
 * pelo layout do painel, então o host é conferido aqui; a sessão e a permissão, pela API.
 */
export async function GET(request: Request) {
  const hostname = hostnameOnly((await headers()).get('host'));
  const token = await readOperatorToken();
  if (!hostname || !isAdminHost(hostname) || !serviceKeyFor(hostname) || !token) {
    return new Response(null, { status: 404 });
  }

  const url = new URL(request.url);
  const query = parseUsersQuery(Object.fromEntries(url.searchParams));
  const session = { hostname, token };
  const items: AdminUserListItem[] = [];
  for (let page = 1; items.length < USERS_CSV_MAX_ROWS; page += 1) {
    const res = await adminApi.listUsers(session, { ...query, page, pageSize: PAGE_SIZE });
    if (!res.ok) return new Response(null, { status: res.status === 401 || res.status === 403 ? res.status : 502 });
    items.push(...res.data.items);
    if (page >= res.data.totalPages) break;
  }

  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  return new Response(usersCsv(items.slice(0, USERS_CSV_MAX_ROWS)), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="apostadores-${day}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
