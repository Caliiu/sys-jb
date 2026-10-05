'use client';

import { type AdminOperator, OPERATOR_ROLES, type OperatorRole } from '@sysjb/contracts';
import { Copy, KeyRound, Pencil, Plus, Power } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useId, useRef, useState } from 'react';
import { resetOperatorPasswordAction, saveOperatorAction, setOperatorStatusAction } from '@/app/admin/actions';
import { useOverlay } from '@/hooks/useOverlay';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { ROLE_LABELS } from '@/lib/admin/format';
import { formatDateTime } from '@/lib/datetime';
import ConfirmDialog from './ConfirmDialog';

const cardClass = 'overflow-hidden rounded-xl bg-admin-surface shadow-admin';
const thClass = 'px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-admin-muted';
const inputClass =
  'h-9 w-full rounded-lg border border-admin-border bg-admin-surface px-2.5 text-[13px] text-admin-text outline-none focus:ring-2 focus:ring-admin-accent disabled:bg-admin-bg disabled:text-admin-muted';
const primaryButton =
  'inline-flex h-9 items-center gap-1.5 rounded-lg bg-admin-accent px-3.5 text-[13px] font-semibold text-white active:bg-admin-accent-dark disabled:opacity-50';
const secondaryButton =
  'inline-flex h-9 items-center gap-1.5 rounded-lg border border-admin-border px-3.5 text-[13px] font-semibold text-admin-text disabled:opacity-50';
const iconButton = 'rounded-md p-1.5 text-admin-text hover:bg-admin-bg';

/** O que cada perfil pode fazer (resumo de ROLE_PERMISSIONS para quem escolhe o perfil). */
export const ROLE_HINTS: Record<OperatorRole, string> = {
  MANAGER: 'Tudo: apostadores, carteiras, relatórios, cotações, sorteios, personalização e operadores.',
  FINANCE: 'Só consulta: apostadores, pules, relatórios financeiros, cotações e sorteios.',
  SUPPORT: 'Consulta e corrige o cadastro dos apostadores e consulta as pules.',
};

type Message = { ok: boolean; text: string } | null;
interface Draft {
  id?: string;
  self: boolean;
  name: string;
  email: string;
  role: OperatorRole;
}
type Pending = { kind: 'status' | 'password'; operator: AdminOperator };

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

