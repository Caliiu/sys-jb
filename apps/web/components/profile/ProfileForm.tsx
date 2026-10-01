'use client';

import type { PublicProfile } from '@sysjb/contracts';
import { CalendarDays, Mail, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useEffect, useRef, useState, useTransition } from 'react';
import { changePasswordAction, type ProfileFailure, updateProfileAction } from '@/app/profile-actions';
import { formatBirthDate } from '@/lib/datetime';
import { maskCpfInput, maskPhoneInput } from '@/lib/masks';
import { formatPhoneDisplay, newPasswordProblem, profileChanges, validateProfileChanges } from '@/lib/profile';
import { useToast } from '../ui/Toast';
import PasswordPanel from './PasswordPanel';

type FieldErrors = { phone?: string; email?: string; password?: string };

const labelClass = 'text-[14px] font-bold text-gray-900';
const inputClass =
  'h-12 w-full rounded-xl border bg-white px-3.5 text-[16px] text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand-primary/40 read-only:cursor-default read-only:text-gray-500 read-only:focus:ring-0';

function Field({ id, label, children }: { id: string; label: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={`block ${labelClass}`}>
        {label}
      </label>
      <div className="relative mt-2">{children}</div>
    </div>
  );
}

const Required = () => (
  <span aria-hidden className="ml-0.5 text-brand-primary">
    *
  </span>
);

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-[12.5px] font-semibold text-red-700">
      {message}
    </p>
  );
}

/**
 * Perfil: telefone (com "Alterar") e e-mail editáveis; CPF e data de nascimento só leitura; senha nova opcional.
 * "Salvar alterações" só habilita quando algo mudou. A API decide de verdade e só altera a conta da sessão.
 */
