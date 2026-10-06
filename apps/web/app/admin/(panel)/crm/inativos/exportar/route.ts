import { exportCrmList } from '@/lib/admin/crm-export';

/** CSV de CRM > Apostadores inativos com os filtros da URL. */
export function GET(request: Request) {
  return exportCrmList('inactive', request);
}
