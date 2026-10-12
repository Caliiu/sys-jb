'use client';

import {
  type AdminMural,
  MURAL_DISPLAY_LABELS,
  MURAL_DISPLAY_MODES,
  MURAL_IMAGE_TYPES,
  MURAL_LIMITS,
  MURAL_STATUS_LABELS,
  type MuralDisplayMode,
  type MuralStatus,
  type PublicTenant,
  muralStatus,
} from '@sysjb/contracts';
import { Eye, ImageUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type DragEvent, type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { deleteMuralAction, saveMuralAction } from '@/app/admin/actions';
import { useOverlay } from '@/hooks/useOverlay';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import ConfirmDialog from './ConfirmDialog';
import MuralPreview from './MuralPreview';

const cardClass = 'overflow-hidden rounded-xl bg-admin-surface shadow-admin';
const thClass = 'px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-admin-muted';
const inputClass =
  'h-9 w-full rounded-lg border border-admin-border bg-admin-surface px-2.5 text-[13px] text-admin-text outline-none focus:ring-2 focus:ring-admin-accent';
const primaryButton =
  'inline-flex h-9 items-center gap-1.5 rounded-lg bg-admin-accent px-3.5 text-[13px] font-semibold text-white active:bg-admin-accent-dark disabled:opacity-50';
const secondaryButton =
  'inline-flex h-9 items-center rounded-lg border border-admin-border px-3.5 text-[13px] font-semibold text-admin-text disabled:opacity-50';

const formatDate = (date: string) => date.split('-').reverse().join('/');
const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.ceil(bytes / 1024)} KB`;

const STATUS_CLASS: Record<MuralStatus, string> = {
  ACTIVE: 'border-admin-success/30 bg-admin-success/10 text-admin-success',
  SCHEDULED: 'border-sky-200 bg-sky-50 text-sky-700',
  ENDED: 'border-admin-border bg-admin-bg text-admin-muted',
};

type Message = { ok: boolean; text: string } | null;

/** Formulário do mural (novo ou edição). Na edição, sem arquivo novo a imagem salva continua. */
interface MuralDraft {
  id?: string;
  name: string;
  startsOn: string;
  endsOn: string;
  displayMode: MuralDisplayMode;
  /** Imagem já salva (edição). */
  savedImageUrl: string | null;
}

const emptyDraft = (today: string): MuralDraft => ({
  name: '',
  startsOn: today,
  endsOn: today,
  displayMode: 'ONCE',
  savedImageUrl: null,
});

const draftOf = (mural: AdminMural): MuralDraft => ({
  id: mural.id,
  name: mural.name,
  startsOn: mural.startsOn,
  endsOn: mural.endsOn,
  displayMode: mural.displayMode,
  savedImageUrl: ADMIN_ROUTES.muralImage(mural.id, mural.version),
});

/** Confere o arquivo antes de enviar (o servidor confere de novo pelo conteúdo). null = ok. */
function fileProblem(file: File): string | null {
  if (!(MURAL_IMAGE_TYPES as readonly string[]).includes(file.type)) return 'Use uma imagem PNG, JPG ou WebP.';
  if (file.size > MURAL_LIMITS.imageMaxBytes) return 'Imagem acima de 3 MB.';
  return null;
}

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

function MuralForm({
  draft,
  today,
  tenant,
  onCancel,
  onSaved,
}: {
  draft: MuralDraft;
  today: string;
  tenant: PublicTenant;
  onCancel: () => void;
  onSaved: (data: AdminMural[]) => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState(draft);
  const [picked, setPicked] = useState<{ file: File; url: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; fields: Record<string, string> } | null>(null);
  const fileInputId = useId();
  const set = <K extends keyof MuralDraft>(key: K, value: MuralDraft[K]) =>
    setForm((cur) => ({ ...cur, [key]: value }));

  const file = picked?.file ?? null;

  // O endereço temporário do arquivo escolhido é liberado ao trocar de arquivo e quando o formulário fecha.
  const pickedUrl = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (pickedUrl.current) URL.revokeObjectURL(pickedUrl.current);
    },
    [],
  );

  function choose(next: File | null) {
    if (pickedUrl.current) URL.revokeObjectURL(pickedUrl.current);
    const url = next ? URL.createObjectURL(next) : null;
    pickedUrl.current = url;
    setPicked(next && url ? { file: next, url } : null);
  }

  function pick(next: File | undefined) {
    if (!next) return;
    const problem = fileProblem(next);
    if (problem) {
      setError({ message: problem, fields: { image: problem } });
      return;
    }
    setError(null);
    choose(next);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer.files[0]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (!form.id && !file) {
      setError({ message: 'Envie a imagem do mural.', fields: { image: 'Envie a imagem do mural.' } });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = new FormData();
      if (form.id) data.set('id', form.id);
      data.set('name', form.name);
      data.set('startsOn', form.startsOn);
      data.set('endsOn', form.endsOn);
      data.set('displayMode', form.displayMode);
      if (file) data.set('image', file);
      const result = await saveMuralAction(data);
      if (result.ok) return onSaved(result.data);
      if (result.code === 'SESSION_INVALID') return router.replace(ADMIN_ROUTES.login);
      setError({ message: result.message, fields: result.fieldErrors ?? {} });
    } catch {
      setError({ message: 'Não foi possível salvar. Tente novamente.', fields: {} });
    } finally {
      setSaving(false);
    }
  }

  const fieldError = (name: string) => error?.fields[name];
  const title = form.id ? `Editar ${draft.name}` : 'Novo mural';
  const imageUrl = picked?.url ?? form.savedImageUrl;

  return (
    <form onSubmit={submit} aria-label={title} className={`${cardClass} p-5`}>
      <h2 className="text-[14px] font-bold text-admin-text">{title}</h2>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-4">
          <Field label="Nome do mural" error={fieldError('name')}>
            {(id) => (
              <input
                id={id}
                value={form.name}
                maxLength={MURAL_LIMITS.nameMax}
                required
                onChange={(e) => set('name', e.target.value)}
                placeholder="Ex.: Raspadinha Coelho da Fortuna"
                className={inputClass}
              />
            )}
          </Field>

          <fieldset>
            <legend className="text-[12px] font-semibold text-admin-muted">Vigência</legend>
            <div className="mt-1 grid gap-3 sm:grid-cols-2">
              <Field label="Data inicial" error={fieldError('startsOn')}>
                {(id) => (
                  <input
                    id={id}
                    type="date"
                    value={form.startsOn}
                    required
                    onChange={(e) => {
                      const startsOn = e.target.value;
                      setForm((cur) => ({ ...cur, startsOn, endsOn: cur.endsOn < startsOn ? startsOn : cur.endsOn }));
                    }}
                    className={`${inputClass} tabular-nums`}
                  />
                )}
              </Field>
              <Field label="Data final" error={fieldError('endsOn')}>
                {(id) => (
                  <input
                    id={id}
                    type="date"
                    value={form.endsOn}
                    min={form.startsOn > today ? form.startsOn : today}
                    required
                    onChange={(e) => set('endsOn', e.target.value)}
                    className={`${inputClass} tabular-nums`}
                  />
                )}
              </Field>
            </div>
            <p className="mt-1.5 text-[12px] text-admin-muted">Dias inteiros, no horário de Brasília.</p>
          </fieldset>

          <fieldset>
            <legend className="text-[12px] font-semibold text-admin-muted">Tipo de exibição</legend>
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
              {MURAL_DISPLAY_MODES.map((mode) => (
                <label
                  key={mode}
                  className={`flex cursor-pointer gap-2.5 rounded-lg border p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-admin-accent ${
                    form.displayMode === mode ? 'border-admin-accent bg-admin-bg' : 'border-admin-border'
                  }`}
                >
                  <input
                    type="radio"
                    name="displayMode"
                    value={mode}
                    checked={form.displayMode === mode}
                    onChange={() => set('displayMode', mode)}
                    className="mt-0.5 accent-admin-accent"
                  />
                  <span>
                    <span className="block text-[13px] font-semibold text-admin-text">
                      {MURAL_DISPLAY_LABELS[mode]}
                    </span>
                    <span className="block text-[12px] text-admin-muted">
                      {mode === 'ONCE'
                        ? 'Cada jogador vê uma vez só, em qualquer aparelho.'
                        : 'Aparece toda vez que o jogador abre o app.'}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-1">
            <span id={`${fileInputId}-label`} className="text-[12px] font-semibold text-admin-muted">
              Imagem
            </span>
            <label
              htmlFor={fileInputId}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-admin-accent ${
                dragging ? 'border-admin-accent bg-admin-bg' : 'border-admin-border'
              }`}
            >
              <ImageUp className="h-6 w-6 text-admin-muted" aria-hidden />
              <span className="text-[13px] font-semibold text-admin-text">
                {file ? file.name : form.id ? 'Trocar imagem' : 'Escolher imagem'}
              </span>
              <span className="text-[12px] text-admin-muted">
                {file
                  ? formatBytes(file.size)
                  : 'Clique ou arraste. PNG, JPG ou WebP até 3 MB. Formato de celular (em pé) fica melhor.'}
              </span>
              <input
                id={fileInputId}
                type="file"
                accept={MURAL_IMAGE_TYPES.join(',')}
                aria-labelledby={`${fileInputId}-label`}
                className="sr-only"
                onChange={(e) => {
                  pick(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
            {form.id && file && (
              <button
                type="button"
                onClick={() => choose(null)}
                className="self-start text-[12px] font-semibold text-admin-muted underline"
              >
                Manter a imagem atual
              </button>
            )}
            {fieldError('image') && (
              <p className="text-[12px] font-semibold text-admin-danger">{fieldError('image')}</p>
            )}
          </div>
        </div>

        <MuralPreview tenant={tenant} imageUrl={imageUrl} name={form.name} />
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

/** Pré-visualização de um mural salvo, num diálogo (Esc ou toque fora fecham). */
function PreviewDialog({ mural, tenant, onClose }: { mural: AdminMural; tenant: PublicTenant; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useOverlay(true, onClose, panelRef);

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-xl bg-admin-surface p-5 shadow-admin"
      >
        <h2 id={titleId} className="mb-4 text-[15px] font-bold text-admin-text">
          {mural.name}
        </h2>
        <MuralPreview tenant={tenant} imageUrl={ADMIN_ROUTES.muralImage(mural.id, mural.version)} name="" />
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className={secondaryButton}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Murais da banca: avisos com imagem que o jogador vê ao abrir o app, dentro da vigência. "Apenas uma vez"
 * é registrado por jogador no servidor; "Sempre" aparece a cada abertura. Tudo é auditado.
 */
export default function MuralsManager({
  initial,
  canManage,
  today,
  tenant,
}: {
  initial: AdminMural[];
  canManage: boolean;
  /** Hoje em Brasília (YYYY-MM-DD). */
  today: string;
  tenant: PublicTenant;
}) {
  const router = useRouter();
  const [murals, setMurals] = useState(initial);
  const [editing, setEditing] = useState<MuralDraft | null>(null);
  const [previewing, setPreviewing] = useState<AdminMural | null>(null);
  const [deleting, setDeleting] = useState<AdminMural | null>(null);
  const [pending, setPending] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);

  async function confirmDelete() {
    if (!deleting || pending) return;
    setPending(true);
    setDialogError(null);
    try {
      const result = await deleteMuralAction(deleting.id);
      if (result.ok) {
        setMurals(result.data);
        setMessage({ ok: true, text: 'Mural excluído.' });
        if (editing?.id === deleting.id) setEditing(null);
        setDeleting(null);
        return;
      }
      if (result.code === 'SESSION_INVALID') return router.replace(ADMIN_ROUTES.login);
      setDialogError(result.message);
    } catch {
      setDialogError('Não foi possível concluir. Tente novamente.');
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
        <MuralForm
          key={editing.id ?? 'new'}
          draft={editing}
          today={today}
          tenant={tenant}
          onCancel={() => setEditing(null)}
          onSaved={(next) => {
            setMurals(next);
            setMessage({ ok: true, text: editing.id ? 'Mural alterado.' : 'Mural cadastrado.' });
            setEditing(null);
          }}
        />
      )}

      <section aria-labelledby="murals-title" className={cardClass}>
        <div className="flex flex-wrap items-center gap-3 p-5 pb-3">
          <div className="min-w-0 flex-1">
            <h2 id="murals-title" className="text-[14px] font-bold text-admin-text">
              Murais ({murals.length})
            </h2>
            <p className="mt-1 text-[12.5px] text-admin-muted">
              O mural aparece para o jogador logado ao abrir o app, dentro da vigência. Com mais de um no ar, ele vê um
              depois do outro, do mais recente para o mais antigo.
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => {
                setMessage(null);
                setEditing(emptyDraft(today));
              }}
              className={primaryButton}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Novo mural
            </button>
          )}
        </div>

        {murals.length === 0 ? (
          <p className="border-t border-admin-border px-5 py-8 text-center text-[13px] text-admin-muted">
            Nenhum mural cadastrado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead>
                <tr className="border-y border-admin-border">
                  <th scope="col" className={thClass}>
                    Mural
                  </th>
                  <th scope="col" className={thClass}>
                    Vigência
                  </th>
                  <th scope="col" className={thClass}>
                    Exibição
                  </th>
                  <th scope="col" className={thClass}>
                    Já viram
                  </th>
                  <th scope="col" className={thClass}>
                    Situação
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {murals.map((m) => {
                  const status = muralStatus(m, today);
                  return (
                    <tr key={m.id} className="border-b border-admin-border">
                      <th scope="row" className="px-4 py-2 font-medium">
                        <span className="flex items-center gap-3">
                          {/* Miniatura da imagem salva (rota do painel). */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={ADMIN_ROUTES.muralImage(m.id, m.version)}
                            alt=""
                            width={36}
                            height={48}
                            loading="lazy"
                            className="h-12 w-9 shrink-0 rounded border border-admin-border bg-admin-bg object-cover"
                          />
                          {m.name}
                        </span>
                      </th>
                      <td className="px-4 py-2 tabular-nums">
                        {formatDate(m.startsOn)} a {formatDate(m.endsOn)}
                      </td>
                      <td className="px-4 py-2">{MURAL_DISPLAY_LABELS[m.displayMode]}</td>
                      <td className="px-4 py-2 tabular-nums">
                        {m.displayMode === 'ONCE' ? `${m.viewsCount.toLocaleString('pt-BR')} jogador(es)` : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold ${STATUS_CLASS[status]}`}
                        >
                          {MURAL_STATUS_LABELS[status]}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setPreviewing(m)}
                            aria-label={`Visualizar ${m.name}`}
                            className="rounded-md p-1.5 text-admin-text hover:bg-admin-bg"
                          >
                            <Eye className="h-4 w-4" aria-hidden />
                          </button>
                          {canManage && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setMessage(null);
                                  setEditing(draftOf(m));
                                  window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                aria-label={`Editar ${m.name}`}
                                className="rounded-md p-1.5 text-admin-text hover:bg-admin-bg"
                              >
                                <Pencil className="h-4 w-4" aria-hidden />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDialogError(null);
                                  setDeleting(m);
                                }}
                                aria-label={`Excluir ${m.name}`}
                                className="rounded-md p-1.5 text-admin-danger hover:bg-admin-bg"
                              >
                                <Trash2 className="h-4 w-4" aria-hidden />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {previewing && <PreviewDialog mural={previewing} tenant={tenant} onClose={() => setPreviewing(null)} />}

      <ConfirmDialog
        open={deleting !== null}
        title={`Excluir ${deleting?.name ?? 'mural'}?`}
        description="O mural sai do app na hora e o registro de quem já viu é apagado. Não dá para desfazer."
        confirmLabel="Excluir"
        tone="danger"
        pending={pending}
        error={dialogError}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