export default function ProfileForm({ profile }: { profile: PublicProfile }) {
  const router = useRouter();
  const toast = useToast();
  const phoneRef = useRef<HTMLInputElement>(null);

  const [phone, setPhone] = useState(() => maskPhoneInput(profile.phone));
  const [phoneEditing, setPhoneEditing] = useState(false);
  const [email, setEmail] = useState(profile.email ?? '');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, startTransition] = useTransition();

  useEffect(() => {
    if (phoneEditing) phoneRef.current?.focus();
  }, [phoneEditing]);

  const changes = profileChanges(profile, { email, phone });
  const wantsPassword = passwordOpen && password !== '';
  const dirty = Object.keys(changes).length > 0 || wantsPassword;
  const busy = saving || refreshing;

  function togglePhoneEdit() {
    if (phoneEditing) {
      setPhone(maskPhoneInput(profile.phone));
      setErrors((prev) => ({ ...prev, phone: undefined }));
    }
    setPhoneEditing((editing) => !editing);
  }

  function closePassword() {
    setPasswordOpen(false);
    setPassword('');
    setErrors((prev) => ({ ...prev, password: undefined }));
  }

  /** Falha de uma chamada: sessão encerrada vai ao login; o resto vira erro do campo e mensagem geral. */
  function showFailure(failure: ProfileFailure) {
    if (failure.code === 'SESSION_INVALID') return router.replace('/login');
    setErrors({
      email: failure.fieldErrors?.email,
      phone: failure.fieldErrors?.phone,
      password: failure.fieldErrors?.password,
    });
    setFormError(failure.message);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || !dirty) return;
    setFormError(null);

    // Feedback imediato; a API confere tudo de novo. A senha é checada contra o telefone que ficará salvo.
    const invalid: FieldErrors = validateProfileChanges(changes);
    if (wantsPassword) {
      const problem = newPasswordProblem(password, {
        document: profile.document,
        phone: changes.phone ?? profile.phone,
        birthDate: profile.birthDate,
      });
      if (problem) invalid.password = problem;
    }
    if (Object.values(invalid).some(Boolean)) return setErrors(invalid);
    setErrors({});

    setSaving(true);
    let profileSaved = false;
    try {
      if (Object.keys(changes).length > 0) {
        const result = await updateProfileAction(changes);
        if (!result.ok) return showFailure(result);
        profileSaved = true;
      }
      if (wantsPassword) {
        const result = await changePasswordAction({ password });
        if (!result.ok) {
          showFailure(result);
          if (profileSaved) {
            setFormError('Seus dados foram salvos, mas a senha não foi alterada.');
            startTransition(() => router.refresh());
          }
          return;
        }
      }

      toast.show('Perfil atualizado.');
      setPassword('');
      setPasswordOpen(false);
      setPhoneEditing(false);
      startTransition(() => router.refresh()); // a tela recarrega com os dados salvos
    } catch {
      setFormError('Não foi possível salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 bg-white px-4 pb-6 pt-5">
      <Field id="profile-phone" label="Telefone">
        <input
          id="profile-phone"
          ref={phoneRef}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          readOnly={!phoneEditing}
          value={phoneEditing ? phone : formatPhoneDisplay(profile.phone)}
          onChange={(event) => {
            setPhone(maskPhoneInput(event.target.value));
            setErrors((prev) => ({ ...prev, phone: undefined }));
          }}
          aria-invalid={errors.phone ? true : undefined}
          aria-describedby={errors.phone ? 'profile-phone-error' : undefined}
          className={`${inputClass} pr-24 ${errors.phone ? 'border-red-400' : 'border-gray-200'}`}
        />
        <button
          type="button"
          onClick={togglePhoneEdit}
          disabled={busy}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-brand-orange px-3 py-1 text-[12px] font-bold text-white disabled:opacity-60"
        >
          {phoneEditing ? 'Cancelar' : 'Alterar'}
        </button>
        <FieldError id="profile-phone-error" message={errors.phone} />
      </Field>

      <Field
        id="profile-document"
        label={
          <>
            CPF
            <Required />
          </>
        }
      >
        <input
          id="profile-document"
          readOnly
          value={maskCpfInput(profile.document)}
          className={`${inputClass} border-gray-200 pr-11`}
        />
        <UserRound
          className="pointer-events-none absolute right-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-gray-400"
          size={18}
          aria-hidden
        />
      </Field>

      <Field
        id="profile-birth-date"
        label={
          <>
            Data de nascimento
            <Required />
          </>
        }
      >
        <input
          id="profile-birth-date"
          readOnly
          value={formatBirthDate(profile.birthDate)}
          className={`${inputClass} border-gray-200 pr-11`}
        />
        <CalendarDays
          className="pointer-events-none absolute right-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-gray-400"
          size={18}
          aria-hidden
        />
      </Field>

      <Field
        id="profile-email"
        label={
          <>
            Email <span className="text-[12px] font-normal text-gray-400">(Opcional)</span>
          </>
        }
      >
        <input
          id="profile-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setErrors((prev) => ({ ...prev, email: undefined }));
          }}
          placeholder="Preencha seu email aqui"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? 'profile-email-error' : undefined}
          className={`${inputClass} pr-11 ${errors.email ? 'border-red-400' : 'border-gray-200'}`}
        />
        <Mail
          className="pointer-events-none absolute right-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-gray-500"
          size={18}
          aria-hidden
        />
        <FieldError id="profile-email-error" message={errors.email} />
      </Field>

      <PasswordPanel
        open={passwordOpen}
        onOpen={() => setPasswordOpen(true)}
        onClose={closePassword}
        value={password}
        onChange={(value) => {
          setPassword(value);
          setErrors((prev) => ({ ...prev, password: undefined }));
        }}
        error={errors.password ?? null}
      />

      <hr className="border-gray-200" />

      {formError && (
        <p role="alert" className="text-center text-[13px] font-semibold text-red-700">
          {formError}
        </p>
      )}

      <button
        type="submit"
        disabled={!dirty || busy}
        className="mt-2 flex h-[52px] w-full items-center justify-center rounded-2xl bg-brand-orange text-[16px] font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
      >
        {busy ? 'Salvando…' : 'Salvar alterações'}
      </button>
    </form>
  );
}
