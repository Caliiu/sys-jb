import type { UserStatus } from '@sysjb/contracts';
import { STATUS_LABELS } from '@/lib/admin/format';

const STYLES: Record<UserStatus, string> = {
  ACTIVE: 'bg-admin-success/10 text-admin-success border-admin-success/30',
  BLOCKED: 'bg-admin-danger/10 text-admin-danger border-admin-danger/30',
};

export default function StatusBadge({ status }: { status: UserStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold ${STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
