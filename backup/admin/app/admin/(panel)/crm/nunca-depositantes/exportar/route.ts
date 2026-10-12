import { exportCrmList } from '@/lib/admin/crm-export';

/** CSV de CRM > Nunca depositantes com os filtros da URL. */
export function GET(request: Request) {
  return exportCrmList('never-deposited', request);
}
