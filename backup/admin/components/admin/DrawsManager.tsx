'use client';

import {
  type AdminDraw,
  type AdminDrawsResponse,
  DRAW_EXCEPTION_LABELS,
  DRAW_GAME_LABELS,
  DRAW_DEFAULT_GAMES,
  DRAW_GAMES,
  DRAW_LIMITS,
  type DrawExceptionKind,
  type DrawGame,
  RESULT_SOURCE_OPTIONS,
  type ResultSource,
  type SaveDrawRequest,
  WEEKDAY_SHORT,
  extractionLabel,
  groupDraws,
  resultSourceLabel,
} from '@sysjb/contracts';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useId, useState } from 'react';
import {
  addDrawExceptionAction,
  deleteDrawAction,
  removeDrawExceptionAction,
  saveDrawAction,
} from '@/app/admin/actions';
import type { AdminActionResult } from '@/lib/admin/admin-result';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import ConfirmDialog from './ConfirmDialog';

const cardClass = 'overflow-hidden rounded-xl bg-admin-surface shadow-admin';
const thClass = 'px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-admin-muted';
const inputClass =
  'h-9 w-full rounded-lg border border-admin-border bg-admin-surface px-2.5 text-[13px] text-admin-text outline-none focus:ring-2 focus:ring-admin-accent';
const primaryButton =
  'inline-flex h-9 items-center gap-1.5 rounded-lg bg-admin-accent px-3.5 text-[13px] font-semibold text-white active:bg-admin-accent-dark disabled:opacity-50';
const secondaryButton =
  'inline-flex h-9 items-center rounded-lg border border-admin-border px-3.5 text-[13px] font-semibold text-admin-text disabled:opacity-50';

/** Seg…Dom (a semana de trabalho primeiro), como nos checkboxes do formulário. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const weekdaysLabel = (weekdays: number[]) =>
  weekdays.length === 7
    ? 'Todos os dias'
    : WEEK_ORDER.filter((d) => weekdays.includes(d))
        .map((d) => WEEKDAY_SHORT[d])
        .join(', ');

const gamesLabel = (games: DrawGame[]) => games.map((g) => DRAW_GAME_LABELS[g]).join(' · ');

const formatDate = (date: string) => date.split('-').reverse().join('/');

/** Valor do select de resultado: "rj:9" (sigla + extração); '' = sem ligação. */
const sourceValue = (source: ResultSource | null) => (source ? `${source.lottery}:${source.extraction}` : '');
function sourceFrom(value: string): ResultSource | null {
  const [lottery, extraction] = value.split(':');
  return lottery && extraction ? { lottery, extraction: Number(extraction) } : null;
}

type Message = { ok: boolean; text: string } | null;

/** Formulário do sorteio (novo ou edição): o que a API recebe, mais o id na edição. */
interface DrawDraft extends SaveDrawRequest {
  id?: string;
}

const emptyDraft = (sortOrder: number): DrawDraft => ({
  group: '',
  name: '',
  code: '',
  drawTime: '',
  closesAt: '',
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  games: [...DRAW_DEFAULT_GAMES],
  result: null,
  active: true,
  sortOrder,
});

const draftOf = (draw: AdminDraw): DrawDraft => ({
  id: draw.id,
  group: draw.group,
  name: draw.name,
  code: draw.code,
  drawTime: draw.drawTime,
  closesAt: draw.closesAt,
  weekdays: draw.weekdays,
  games: draw.games,
  result: draw.result,
  active: draw.active,
  sortOrder: draw.sortOrder,
});

