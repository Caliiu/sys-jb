'use client';

import { type DrawOverdueResponse, type OverdueGroup, type PublicDraw, groupDraws } from '@sysjb/contracts';
import { Check, ChevronDown, ChevronUp, Clock, Copy, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { BICHOS, bichoImage } from '@/lib/fazendinha';
import { overdueOf, ROUTES } from '@/lib/routes';
import LotteryToolsNav from '../lotteries/LotteryToolsNav';
import StepButton, { stepCardClass } from '../lotteries/StepButton';
import SectionBar from '../section/SectionBar';
import BottomSheet from '../ui/BottomSheet';
import { useToast } from '../ui/Toast';

interface OverdueScreenProps {
  /** Sorteios da banca com resultado ligado, na ordem do cadastro. */
  draws: PublicDraw[];
  /** Sorteio da URL (já conferido na lista); null = nada buscado ainda. */
  selectedId: string | null;
  /** Atrasados do sorteio da URL; null = nada buscado ou falhou (ver `failed`). */
  overdue: DrawOverdueResponse | null;
  /** A busca do sorteio da URL falhou. */
  failed: boolean;
}

const groupLabel = (group: number) => String(group).padStart(2, '0');

/**
 * Loterias > Atrasados: escolha da loteria (folha com os grupos em sanfona) e, depois de buscar, os 25 bichos do que
 * está há mais tempo sem sair na cabeça ao mais recente. Tocar num bicho copia o grupo (2 dígitos).
 */
export default function OverdueScreen({ draws, selectedId, overdue, failed }: OverdueScreenProps) {
  const router = useRouter();
  const toast = useToast();
  const [pickedId, setPickedId] = useState(selectedId);
  const [picking, setPicking] = useState(false);
  const [searching, startSearch] = useTransition();
  const picked = draws.find((draw) => draw.id === pickedId) ?? null;

  function search() {
    if (!picked) return;
    startSearch(() => {
      // Mesmo sorteio: busca de novo (o resultado do dia pode ter chegado).
      if (picked.id === selectedId) router.refresh();
      else router.push(overdueOf(picked.id), { scroll: false });
    });
  }

  async function copy(group: number) {
    const text = groupLabel(group);
    try {
      await navigator.clipboard.writeText(text);
      toast.show(`Copiado: ${text}`);
    } catch {
      toast.show('Não foi possível copiar.');
    }
  }

  return (
    <>
      <SectionBar title="Atrasados" back={{ href: ROUTES.lotteries, label: 'Fechar' }} />
      <main className="px-3 pt-3 pb-28 space-y-3">
        <section className={`${stepCardClass} flex items-center gap-3 px-4 py-4`}>
          <span className="flex w-12 h-12 shrink-0 items-center justify-center rounded-full bg-brand-primary shadow-card">
            <Clock className="w-6 h-6 text-white" aria-hidden />
          </span>
          <span>
            <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-gray-500">
              <Clock className="w-3 h-3 text-brand-primary" aria-hidden />
              Atrasados
            </span>
            <span className="block text-[19px] font-bold leading-tight text-gray-900">Bichos que não saem há dias</span>
          </span>
        </section>

        <StepButton n={1} label="Loteria" value={picked?.name ?? null} onClick={() => setPicking(true)} />

        <button
          type="button"
          disabled={!picked || searching}
          aria-busy={searching}
          onClick={search}
          className="h-14 w-full rounded-xl bg-brand-primary text-[17px] font-bold text-white shadow-card active:scale-[0.99] transition-transform disabled:opacity-50 disabled:shadow-none disabled:active:scale-100"
        >
          {searching ? 'Buscando…' : 'Buscar atrasados'}
        </button>

        {draws.length === 0 && (
          <p className={`${stepCardClass} px-4 py-4 text-center text-[14px] text-gray-500`}>
            Nenhuma loteria com resultados disponível.
          </p>
        )}

        {failed && (
          <p role="alert" className={`${stepCardClass} px-4 py-4 text-center text-[14px] text-gray-600`}>
            Não foi possível buscar os atrasados. Tente novamente.
          </p>
        )}

        {overdue && <OverdueList overdue={overdue} onCopy={copy} />}
      </main>

      <LotteryToolsNav active="overdue" />

      <DrawPickerSheet
        open={picking}
        draws={draws}
        selectedId={pickedId}
        onPick={(id) => {
          setPickedId(id);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </>
  );
}

function OverdueList({ overdue, onCopy }: { overdue: DrawOverdueResponse; onCopy: (group: number) => void }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="pt-1">
      <div className="flex items-center justify-between gap-3 px-1 pb-2">
        <h2
          id={headingId}
          className="flex min-w-0 items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-gray-600"
        >
          <Clock className="w-3.5 h-3.5 shrink-0 text-brand-primary" aria-hidden />
          <span className="truncate">Atrasados em {overdue.drawName}</span>
        </h2>
        <span className="shrink-0 text-[12px] text-gray-500">Toque para copiar</span>
      </div>

      <ul className={`${stepCardClass} divide-y divide-gray-100`}>
        {overdue.groups.map((item) => (
          <li key={item.group}>
            <button
              type="button"
              onClick={() => onCopy(item.group)}
              aria-label={`Copiar grupo ${groupLabel(item.group)}, ${BICHOS[item.group - 1]}`}
              className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-gray-50"
            >
              <span className="flex w-11 h-11 shrink-0 items-center justify-center rounded-full bg-brand-primary text-[16px] font-bold tabular-nums text-white shadow-card">
                {groupLabel(item.group)}
              </span>
              <Image src={bichoImage(item.group)} alt="" width={48} height={48} className="w-12 h-12 object-contain" />
              <span className="flex-1 min-w-0">
                <span className="block truncate text-[16px] font-bold text-brand-primary">
                  {BICHOS[item.group - 1]}
                </span>
                <span className="block text-[14px] text-gray-600">
                  <OverdueSince item={item} />
                </span>
              </span>
              <Copy className="w-4 h-4 shrink-0 text-gray-400" aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      <Link
        href={ROUTES.lotteries}
        className="mt-5 flex h-14 w-full items-center justify-center rounded-xl bg-brand-primary text-[17px] font-bold text-white shadow-card"
      >
        Apostar agora
      </Link>
    </section>
  );
}

/** "Saiu há 110 dias" (número em negrito); hoje e sem registro no histórico têm texto próprio. */
function OverdueSince({ item }: { item: OverdueGroup }) {
  if (item.days === null) return <>Sem registro de saída</>;
  if (item.days === 0) return <>Saiu hoje</>;
  return (
    <>
      Saiu há <strong className="font-bold text-gray-900">{item.days}</strong> {item.days === 1 ? 'dia' : 'dias'}
    </>
  );
}

/** "Escolha a loteria": grupos em sanfona (abre no grupo do escolhido); tocar num sorteio escolhe e fecha. */
function DrawPickerSheet({
  open,
  draws,
  selectedId,
  onPick,
  onClose,
}: {
  open: boolean;
  draws: PublicDraw[];
  selectedId: string | null;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const panelPrefix = useId();
  const groups = groupDraws(draws);
  const selectedGroup = draws.find((draw) => draw.id === selectedId)?.group ?? null;
  // undefined = abre no grupo do escolhido; depois, o grupo que o jogador abriu (null = todos fechados).
  const [expanded, setExpanded] = useState<string | null | undefined>(undefined);
  const openGroup = expanded === undefined ? selectedGroup : expanded;

  function close() {
    setExpanded(undefined);
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={close} titleId={titleId}>
      <div className="flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-[17px] font-bold text-gray-900">
          Escolha a loteria
        </h2>
        <button
          type="button"
          onClick={close}
          aria-label="Fechar"
          className="flex w-8 h-8 items-center justify-center rounded-full text-gray-400 active:bg-gray-100"
        >
          <X className="w-5 h-5" aria-hidden />
        </button>
      </div>
      <ul aria-label="Loterias" className="-mx-2 mt-3 max-h-[60vh] space-y-2 overflow-y-auto px-2 pb-1">
        {groups.map((group, index) => {
          const isOpen = openGroup === group.label;
          const panelId = `${panelPrefix}-${index}`;
          return (
            <li key={group.label}>
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : group.label)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="flex w-full items-center gap-2 rounded-xl bg-gray-50 px-4 py-3.5 text-left"
              >
                <span className="flex-1 text-[15px] font-bold uppercase text-gray-900">{group.label}</span>
                {isOpen ? (
                  <ChevronUp className="w-4 h-4 text-gray-400" aria-hidden />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400" aria-hidden />
                )}
              </button>
              {isOpen && (
                <ul id={panelId} aria-label={`Extrações ${group.label}`} className="py-1">
                  {group.draws.map((draw) => {
                    const current = draw.id === selectedId;
                    return (
                      <li key={draw.id}>
                        <button
                          type="button"
                          aria-pressed={current}
                          onClick={() => {
                            setExpanded(undefined);
                            onPick(draw.id);
                          }}
                          className={`flex w-full items-center gap-2 rounded-lg px-4 py-3 text-left text-[15px] font-semibold ${
                            current ? 'bg-brand-primary/10 text-brand-primary' : 'text-gray-700 active:bg-gray-50'
                          }`}
                        >
                          <span className="flex-1">{draw.name}</span>
                          {current && <Check className="w-4 h-4" strokeWidth={3} aria-hidden />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </BottomSheet>
  );
}
