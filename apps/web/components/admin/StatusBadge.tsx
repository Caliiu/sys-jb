import type { UserStatus } from '@sysjb/contracts';
import { STATUS_LABELS } from '@/lib/admin/format';

const STYLES: Record<UserStatus, string> = {
  ACTIVE: 'bg-admin-success',
  BLOCKED: 'bg-admin-danger',
};

/** Etiqueta sólida do status (verde ativo, vermelha bloqueado). */
export default function StatusBadge({ status }: { status: UserStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm px-2 py-0.5 text-[11px] font-bold lowercase text-white ${STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