function OperatorForm({
  draft,
  onCancel,
  onSaved,
}: {
  draft: Draft;
  onCancel: () => void;
  onSaved: (operator: AdminOperator, password: string | null) => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState(draft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; fields: Record<string, string> } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await saveOperatorAction({
        ...(form.id ? { id: form.id } : {}),
        operator: { name: form.name, email: form.email, role: form.role },
      });
      if (result.ok) return onSaved(result.data.operator, result.data.password);
      if (result.code === 'SESSION_INVALID') return router.replace(ADMIN_ROUTES.login);
      setError({ message: result.message, fields: result.fieldErrors ?? {} });
    } catch {
      setError({ message: 'Não foi possível salvar. Tente novamente.', fields: {} });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label={form.id ? 'Alterar operador' : 'Novo operador'} className={`${cardClass} p-5`}>
      <h2 className="text-[14px] font-bold text-admin-text">{form.id ? 'Alterar operador' : 'Novo operador'}</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Field label="Nome" error={error?.fields.name}>
          {(id) => (
            <input
              id={id}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              maxLength={120}
              required
              autoComplete="off"
              className={inputClass}
            />
          )}
        </Field>
        <Field label="E-mail (login do painel)" error={error?.fields.email}>
          {(id) => (
            <input
              id={id}
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              maxLength={254}
              required
              autoComplete="off"
              className={inputClass}
            />
          )}
        </Field>
        <Field label="Perfil" error={error?.fields.role}>
          {(id) => (
            <select
              id={id}
              value={form.role}
              disabled={form.self}
              onChange={(e) => setForm({ ...form, role: e.target.value as OperatorRole })}
              className={inputClass}
            >
              {OPERATOR_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <p className="mt-2 text-[12px] text-admin-muted">
        {form.self ? 'Você não pode mudar o próprio perfil. ' : ''}
        {ROLE_HINTS[form.role]}
        {!form.id && ' A senha é gerada pelo sistema e mostrada uma única vez, ao salvar.'}
      </p>
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

/** Senha gerada, mostrada uma única vez (o banco guarda só o hash). */
function PasswordDialog({
  operator,
  password,
  onClose,
}: {
  operator: AdminOperator;
  password: string;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [copied, setCopied] = useState(false);
  useOverlay(true, onClose, panelRef);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-xl bg-admin-surface p-5 shadow-admin"
      >
        <h2 id={titleId} className="text-[15px] font-bold text-admin-text">
          Senha de {operator.name}
        </h2>
        <p className="mt-2 text-[13px] text-admin-muted">
          Mostrada só agora: guarde e entregue ao operador por um canal seguro. Ele entra no painel com o e-mail{' '}
          <strong className="text-admin-text">{operator.email}</strong> e esta senha.
        </p>
        <div className="mt-4 flex items-center gap-2">
          <code
            aria-label="Senha gerada"
            className="flex-1 select-all rounded-lg border border-admin-border bg-admin-bg px-3 py-2 font-mono text-[14px] text-admin-text"
          >
            {password}
          </code>
          <button type="button" onClick={copy} className={secondaryButton}>
            <Copy className="h-4 w-4" aria-hidden />
            {copied ? 'Copiada' : 'Copiar'}
          </button>
        </div>
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onClose} className={primaryButton}>
            Já guardei
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Administração > Operadores (só o Gerente): quem acessa o painel da banca. Cadastra com senha gerada (mostrada uma
 * vez), altera nome, e-mail e perfil, ativa/desativa (desativar derruba as sessões na hora) e gera nova senha. O
 * Gerente não muda o próprio perfil, não se desativa e não gera a própria senha. Tudo vai para a auditoria.
 */
export default function OperatorsManager({ initial }: { initial: AdminOperator[] }) {
  const router = useRouter();
  const [operators, setOperators] = useState(initial);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [revealed, setRevealed] = useState<{ operator: AdminOperator; password: string } | null>(null);

  const replace = (operator: AdminOperator) =>
    setOperators((list) =>
      list.some((o) => o.id === operator.id)
        ? list.map((o) => (o.id === operator.id ? operator : o))
        : [...list, operator],
    );

  async function confirm() {
    if (!pending || busy) return;
    setBusy(true);
    setDialogError(null);
    try {
      const { kind, operator } = pending;
      if (kind === 'status') {
        const result = await setOperatorStatusAction(operator.id, !operator.active);
        if (result.ok) {
          replace(result.data);
          setMessage({ ok: true, text: result.data.active ? 'Operador ativado.' : 'Operador desativado.' });
          setPending(null);
          return;
        }
        if (result.code === 'SESSION_INVALID') return router.replace(ADMIN_ROUTES.login);
        setDialogError(result.message);
      } else {
        const result = await resetOperatorPasswordAction(operator.id);
        if (result.ok) {
          replace(result.data.operator);
          setRevealed(result.data);
          setMessage({ ok: true, text: 'Nova senha gerada; as sessões abertas do operador foram encerradas.' });
          setPending(null);
          return;
        }
        if (result.code === 'SESSION_INVALID') return router.replace(ADMIN_ROUTES.login);
        setDialogError(result.message);
      }
    } catch {
      setDialogError('Não foi possível concluir. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  const ask = (kind: Pending['kind'], operator: AdminOperator) => {
    setMessage(null);
    setDialogError(null);
    setPending({ kind, operator });
  };

  const dialog = pending
    ? pending.kind === 'password'
      ? {
          title: `Gerar nova senha para ${pending.operator.name}?`,
          description: 'A senha atual deixa de valer e as sessões abertas do operador são encerradas.',
          confirmLabel: 'Gerar nova senha',
          tone: 'primary' as const,
        }
      : pending.operator.active
        ? {
            title: `Desativar ${pending.operator.name}?`,
            description: 'Ele sai do painel na hora (as sessões abertas são encerradas) e não consegue mais entrar.',
            confirmLabel: 'Desativar',
            tone: 'danger' as const,
          }
        : {
            title: `Ativar ${pending.operator.name}?`,
            description: 'Ele volta a entrar no painel com a senha que já tinha.',
            confirmLabel: 'Ativar',
            tone: 'primary' as const,
          }
    : null;

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
        <OperatorForm
          key={editing.id ?? 'new'}
          draft={editing}
          onCancel={() => setEditing(null)}
          onSaved={(operator, password) => {
            replace(operator);
            setMessage({ ok: true, text: editing.id ? 'Operador alterado.' : 'Operador cadastrado.' });
            setEditing(null);
            if (password) setRevealed({ operator, password });
          }}
        />
      )}

      <section aria-labelledby="operators-title" className={cardClass}>
        <div className="flex flex-wrap items-center gap-3 p-5 pb-3">
          <div className="min-w-0 flex-1">
            <h2 id="operators-title" className="text-[14px] font-bold text-admin-text">
              Operadores ({operators.length})
            </h2>
            <p className="mt-1 text-[12.5px] text-admin-muted">
              Quem acessa o painel desta banca. O e-mail é o login e é único em todas as bancas.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setMessage(null);
              setEditing({ self: false, name: '', email: '', role: 'SUPPORT' });
            }}
            className={primaryButton}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Novo operador
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead>
              <tr className="border-y border-admin-border">
                {['Operador', 'E-mail', 'Perfil', 'Situação', 'Último acesso'].map((header) => (
                  <th key={header} scope="col" className={thClass}>
                    {header}
                  </th>
                ))}
                <th scope="col" className={`${thClass} text-right`}>
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {operators.map((o) => (
                <tr key={o.id} className="border-b border-admin-border">
                  <th scope="row" className="px-4 py-2.5 font-medium">
                    {o.name}
                    {o.self && <span className="ml-1.5 font-normal text-admin-muted">(você)</span>}
                  </th>
                  <td className="px-4 py-2.5">{o.email}</td>
                  <td className="px-4 py-2.5">{ROLE_LABELS[o.role]}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold ${
                        o.active
                          ? 'border-admin-success/30 bg-admin-success/10 text-admin-success'
                          : 'border-admin-border bg-admin-bg text-admin-muted'
                      }`}
                    >
                      {o.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-admin-muted">
                    {o.lastLoginAt ? formatDateTime(o.lastLoginAt) : 'Nunca entrou'}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setMessage(null);
                          setEditing({ id: o.id, self: o.self, name: o.name, email: o.email, role: o.role });
                        }}
                        aria-label={`Alterar ${o.name}`}
                        className={iconButton}
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </button>
                      {!o.self && (
                        <>
                          <button
                            type="button"
                            onClick={() => ask('password', o)}
                            aria-label={`Gerar nova senha para ${o.name}`}
                            className={iconButton}
                          >
                            <KeyRound className="h-4 w-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => ask('status', o)}
                            aria-label={`${o.active ? 'Desativar' : 'Ativar'} ${o.name}`}
                            className={`${iconButton} ${o.active ? 'text-admin-danger' : ''}`}
                          >
                            <Power className="h-4 w-4" aria-hidden />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {dialog && (
        <ConfirmDialog
          open
          title={dialog.title}
          description={dialog.description}
          confirmLabel={dialog.confirmLabel}
          tone={dialog.tone}
          pending={busy}
          error={dialogError}
          onConfirm={confirm}
          onCancel={() => setPending(null)}
        />
      )}
      {revealed && (
        <PasswordDialog operator={revealed.operator} password={revealed.password} onClose={() => setRevealed(null)} />
      )}
    </div>
  );
}
