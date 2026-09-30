import { ChevronDown, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { HowToPlayTopic } from '@/lib/how-to-play';
import SectionBar from '../section/SectionBar';

interface HowToPlayScreenProps {
  topics: readonly HowToPlayTopic[];
}

/** Menu > Como jogar: um cartão por assunto (abre e fecha), com o passo a passo e o atalho para a tela dele. */
export default function HowToPlayScreen({ topics }: HowToPlayScreenProps) {
  return (
    <>
      <SectionBar title="Como jogar" />
      <main className="px-3 py-3 space-y-2">
        {topics.map((topic) => (
          <details key={topic.id} className="group rounded-lg bg-white shadow-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden">
              <span className="text-[15px] font-semibold text-gray-900">{topic.title}</span>
              <ChevronDown
                className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <div className="space-y-3 border-t border-gray-100 px-4 pb-4 pt-3 text-[14px] leading-relaxed text-gray-700">
              {topic.steps && (
                <ol className="list-decimal space-y-1.5 pl-5 marker:font-semibold marker:text-brand-primary">
                  {topic.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              )}
              {topic.notes && (
                <ul className="list-disc space-y-1.5 pl-5 marker:text-gray-300">
                  {topic.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              )}
              {topic.modalities && (
                <ul aria-label="Modalidades" className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                  {topic.modalities.map((rule) => (
                    <li key={rule.name}>
                      <details className="group/rule">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                          <span className="text-[14px] font-semibold text-gray-900">{rule.name}</span>
                          <ChevronDown
                            className="h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform group-open/rule:rotate-180"
                            aria-hidden
                          />
                        </summary>
                        <dl className="space-y-1 px-3 pb-3 text-[13.5px]">
                          <div>
                            <dt className="sr-only">Como joga</dt>
                            <dd>{rule.plays}</dd>
                          </div>
                          <div>
                            <dt className="inline font-semibold text-brand-primary">Ganha: </dt>
                            <dd className="inline">{rule.wins}</dd>
                          </div>
                          {rule.extra && (
                            <div>
                              <dt className="sr-only">Observação</dt>
                              <dd>{rule.extra}</dd>
                            </div>
                          )}
                        </dl>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
              {topic.tables && (
                <ul aria-label="Tabelas" className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                  {topic.tables.map((table) => (
                    <li key={table.title}>
                      <details className="group/table">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                          <span className="text-[14px] font-semibold text-gray-900">{table.title}</span>
                          <ChevronDown
                            className="h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform group-open/table:rotate-180"
                            aria-hidden
                          />
                        </summary>
                        <div className="px-3 pb-3">
                          <table className="w-full text-[13.5px] tabular-nums">
                            <caption className="sr-only">{table.title}</caption>
                            <thead>
                              <tr className="border-b border-gray-200 text-gray-500">
                                {table.columns.map((column, i) => (
                                  <th
                                    key={column}
                                    scope="col"
                                    className={`py-1.5 font-semibold ${i === table.columns.length - 1 ? 'text-right' : 'text-left'}`}
                                  >
                                    {column}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {table.rows.map((row) => (
                                <tr key={row.join('|')} className="border-b border-gray-50 last:border-b-0">
                                  {row.map((cell, i) => (
                                    <td
                                      key={i}
                                      className={`py-1.5 ${i === row.length - 1 ? 'text-right font-semibold text-gray-900' : ''}`}
                                    >
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
              {topic.link && (
                <Link
                  href={topic.link.href}
                  className="flex items-center justify-between rounded-lg bg-brand-primary px-4 py-3 text-[14px] font-bold text-white"
                >
                  {topic.link.label}
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </Link>
              )}
            </div>
          </details>
        ))}
      </main>
    </>
  );
}
