import type { FazendinhaModeId } from '@/lib/fazendinha';

/** Cores fixas por modalidade (iguais em todas as bancas). */
export const MODE_STYLE: Record<FazendinhaModeId, { idle: string; active: string; badge: string }> = {
  grupo: {
    idle: 'border-blue-500 text-blue-500',
    active: 'border-blue-500 text-blue-600 bg-blue-100',
    badge: 'border-blue-500 text-blue-600 bg-blue-50',
  },
  dezena: {
    idle: 'border-green-500 text-green-600',
    active: 'border-green-500 text-green-600 bg-green-100',
    badge: 'border-green-500 text-green-600 bg-green-50',
  },
  centena: {
    idle: 'border-red-500 text-red-500',
    active: 'border-red-500 text-red-600 bg-red-100',
    badge: 'border-red-500 text-red-600 bg-red-50',
  },
};