function Field({ label, error, children }: { label: string; error?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[12px] font-semibold text-admin-muted">
        {label}
      </label>
      {children(id)}
      {error && <p className="text-[12px] font-semibold text-admin-danger">{error}</p>}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`inline-flex h-8 cursor-pointer items-center rounded-full border px-3 text-[12.5px] font-semibold ${
        checked ? 'border-admin-accent bg-admin-accent text-white' : 'border-admin-border text-admin-text'
      } has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-admin-accent`}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function DrawForm({
  draft,
  groups,
  onCancel,
  onSaved,
}: {
  draft: DrawDraft;
  groups: string[];
  onCancel: () => void;
  onSaved: (data: AdminDrawsResponse) => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState(draft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; fields: Record<string, string> } | null>(null);
  const groupsId = useId();
  const set = <K extends keyof DrawDraft>(key: K, value: DrawDraft[K]) => setForm((cur) => ({ ...cur, [key]: value }));
  const toggleIn = <T,>(list: T[], value: T, on: boolean) =>
    on ? [...list.filter((v) => v !== value), value] : list.filter((v) => v !== value);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const { id, ...body } = form;
      const result = await saveDrawAction({ ...(id ? { id } : {}), draw: body });
      if (result.ok) return onSaved(result.data);
      if (result.code === 'SESSION_INVALID') return router.replace(ADMIN_ROUTES.login);
      setError({ message: result.message, fields: result.fieldErrors ?? {} });
    } catch {
      setError({ message: 'Não foi possível salvar. Tente novamente.', fields: {} });
    } finally {
      setSaving(false);
    }
  }

  const fieldError = (name: string) =>
    error?.fields[name] ?? Object.entries(error?.fields ?? {}).find(([field]) => field.startsWith(`${name}.`))?.[1];

  return (
    <form
      onSubmit={submit}
      aria-label={form.id ? `Editar ${draft.name}` : 'Novo sorteio'}
      className={`${cardClass} p-5`}
    >
      <h2 className="text-[14px] font-bold text-admin-text">{form.id ? `Editar ${draft.name}` : 'Novo sorteio'}</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Grupo" error={fieldError('group')}>
          {(id) => (
            <>
              <input
                id={id}
                list={groupsId}
                value={form.group}
                maxLength={DRAW_LIMITS.groupMax}
                onChange={(e) => set('group', e.target.value.toUpperCase())}
                placeholder="Ex.: RIO/FEDERAL"
                className={inputClass}
              />
              <datalist id={groupsId}>
                {groups.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Nome (no pule)" error={fieldError('name')}>
          {(id) => (
            <input
              id={id}
              value={form.name}
              maxLength={DRAW_LIMITS.nameMax}
              onChange={(e) => set('name', e.target.value.toUpperCase())}
              placeholder="Ex.: LT PT RIO 09HS"
              className={inputClass}
            />
          )}
        </Field>
        <Field label="Código (relatórios)" error={fieldError('code')}>
          {(id) => (
            <input
              id={id}
              value={form.code}
              maxLength={DRAW_LIMITS.codeMax}
              onChange={(e) => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="Vazio = gerado do nome"
              autoComplete="off"
              className={`${inputClass} uppercase`}
            />
          )}
        </Field>
        <Field label="Horário do sorteio" error={fieldError('drawTime')}>
          {(id) => (
            <input
              id={id}
              type="time"
              value={form.drawTime}
              onChange={(e) => set('drawTime', e.target.value)}
              className={`${inputClass} tabular-nums`}
            />
          )}
        </Field>
        <Field label="Venda até" error={fieldError('closesAt')}>
          {(id) => (
            <input
              id={id}
              type="time"
              value={form.closesAt}
              onChange={(e) => set('closesAt', e.target.value)}
              className={`${inputClass} tabular-nums`}
            />
          )}
        </Field>
      </div>

      <fieldset className="mt-4">
        <legend className="text-[12px] font-semibold text-admin-muted">Dias da semana</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {WEEK_ORDER.map((day) => (
            <Toggle
              key={day}
              label={WEEKDAY_SHORT[day]!}
              checked={form.weekdays.includes(day)}
              onChange={(on) => set('weekdays', toggleIn(form.weekdays, day, on))}
            />
          ))}
        </div>
        {fieldError('weekdays') && (
          <p className="mt-1 text-[12px] font-semibold text-admin-danger">{fieldError('weekdays')}</p>
        )}
      </fieldset>

      <div className="mt-4 flex flex-wrap items-start gap-6">
        <fieldset>
          <legend className="text-[12px] font-semibold text-admin-muted">Vale para</legend>
          <div className="mt-1.5 flex gap-1.5">
            {DRAW_GAMES.map((game) => (
              <Toggle
                key={game}
                label={DRAW_GAME_LABELS[game]}
                checked={form.games.includes(game)}
                onChange={(on) =>
                  set(
                    'games',
                    DRAW_GAMES.filter((g) => (g === game ? on : form.games.includes(g))),
                  )
                }
              />
            ))}
          </div>
          {fieldError('games') && (
            <p className="mt-1 text-[12px] font-semibold text-admin-danger">{fieldError('games')}</p>
          )}
        </fieldset>
        <Field label="Resultado (provedor)" error={fieldError('result')}>
          {(id) => (
            <select
              id={id}
              value={sourceValue(form.result)}
              onChange={(e) => set('result', sourceFrom(e.target.value))}
              className={inputClass}
            >
              <option value="">Sem resultado</option>
              {RESULT_SOURCE_OPTIONS.map((option) => (
                <optgroup key={option.name} label={option.name}>
                  {option.sources.map((source) => (
                    <option key={sourceValue(source)} value={sourceValue(source)}>
                      {option.name} {extractionLabel(source.extraction)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </Field>
        <Field label="Ordem na lista" error={fieldError('sortOrder')}>
          {(id) => (
            <input
              id={id}
              type="number"
              min={0}
              max={DRAW_LIMITS.sortOrderMax}
              value={form.sortOrder}
              onChange={(e) => set('sortOrder', Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
              className={`${inputClass} w-28 tabular-nums`}
            />
          )}
        </Field>
        <fieldset>
          <legend className="text-[12px] font-semibold text-admin-muted">Situação</legend>
          <div className="mt-1.5">
            <Toggle
              label={form.active ? 'Ativo' : 'Inativo'}
              checked={form.active}
              onChange={(on) => set('active', on)}
            />
          </div>
        </fieldset>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-[12.5px] font-semibold text-admin-danger">
          {error.message}
        </p>
      )}
      <div className="mt-5 flex gap-2">
        <button type="submit" disabled={saving} className={primaryButton}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className={secondaryButton}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function ExceptionForm({
  draws,
  today,
  onSaved,
}: {
  draws: AdminDraw[];
  today: string;
  onSaved: (data: AdminDrawsResponse) => void;
}) {
  const router = useRouter();
  const [date, setDate] = useState('');
  const [kind, setKind] = useState<DrawExceptionKind>('CANCEL');
  const [drawId, setDrawId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await addDrawExceptionAction({
        date,
        kind,
        drawId: drawId || null,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      if (result.ok) {
        setDate('');
        setNote('');
        return onSaved(result.data);
      }
      if (result.code === 'SESSION_INVALID') return router.replace(ADMIN_ROUTES.login);
      setError(Object.values(result.fieldErrors ?? {})[0] ?? result.message);
    } catch {
      setError('Não foi possível salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label="Nova exceção" className="border-t border-admin-border p-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[160px_160px_1fr_1fr_auto] lg:items-end">
        <Field label="Data">
          {(id) => (
            <input
              id={id}
              type="date"
              min={today}
              value={date}
              required
              onChange={(e) => setDate(e.target.value)}
              className={`${inputClass} tabular-nums`}
            />
          )}
        </Field>
        <Field label="Tipo">
          {(id) => (
            <select
              id={id}
              value={kind}
              onChange={(e) => {
                const next = e.target.value as DrawExceptionKind;
                setKind(next);
                if (next === 'EXTRA' && !drawId) setDrawId(draws[0]?.id ?? '');
              }}
              className={inputClass}
            >
              <option value="CANCEL">{DRAW_EXCEPTION_LABELS.CANCEL}</option>
              <option value="EXTRA">{DRAW_EXCEPTION_LABELS.EXTRA}</option>
            </select>
          )}
        </Field>
        <Field label="Sorteio">
          {(id) => (
            <select id={id} value={drawId} onChange={(e) => setDrawId(e.target.value)} className={inputClass}>
              {kind === 'CANCEL' && <option value="">Todos os sorteios (feriado)</option>}
              {draws.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.drawTime})
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Observação">
          {(id) => (
            <input
              id={id}
              value={note}
              maxLength={DRAW_LIMITS.noteMax}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex.: Feriado"
              className={inputClass}
            />
          )}
        </Field>
        <button type="submit" disabled={saving || !date} className={primaryButton}>
          {saving ? 'Salvando…' : 'Adicionar'}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-[12.5px] font-semibold text-admin-danger">
          {error}
        </p>
      )}
    </form>
  );
}

/**
 * Cadastro de sorteios da banca (uma lista para Loterias e Fazendinha) e exceções de data. Alterações que
 * deixariam apostas vendidas sem sorteio são recusadas pela API; tudo é auditado.
 */
export default function DrawsManager({
  initial,
  canManage,
  today,
}: {
  initial: AdminDrawsResponse;
  canManage: boolean;
  /** Hoje em Brasília (YYYY-MM-DD): menor data de exceção. */
  today: string;
}) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [group, setGroup] = useState('');
  const [editing, setEditing] = useState<DrawDraft | null>(null);
  const [deleting, setDeleting] = useState<AdminDraw | null>(null);
  const [pending, setPending] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);

  const groups = groupDraws(data.draws);
  const shown = group ? groups.filter((g) => g.label === group) : groups;
  const nextOrder = Math.min(DRAW_LIMITS.sortOrderMax, Math.max(0, ...data.draws.map((d) => d.sortOrder)) + 10);

  function applied(next: AdminDrawsResponse, text: string) {
    setData(next);
    setMessage({ ok: true, text });
  }

  /** Exclusões (sorteio ou exceção): null = feito; senão, a mensagem de erro. */
  async function runRemoval(
    action: () => Promise<AdminActionResult<AdminDrawsResponse>>,
    text: string,
  ): Promise<string | null> {
    if (pending) return 'Aguarde a operação em andamento.';
    setPending(true);
    setMessage(null);
    try {
      const result = await action();
      if (result.ok) {
        applied(result.data, text);
        return null;
      }
      if (result.code === 'SESSION_INVALID') router.replace(ADMIN_ROUTES.login);
      return result.message;
    } catch {
      return 'Não foi possível concluir. Tente novamente.';
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {message && (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={`text-[12.5px] font-semibold ${message.ok ? 'text-admin-success' : 'text-admin-danger'}`}
        >
          {message.text}
        </p>
      )}

      {editing && (
        <DrawForm
          key={editing.id ?? 'new'}
          draft={editing}
          groups={groups.map((g) => g.label)}
          onCancel={() => setEditing(null)}
          onSaved={(next) => {
            applied(next, editing.id ? 'Sorteio alterado.' : 'Sorteio cadastrado.');
            setEditing(null);
          }}
        />
      )}

      <section aria-labelledby="draws-title" className={cardClass}>
        <div className="flex flex-wrap items-center gap-3 p-5 pb-3">
          <div className="min-w-0 flex-1">
            <h2 id="draws-title" className="text-[14px] font-bold text-admin-text">
              Sorteios ({data.draws.length})
            </h2>
            <p className="mt-1 text-[12.5px] text-admin-muted">
              Uma lista para Loterias e Fazendinha. Horários de Brasília; a venda fecha no horário de &quot;Venda
              até&quot;. Com apostas vendidas, o sorteio não pode ser desativado, perder dias ou jogos, nem ser
              renomeado ou excluído (o estorno vem com a apuração).
            </p>
          </div>
          <label className="flex items-center gap-2 text-[12.5px] text-admin-muted">
            Grupo
            <select value={group} onChange={(e) => setGroup(e.target.value)} className={`${inputClass} w-44`}>
              <option value="">Todos</option>
              {groups.map((g) => (
                <option key={g.label} value={g.label}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          {canManage && (
            <button
              type="button"
              onClick={() => {
                setMessage(null);
                setEditing({ ...emptyDraft(nextOrder), group: group || '' });
              }}
              className={primaryButton}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Novo sorteio
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-[13px]">
            <thead>
              <tr className="border-y border-admin-border">
                <th scope="col" className={thClass}>
                  Sorteio
                </th>
                <th scope="col" className={thClass}>
                  Código
                </th>
                <th scope="col" className={thClass}>
                  Horário
                </th>
                <th scope="col" className={thClass}>
                  Venda até
                </th>
                <th scope="col" className={thClass}>
                  Dias
                </th>
                <th scope="col" className={thClass}>
                  Jogos
                </th>
                <th scope="col" className={thClass}>
                  Resultado
                </th>
                <th scope="col" className={thClass}>
                  Situação
                </th>
                {canManage && (
                  <th scope="col" className={`${thClass} text-right`}>
                    Ações
                  </th>
                )}
              </tr>
            </thead>
            {shown.map((g) => (
              <tbody key={g.label} aria-label={g.label}>
                <tr className="bg-admin-bg">
                  <th
                    scope="colgroup"
                    colSpan={canManage ? 9 : 8}
                    className="px-4 py-2 text-[12px] font-bold tracking-wide text-admin-text"
                  >
                    {g.label}
                  </th>
                </tr>
                {g.draws.map((d) => (
                  <tr key={d.id} className={`border-b border-admin-border ${d.active ? '' : 'text-admin-muted'}`}>
                    <th scope="row" className="px-4 py-2 font-medium">
                      {d.name}
                    </th>
                    <td className="px-4 py-2 font-mono text-[12px]">{d.code}</td>
                    <td className="px-4 py-2 tabular-nums">{d.drawTime}</td>
                    <td className="px-4 py-2 tabular-nums">{d.closesAt}</td>
                    <td className="px-4 py-2">{weekdaysLabel(d.weekdays)}</td>
                    <td className="px-4 py-2">{gamesLabel(d.games)}</td>
                    <td className="px-4 py-2">
                      {d.result ? resultSourceLabel(d.result) : <span className="text-admin-muted">—</span>}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold ${
                          d.active
                            ? 'border-admin-success/30 bg-admin-success/10 text-admin-success'
                            : 'border-admin-border bg-admin-bg text-admin-muted'
                        }`}
                      >
                        {d.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setMessage(null);
                              setEditing(draftOf(d));
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            aria-label={`Editar ${d.name}`}
                            className="rounded-md p-1.5 text-admin-text hover:bg-admin-bg"
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDialogError(null);
                              setDeleting(d);
                            }}
                            aria-label={`Excluir ${d.name}`}
                            className="rounded-md p-1.5 text-admin-danger hover:bg-admin-bg"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
        {data.draws.length === 0 && (
          <p className="px-5 py-8 text-center text-[13px] text-admin-muted">Nenhum sorteio cadastrado.</p>
        )}
      </section>

      <section aria-labelledby="exceptions-title" className={cardClass}>
        <div className="p-5 pb-3">
          <h2 id="exceptions-title" className="text-[14px] font-bold text-admin-text">
            Exceções de data
          </h2>
          <p className="mt-1 text-[12.5px] text-admin-muted">
            Feriado ou sorteio cancelado (&quot;Sem sorteio&quot;) e sorteio fora dos dias dele (&quot;Sorteio
            extra&quot;). Só de hoje em diante.
          </p>
        </div>
        {data.exceptions.length === 0 ? (
          <p className="border-t border-admin-border px-5 py-6 text-center text-[13px] text-admin-muted">
            Nenhuma exceção programada.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[13px]">
              <thead>
                <tr className="border-y border-admin-border">
                  <th scope="col" className={thClass}>
                    Data
                  </th>
                  <th scope="col" className={thClass}>
                    Tipo
                  </th>
                  <th scope="col" className={thClass}>
                    Sorteio
                  </th>
                  <th scope="col" className={thClass}>
                    Observação
                  </th>
                  {canManage && (
                    <th scope="col" className={`${thClass} text-right`}>
                      Ações
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.exceptions.map((e) => (
                  <tr key={e.id} className="border-b border-admin-border last:border-0">
                    <td className="px-4 py-2 tabular-nums">{formatDate(e.date)}</td>
                    <td className="px-4 py-2">{DRAW_EXCEPTION_LABELS[e.kind]}</td>
                    <td className="px-4 py-2">{e.drawName ?? 'Todos os sorteios'}</td>
                    <td className="px-4 py-2 text-admin-muted">{e.note ?? '—'}</td>
                    {canManage && (
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            void runRemoval(() => removeDrawExceptionAction(e.id), 'Exceção removida.').then(
                              (failure) => failure && setMessage({ ok: false, text: failure }),
                            )
                          }
                          disabled={pending}
                          aria-label={`Remover exceção de ${formatDate(e.date)} (${e.drawName ?? 'todos os sorteios'})`}
                          className="rounded-md p-1.5 text-admin-danger hover:bg-admin-bg disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canManage && (
          <ExceptionForm
            draws={data.draws.filter((d) => d.active)}
            today={today}
            onSaved={(next) => applied(next, 'Exceção adicionada.')}
          />
        )}
      </section>

      <ConfirmDialog
        open={deleting !== null}
        title="Excluir sorteio"
        description={`Excluir ${deleting?.name ?? ''}? Só é possível se ele nunca teve apostas; para parar de vender, prefira desativar.`}
        confirmLabel="Excluir"
        tone="danger"
        pending={pending}
        error={dialogError}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          setDialogError(null);
          void runRemoval(() => deleteDrawAction(deleting!.id), 'Sorteio excluído.').then((failure) =>
            failure ? setDialogError(failure) : setDeleting(null),
          );
        }}
      />
    </div>
  );
}
