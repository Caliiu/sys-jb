'use client';

import type { AdminUserDetail } from '@sysjb/contracts';
import { Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';
import { updateUserAction } from '@/app/admin/actions';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { buildProfilePatch, type ProfileField, type ProfileValues, validateProfilePatch } from '@/lib/admin/profile';
import { maskCpfInput, maskPhoneInput } from '@/lib/masks';

type FieldErrors = Partial<Record<ProfileField, string>>;

interface FieldConfig {
  name: ProfileField;
  label: string;
  type: 'text' | 'email' | 'tel';
  inputMode?: 'numeric' | 'tel' | 'email';
  mask?: (value: string) => string;
}

const FIELDS: FieldConfig[] = [
  { name: 'name', label: 'Nome', type: 'text' },
  { name: 'document', label: 'CPF', type: 'text', inputMode: 'numeric', mask: maskCpfInput },
  { name: 'phone', label: 'Telefone', type: 'tel', inputMode: 'tel', mask: maskPhoneInput },
  { name: 'email', label: 'E-mail', type: 'email', inputMode: 'email' },
];

const fromUser = (user: AdminUserDetail): ProfileValues => ({
  name: user.name,
  document: maskCpfInput(user.document),
  phone: maskPhoneInput(user.phone),
  email: user.email ?? '',
});

const labelClass = 'text-[11.5px] font-semibold uppercase tracking-wide text-admin-muted';
const inputClass =
  'mt-1 h-10 w-full rounded-lg border bg-admin-surface px-3 text-[13.5px] text-admin-text outline-none focus:ring-2 focus:ring-admin-accent';

interface UserProfileCardProps {
  user: AdminUserDetail;
  /** Perfil com permissão de corrigir cadastro (a API confere de novo a cada salvamento). */
  canEdit: boolean;
}

/** Dados de cadastro: leitura por padrão; quem pode editar abre o formulário com "Editar". */
export default function UserProfileCard({ user, canEdit }: UserProfileCardProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<ProfileValues>(() => fromUser(user));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const busy = saving || refreshing;

  function startEditing() {
    setValues(fromUser(user));
    setErrors({});
    setFormError(null);
    setEditing(true);
  }

  function change(field: FieldConfig, raw: string) {
    setValues((prev) => ({ ...prev, [field.name]: field.mask ? field.mask(raw) : raw }));
    setErrors((prev) => ({ ...prev, [field.name]: undefined }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setFormError(null);

    const patch = buildProfilePatch(user, values);
    if (Object.keys(patch).length === 0) return setEditing(false);
    const invalid = validateProfilePatch(patch);
    if (Object.keys(invalid).length > 0) return setErrors(invalid);

    setSaving(true);
    try {
      const result = await updateUserAction(user.id, patch);
      if (result.ok) {
        // A edição fecha junto com a atualização da página (sem piscar os dados antigos).
        startTransition(() => {
          setEditing(false);
          router.refresh();
        });
      } else if (result.code === 'SESSION_INVALID') {
        router.replace(ADMIN_ROUTES.login);
      } else {
        setErrors(pickFieldErrors(result.fieldErrors));
        setFormError(result.message);
      }
    } catch {
      setFormError('Não foi possível salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="profile-title" className="rounded-xl bg-admin-surface p-5 shadow-admin">
      <div className="mb-4 flex items-center justify-between">
        <h2 id="profile-title" className="text-[14px] font-bold text-admin-text">
          Dados cadastrais
        </h2>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={startEditing}
            className="flex items-center gap-1.5 text-[12.5px] font-semibold text-admin-accent"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Editar
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={handleSubmit} noValidate>
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            {FIELDS.map((field) => {
              const error = errors[field.name];
              const id = `profile-${field.name}`;
              return (
                <div key={field.name}>
                  <label htmlFor={id} className={labelClass}>
                    {field.label}
                  </label>
                  <input
                    id={id}
                    name={field.name}
                    type={field.type}
                    inputMode={field.inputMode}
                    autoComplete="off"
                    value={values[field.name]}
                    onChange={(event) => change(field, event.target.value)}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${id}-error` : undefined}
                    className={`${inputClass} ${error ? 'border-admin-danger' : 'border-admin-border'}`}
                  />
                  {error && (
                    <p id={`${id}-error`} className="mt-1 text-[12px] font-semibold text-admin-danger">
                      {error}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {formError && (
            <p role="alert" className="mt-4 text-[12.5px] font-semibold text-admin-danger">
              {formError}
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={busy}
              className="rounded-lg border border-admin-border px-4 py-2 text-[13px] font-semibold text-admin-text disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-admin-accent px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
            >
              {busy ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      ) : (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {FIELDS.map((field) => (
            <div key={field.name}>
              <dt className={labelClass}>{field.label}</dt>
              <dd className="mt-0.5 break-words text-[13.5px] text-admin-text">{fromUser(user)[field.name] || '—'}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/** Só os campos que o formulário conhece (nunca confia em chaves arbitrárias vindas da resposta). */
function pickFieldErrors(fieldErrors: Record<string, string> | undefined): FieldErrors {
  const picked: FieldErrors = {};
  for (const { name } of FIELDS) {
    const message = fieldErrors?.[name];
    if (message) picked[name] = message;
  }
  return picked;
}
