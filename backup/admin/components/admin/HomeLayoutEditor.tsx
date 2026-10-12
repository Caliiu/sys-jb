'use client';

import {
  DEFAULT_HOME_LAYOUT,
  type HomeBlockId,
  type HomeLayout,
  type HomeLayoutBlock,
  type HomeLayoutCard,
  homeBlockLabel,
  homeCardLabel,
} from '@sysjb/contracts';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type CSSProperties, type DragEvent, useState } from 'react';
import { saveHomeLayoutAction } from '@/app/admin/actions';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';

const cardClass = 'overflow-hidden rounded-xl bg-admin-surface shadow-admin';
const primaryButton =
  'inline-flex h-9 items-center gap-1.5 rounded-lg bg-admin-accent px-3.5 text-[13px] font-semibold text-white active:bg-admin-accent-dark disabled:opacity-50';
const secondaryButton =
  'inline-flex h-9 items-center rounded-lg border border-admin-border px-3.5 text-[13px] font-semibold text-admin-text disabled:opacity-50';
const iconButton =
  'flex h-7 w-7 items-center justify-center rounded-md text-admin-text hover:bg-admin-bg disabled:opacity-30 disabled:hover:bg-transparent';

/** Cópia da lista com o item de `from` levado para `to` (fora dos limites: a mesma lista). */
function move<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length || to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

const sameLayout = (a: HomeLayout, b: HomeLayout) => JSON.stringify(a) === JSON.stringify(b);

