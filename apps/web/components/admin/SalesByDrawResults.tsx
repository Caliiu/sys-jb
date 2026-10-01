'use client';

import type { SalesByDrawRow, SalesByDrawTotals } from '@sysjb/contracts';
import { Search } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { formatBrl } from '@/lib/currency';
import { controlBaseClass } from './filter-styles';

/** Texto para comparar: sem acento e sem diferenciar maiúsculas. */
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const MONEY: ReadonlyArray<{ key: Exclude<keyof SalesByDrawTotals, 'tickets'>; label: string }> = [
  { key: 'lotteriesCents', label: 'Loterias' },
  { key: 'fazendinhaCents', label: 'Fazendinha' },
  { key: 'salesCents', label: 'Total vendas' },
  { key: 'prizesCents', label: 'Prêmios' },
  { key: 'netCents', label: 'Líquido' },
];

const negative = (cents: number) => (cents < 0 ? 'text-admin-danger' : '');

function sum(rows: SalesByDrawRow[]): SalesByDrawTotals {
  const totals: SalesByDrawTotals = {
    tickets: 0,
    lotteriesCents: 0,
    fazendinhaCents: 0,
    salesCents: 0,
    prizesCents: 0,
    netCents: 0,
  };
  for (const row of rows) {
    totals.tickets += row.tickets;
    for (const { key } of MONEY) totals[key] += row[key];
  }
  return totals;
}

/**
 * Tabela das vendas por extração, com o "Filtrar extração" (nome, código ou horário, só na tela: os dados já vieram
 * todos). O total soma as extrações visíveis.
 */
export default function SalesByDrawResults({ rows }: { rows: SalesByDrawRow[] }) {
  const [filter, setFilter] = useState('');
  const inputId = useId();
  const term = normalize(filter.trim());
  const visible = useMemo(
    () =>
      term === ''
        ? rows
        : rows.filter((row) => normalize(`${row.lottery} ${row.drawCode} ${row.drawTime ?? ''}`).includes(term)),
    [rows, term],
  );
  const totals = useMemo(() => sum(visible), [visible]);

  return (
    <>
      <label htmlFor={inputId} className="relative block">
        <span className="sr-only">Filtrar extração</span>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted"
          aria-hidden
        />
        <input
          id={inputId}
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filtrar extração"
          maxLength={60}
          className={`h-10 w-full pl-10 ${controlBaseClass}`}
        />
      </label>

      {rows.length === 0 ? (
        <p className="py-10 text-center text-[14px] text-admin-muted">Nenhuma venda no período.</p>
      ) : visible.length === 0 ? (
        <p className="py-10 text-center text-[14px] text-admin-muted">Nenhuma extração com esse nome.</p>
      ) : (
        <>
          <div className="mt-4 hidden overflow-x-auto md:block print:block">
            <table className="w-full min-w-[860px] text-left text-[14px]">
              <caption className="sr-only">Vendas por extração</caption>
              <thead>
                <tr className="border-b border-admin-border text-[13px] text-admin-muted">
                  <th scope="col" className="py-3 pr-3 font-medium">
                    Horário
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    Extração
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">
                    Pules
                  </th>
                  {MONEY.map(({ key, label }) => (
                    <th key={key} scope="col" className="px-3 py-3 text-right font-medium last:pr-0">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr
                    key={`${row.lottery}:${row.hour}`}
                    className="border-b border-admin-border hover:bg-admin-hover/60"
                  >
                    <td className="py-3 pr-3 tabular-nums">
                      {row.drawTime ?? `${String(row.hour).padStart(2, '0')}h`}
                    </td>
                    <td className="px-3 py-3">
                      <span className="block">{row.lottery}</span>
                      {row.drawCode && (
                        <span className="block font-mono text-[12px] text-admin-muted">{row.drawCode}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{row.tickets.toLocaleString('pt-BR')}</td>
                    {MONEY.map(({ key }) => (
                      <td
                        key={key}
                        className={`whitespace-nowrap px-3 py-3 text-right tabular-nums last:pr-0 ${negative(row[key])}`}
                      >
                        {formatBrl(row[key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <th scope="row" colSpan={2} className="py-3 pr-3 text-left">
                    Total
                  </th>
                  <td className="px-3 py-3 text-right tabular-nums">{totals.tickets.toLocaleString('pt-BR')}</td>
                  {MONEY.map(({ key }) => (
                    <td
                      key={key}
                      className={`whitespace-nowrap px-3 py-3 text-right tabular-nums last:pr-0 ${negative(totals[key])}`}
                    >
                      {formatBrl(totals[key])}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>

          <ul aria-label="Vendas por extração" className="mt-2 divide-y divide-admin-border md:hidden print:hidden">
            {visible.map((row) => (
              <li key={`${row.lottery}:${row.hour}`} className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{row.lottery}</span>
                  <span className="tabular-nums text-admin-muted">{row.drawTime ?? `${row.hour}h`}</span>
                </div>
                <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
                  <div className="flex justify-between gap-2">
                    <dt className="text-admin-muted">Pules</dt>
                    <dd className="tabular-nums">{row.tickets}</dd>
                  </div>
                  {MONEY.map(({ key, label }) => (
                    <div key={key} className="flex justify-between gap-2">
                      <dt className="text-admin-muted">{label}</dt>
                      <dd className={`tabular-nums ${negative(row[key])}`}>{formatBrl(row[key])}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
            <li className="py-3 text-[13px] font-semibold">
              <div className="flex justify-between gap-2">
                <span>Total ({totals.tickets.toLocaleString('pt-BR')} pules)</span>
                <span className="tabular-nums">{formatBrl(totals.salesCents)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Líquido</span>
                <span className={`tabular-nums ${negative(totals.netCents)}`}>{formatBrl(totals.netCents)}</span>
              </div>
            </li>
          </ul>
        </>
      )}
    </>
  );
}
