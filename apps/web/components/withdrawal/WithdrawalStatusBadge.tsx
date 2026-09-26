import { WITHDRAWAL_STATUS_LABELS, type WithdrawalStatus } from '@/lib/withdrawal';

const STYLES: Record<WithdrawalStatus, { badge: string; dot: string }> = {
  PENDING: { badge: 'bg-amber-50 text-amber-800', dot: 'bg-amber-500' },
  PAID: { badge: 'bg-green-50 text-green-800', dot: 'bg-green-500' },
  REJECTED: { badge: 'bg-red-50 text-red-700', dot: 'bg-red-500' },
  CANCELED: { badge: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
};

/** Status do saque: ponto colorido + nome (a cor nunca é a única informação). */
export default function WithdrawalStatusBadge({ status }: { status: WithdrawalStatus }) {
  const style = STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${style.badge}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {WITHDRAWAL_STATUS_LABELS[status]}
    </span>
  );
}