function Switch({
  on,
  label,
  onChange,
  disabled,
}: {
  on: boolean;
  label: string;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-accent focus-visible:ring-offset-2 disabled:opacity-50 ${
        on ? 'bg-admin-success' : 'bg-gray-300'
      }`}
    >
      <span
        aria-hidden
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          on ? 'translate-x-[18px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

/**
 * Lista reordenável: arrastar (mouse) ou ↑/↓ (teclado e toque). `group` separa as listas: um card só pode ser
 * solto na lista do próprio bloco, e um bloco só entre blocos.
 */
function useDragList(group: string, onMove: (from: number, to: number) => void) {
  const [over, setOver] = useState<number | null>(null);
  const rowProps = (index: number, enabled: boolean) =>
    enabled
      ? {
          draggable: true,
          onDragStart: (event: DragEvent<HTMLElement>) => {
            event.stopPropagation();
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', `${group}:${index}`);
          },
          onDragOver: (event: DragEvent<HTMLElement>) => {
            event.preventDefault();
            event.stopPropagation();
            if (over !== index) setOver(index);
          },
          onDragLeave: (event: DragEvent<HTMLElement>) => {
            // Passar por cima de um filho da linha não conta como sair dela.
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null);
          },
          onDrop: (event: DragEvent<HTMLElement>) => {
            event.preventDefault();
            event.stopPropagation();
            setOver(null);
            const [fromGroup, fromIndex] = event.dataTransfer.getData('text/plain').split(':');
            if (fromGroup === group && fromIndex !== undefined) onMove(Number(fromIndex), index);
          },
          onDragEnd: () => setOver(null),
        }
      : {};
  return { over, rowProps };
}

function MoveButtons({
  label,
  index,
  count,
  onMove,
  size,
}: {
  label: string;
  index: number;
  count: number;
  onMove: (to: number) => void;
  size: string;
}) {
  return (
    <>
      <button
        type="button"
        aria-label={`Subir ${label}`}
        disabled={index === 0}
        onClick={() => onMove(index - 1)}
        className={iconButton}
      >
        <ArrowUp className={size} aria-hidden />
      </button>
      <button
        type="button"
        aria-label={`Descer ${label}`}
        disabled={index === count - 1}
        onClick={() => onMove(index + 1)}
        className={iconButton}
      >
        <ArrowDown className={size} aria-hidden />
      </button>
    </>
  );
}

function CardList({
  block,
  canManage,
  onChange,
}: {
  block: HomeLayoutBlock;
  canManage: boolean;
  onChange: (cards: HomeLayoutCard[]) => void;
}) {
  const drag = useDragList(block.id, (from, to) => onChange(move(block.cards, from, to)));
  return (
    <ul aria-label={`Cards de ${homeBlockLabel(block.id)}`} className="mt-2 flex flex-col gap-1.5 pl-9">
      {block.cards.map((card, i) => {
        const label = homeCardLabel(block.id, card.id);
        return (
          <li
            key={card.id}
            {...drag.rowProps(i, canManage)}
            className={`flex items-center gap-2 rounded-lg border bg-admin-bg px-2 py-1.5 ${
              drag.over === i ? 'border-admin-accent' : 'border-transparent'
            }`}
          >
            {canManage && <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-admin-muted" aria-hidden />}
            <span className={`flex-1 text-[12.5px] font-medium text-admin-text ${card.visible ? '' : 'opacity-50'}`}>
              {label}
            </span>
            {canManage && (
              <MoveButtons
                label={label}
                index={i}
                count={block.cards.length}
                onMove={(to) => onChange(move(block.cards, i, to))}
                size="h-3.5 w-3.5"
              />
            )}
            <Switch
              on={card.visible}
              label={`Mostrar ${label}`}
              disabled={!canManage}
              onChange={() => onChange(block.cards.map((c) => (c.id === card.id ? { ...c, visible: !c.visible } : c)))}
            />
          </li>
        );
      })}
    </ul>
  );
}

/** Cor de fundo de cada card na miniatura (a mesma do app). */
const MINI_COLOR: Record<string, string> = {
  loterias: 'bg-brand-primary',
  fazendinha: 'bg-brand-green',
  raspadinha: 'bg-brand-purple',
  bingo: 'bg-brand-primary',
};

/** Bloco na pré-visualização: só os cards visíveis, na ordem escolhida. Sem nenhum card visível, some. */
function PreviewBlock({ block }: { block: HomeLayoutBlock }) {
  const cards = block.cards.filter((card) => card.visible);
  switch (block.id) {
    case 'draw':
      return (
        <div className="rounded-md bg-brand-primary px-2 py-1.5 text-[6.5px] font-bold text-white">PRÓXIMO SORTEIO</div>
      );
    case 'casino':
      return (
        <div className="flex h-10 items-center rounded-md bg-gradient-to-r from-brand-purpleDark to-brand-purple px-2 font-display text-[8px] text-white">
          CASSINO
        </div>
      );
    case 'support':
      return <div className="rounded-md bg-brand-teal px-2 py-1.5 text-[6.5px] font-bold text-white">ATENDIMENTO</div>;
    case 'utility':
      if (cards.length === 0) return null;
      return (
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cards.length}, minmax(0, 1fr))` }}>
          {cards.map((card) => (
            <div
              key={card.id}
              className="flex h-7 items-center justify-center rounded-md bg-brand-primary text-[5.5px] font-semibold text-white"
            >
              {homeCardLabel(block.id, card.id)}
            </div>
          ))}
        </div>
      );
    case 'primary':
    case 'games':
      if (cards.length === 0) return null;
      return (
        <div className="grid grid-cols-2 gap-1">
          {cards.map((card) => (
            <div
              key={card.id}
              className={`flex h-12 items-end rounded-md p-1 font-display text-[6.5px] text-white ${
                MINI_COLOR[card.id] ?? 'bg-brand-primary'
              } ${cards.length === 1 ? 'col-span-2' : ''}`}
            >
              {homeCardLabel(block.id, card.id).toUpperCase()}
            </div>
          ))}
        </div>
      );
  }
}

/**
 * Cards do início do app do jogador: ordem dos blocos, ordem dos cards dentro de cada bloco e o que aparece. Os
 * cards não mudam de bloco. Vale na hora para os jogadores; tudo é auditado.
 */
