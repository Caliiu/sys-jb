import type { UserStatus } from '@sysjb/contracts';
import { STATUS_LABELS } from '@/lib/admin/format';

const STYLES: Record<UserStatus, string> = {
  ACTIVE: 'border-admin-success/25 bg-admin-success/10 text-admin-success',
  BLOCKED: 'border-admin-danger/25 bg-admin-danger/10 text-admin-danger',
};

/** Etiqueta do status (verde ativo, vermelha bloqueado). */
export default function StatusBadge({ status }: { status: UserStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] font-medium ${STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
