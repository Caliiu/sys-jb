'use client';

import type { AdminUserListItem } from '@sysjb/contracts';
import Link from 'next/link';
import { type ReportColumn } from '@/admin/components/report-table';
import { Badge } from '@/admin/components/ui/badge';
import { formatCommission } from '@/lib/admin/commission';
import { dailyLimitText } from '@/lib/admin/units';

const onOff = (on: boolean, labels: [string, string] = ['Ligado', 'Desligado']) => (
  <Badge variant={on ? 'default' : 'outline'}>{on ? labels[0] : labels[1]}</Badge>
);

/** Colunas da lista de unidades. O nome abre a gaveta com as configurações da unidade. */
export function unitsColumns(
  /** Endereço da tela com a unidade aberta. */
  detailHref: (id: string) => string,
  /** Abre a gaveta já (antes de a navegação terminar). */
  onOpen: (id: string) => void,
): ReportColumn<AdminUserListItem>[] {
  return [
    {
      id: 'unit',
      header: 'Unidade',
      cell: (unit) => (
        <Link
          href={detailHref(unit.id)}
          scroll={false}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
            onOpen(unit.id);
          }}
          aria-label={`Configurar a unidade ${unit.displayId} ${unit.name}`}
          className="hover:underline"
        >
          <span className="text-muted-foreground tabular-nums">{unit.displayId}</span> |{' '}
          <span className="font-medium text-primary uppercase">{unit.name}</span>
        </Link>
      ),
    },
    { id: 'region', header: 'Região', cell: (unit) => unit.region ?? '—' },
    {
      id: 'commission',
      header: <div className="text-end">Comissão</div>,
      cell: (unit) => <div className="text-end tabular-nums">{formatCommission(unit.unitCommissionBps)}</div>,
    },
    {
      id: 'quoteTable',
      header: 'Tabela de cotação',
      cell: (unit) => (
        <div className="flex flex-col">
          <span>{unit.quoteTable.name}</span>
          <span className="text-xs text-muted-foreground">
            {unit.quoteTable.own ? unit.quoteTable.label : `Padrão da banca · ${unit.quoteTable.label}`}
          </span>
        </div>
      ),
    },
    { id: 'gift', header: 'Milhar Brinde', cell: (unit) => onOff(unit.giftMilharEnabled) },
    { id: 'retain', header: 'Reter prêmios', cell: (unit) => onOff(unit.retainPrizes, ['Sim', 'Não']) },
    {
      id: 'dailyLimit',
      header: <div className="text-end">Limite diário</div>,
      cell: (unit) => <div className="text-end tabular-nums">{dailyLimitText(unit)}</div>,
    },
  ];
}