export default function HomeLayoutEditor({
  initial,
  canManage,
  primaryColor,
}: {
  initial: HomeLayout;
  canManage: boolean;
  /** Cor da banca, para a pré-visualização. */
  primaryColor: string;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [layout, setLayout] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dirty = !sameLayout(layout, saved);
  const isDefault = sameLayout(layout, DEFAULT_HOME_LAYOUT);

  const setBlocks = (blocks: HomeLayoutBlock[]) => {
    setMessage(null);
    setError(null);
    setLayout({ blocks });
  };
  const updateBlock = (id: HomeBlockId, patch: Partial<HomeLayoutBlock>) =>
    setBlocks(layout.blocks.map((block) => (block.id === id ? { ...block, ...patch } : block)));
  const drag = useDragList('blocks', (from, to) => setBlocks(move(layout.blocks, from, to)));

  async function save() {
    if (saving || !dirty) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await saveHomeLayoutAction(layout);
      if (result.ok) {
        setSaved(result.data);
        setLayout(result.data);
        setMessage('Cards do início salvos. Os jogadores já veem a nova ordem.');
        return;
      }
      if (result.code === 'SESSION_INVALID') return router.replace(ADMIN_ROUTES.login);
      setError(result.message);
    } catch {
      setError('Não foi possível salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="Cards do início" className={`${cardClass} p-5`}>
      <p className="text-[12.5px] text-admin-muted">
        {canManage
          ? 'Arraste pela alça ou use as setas para mudar a ordem. O interruptor mostra ou esconde o bloco (ou o card) no início do app do jogador.'
          : 'Seu perfil pode consultar, mas não alterar.'}
      </p>

      <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_auto]">
        <ol aria-label="Blocos do início" className="flex min-w-0 flex-col gap-2">
          {layout.blocks.map((block, i) => {
            const label = homeBlockLabel(block.id);
            return (
              <li
                key={block.id}
                {...drag.rowProps(i, canManage)}
                className={`rounded-lg border p-3 ${
                  drag.over === i ? 'border-admin-accent bg-admin-bg' : 'border-admin-border'
                }`}
              >
                <div className="flex items-center gap-2">
                  {canManage && <GripVertical className="h-5 w-5 shrink-0 cursor-grab text-admin-muted" aria-hidden />}
                  <span className="w-5 text-center text-[12px] font-semibold tabular-nums text-admin-muted">
                    {i + 1}
                  </span>
                  <span
                    className={`flex-1 text-[13.5px] font-semibold text-admin-text ${block.visible ? '' : 'opacity-50'}`}
                  >
                    {label}
                  </span>
                  {canManage && (
                    <MoveButtons
                      label={label}
                      index={i}
                      count={layout.blocks.length}
                      onMove={(to) => setBlocks(move(layout.blocks, i, to))}
                      size="h-4 w-4"
                    />
                  )}
                  <Switch
                    on={block.visible}
                    label={`Mostrar ${label}`}
                    disabled={!canManage}
                    onChange={() => updateBlock(block.id, { visible: !block.visible })}
                  />
                </div>
                {block.cards.length > 0 && block.visible && (
                  <CardList
                    block={block}
                    canManage={canManage}
                    onChange={(cards) => updateBlock(block.id, { cards })}
                  />
                )}
              </li>
            );
          })}
        </ol>

        <figure aria-hidden className="mx-auto w-[180px]">
          <div
            style={{ '--brand-primary': primaryColor } as CSSProperties}
            className="flex h-[380px] flex-col gap-1 overflow-hidden rounded-[22px] border-[5px] border-admin-text bg-[#EDEDED] font-body"
          >
            <div className="bg-brand-primary px-2 py-2 text-[6.5px] font-semibold text-white">Olá, Jogador</div>
            <div className="mx-1 rounded-md bg-white p-1.5">
              <div className="h-1.5 w-8 rounded bg-gray-200" />
              <div className="mt-1 h-2.5 w-14 rounded bg-gray-300" />
            </div>
            <div className="flex flex-col gap-1 px-1">
              {layout.blocks
                .filter((block) => block.visible)
                .map((block) => (
                  <PreviewBlock key={block.id} block={block} />
                ))}
            </div>
          </div>
          <figcaption className="mt-2 text-center text-[12px] text-admin-muted">Pré-visualização do início</figcaption>
        </figure>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-[12.5px] font-semibold text-admin-danger">
          {error}
        </p>
      )}
      {message && !error && (
        <p role="status" className="mt-4 text-[12.5px] font-semibold text-admin-success">
          {message}
        </p>
      )}
      {canManage && (
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={save} disabled={saving || !dirty} className={primaryButton}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
          <button
            type="button"
            onClick={() => setBlocks(saved.blocks)}
            disabled={saving || !dirty}
            className={secondaryButton}
          >
            Desfazer alterações
          </button>
          <button
            type="button"
            onClick={() => setBlocks(DEFAULT_HOME_LAYOUT.blocks)}
            disabled={saving || isDefault}
            className={secondaryButton}
          >
            Restaurar ordem padrão
          </button>
        </div>
      )}
    </section>
  );
}
