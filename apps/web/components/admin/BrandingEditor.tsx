'use client';

import { type AdminBranding, BRANDING_LIMITS, HEX_COLOR, LOGO_IMAGE_TYPES } from '@sysjb/contracts';
import { ImageUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type DragEvent, type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { saveBrandingAction } from '@/app/admin/actions';
import { maskPhoneInput } from '@/lib/masks';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import BrandingPreview from './BrandingPreview';

const cardClass = 'overflow-hidden rounded-xl bg-admin-surface shadow-admin';
const inputClass =
  'h-9 w-full rounded-lg border border-admin-border bg-admin-surface px-2.5 text-[13px] text-admin-text outline-none focus:ring-2 focus:ring-admin-accent';
const primaryButton =
  'inline-flex h-9 items-center gap-1.5 rounded-lg bg-admin-accent px-3.5 text-[13px] font-semibold text-white active:bg-admin-accent-dark disabled:opacity-50';
const secondaryButton =
  'inline-flex h-9 items-center rounded-lg border border-admin-border px-3.5 text-[13px] font-semibold text-admin-text disabled:opacity-50';

const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.ceil(bytes / 1024)} KB`;

/** Confere o arquivo antes de enviar (o servidor confere de novo pelo conteúdo). null = ok. */
function fileProblem(file: File): string | null {
  if (!(LOGO_IMAGE_TYPES as readonly string[]).includes(file.type)) return 'Use uma imagem PNG, JPG ou WebP.';
  if (file.size > BRANDING_LIMITS.logoMaxBytes) return 'Logo acima de 1 MB.';
  return null;
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[12px] font-semibold text-admin-muted">
        {label}
      </label>
      {children(id)}
      {hint && !error && <p className="text-[12px] text-admin-muted">{hint}</p>}
      {error && <p className="text-[12px] font-semibold text-admin-danger">{error}</p>}
    </div>
  );
}

/**
 * Identidade visual da banca: nome, logo, cor principal e o texto da barra de convite, com pré-visualização. Vale
 * na hora para os jogadores (o app lê a banca a cada página). Tudo é auditado.
 */
export default function BrandingEditor({ initial, canManage }: { initial: AdminBranding; canManage: boolean }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [primaryColor, setPrimaryColor] = useState(initial.primaryColor);
  const [inviteBarText, setInviteBarText] = useState(initial.inviteBarText);
  const [inviteBarEnabled, setInviteBarEnabled] = useState(initial.inviteBarEnabled);
  const [supportPhone, setSupportPhone] = useState(maskPhoneInput(initial.supportPhone ?? ''));
  const inviteBarId = useId();
  const [picked, setPicked] = useState<{ file: File; url: string } | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; fields: Record<string, string> } | null>(null);
  const fileInputId = useId();

  // O endereço temporário do arquivo escolhido é liberado ao trocar de arquivo e ao sair da página.
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
      setError({ message: problem, fields: { logo: problem } });
      return;
    }
    setError(null);
    setRemoveLogo(false);
    choose(next);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (canManage) pick(event.dataTransfer.files[0]);
  }

  function reset() {
    setName(saved.name);
    setPrimaryColor(saved.primaryColor);
    setInviteBarText(saved.inviteBarText);
    setInviteBarEnabled(saved.inviteBarEnabled);
    setSupportPhone(maskPhoneInput(saved.supportPhone ?? ''));
    setRemoveLogo(false);
    choose(null);
    setError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const data = new FormData();
      data.set('name', name);
      data.set('primaryColor', primaryColor);
      // A cor secundária ainda não aparece no app: vai a atual, sem mudança.
      data.set('secondaryColor', saved.secondaryColor);
      data.set('inviteBarText', inviteBarText);
      data.set('inviteBarEnabled', inviteBarEnabled ? '1' : '0');
      data.set('supportPhone', supportPhone);
      if (picked) data.set('logo', picked.file);
      else if (removeLogo) data.set('removeLogo', '1');
      const result = await saveBrandingAction(data);
      if (result.ok) {
        setSaved(result.data);
        setName(result.data.name);
        setPrimaryColor(result.data.primaryColor);
        setInviteBarText(result.data.inviteBarText);
        setInviteBarEnabled(result.data.inviteBarEnabled);
        setSupportPhone(maskPhoneInput(result.data.supportPhone ?? ''));
        setRemoveLogo(false);
        choose(null);
        setMessage('Identidade visual salva. Os jogadores já veem a nova versão.');
        // Menu do painel (nome e logo) com a identidade nova.
        router.refresh();
        return;
      }
      if (result.code === 'SESSION_INVALID') return router.replace(ADMIN_ROUTES.login);
      setError({ message: result.message, fields: result.fieldErrors ?? {} });
    } catch {
      setError({ message: 'Não foi possível salvar. Tente novamente.', fields: {} });
    } finally {
      setSaving(false);
    }
  }

  const fieldError = (field: string) => error?.fields[field];
  const colorValid = HEX_COLOR.test(primaryColor);
  const logoUrl = picked?.url ?? (removeLogo ? null : saved.logoUrl);
  const logoLabel = picked
    ? picked.file.name
    : removeLogo
      ? 'Sem logo enviada (volta à padrão ao salvar)'
      : saved.hasCustomLogo
        ? 'Logo enviada pelo painel'
        : saved.logoUrl
          ? 'Logo padrão da banca'
          : 'Sem logo (aparece a inicial do nome)';

  return (
    <form onSubmit={submit} aria-label="Identidade visual" className={`${cardClass} p-5`}>
      <div className="grid gap-8 lg:grid-cols-[1fr_auto]">
        <fieldset disabled={!canManage} className="flex min-w-0 flex-col gap-5">
          <Field
            label="Nome da banca"
            hint="Aparece no login (sem logo), na aba do navegador e no atalho da tela inicial."
            error={fieldError('name')}
          >
            {(id) => (
              <input
                id={id}
                value={name}
                maxLength={BRANDING_LIMITS.nameMax}
                required
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
            )}
          </Field>

          <div className="flex flex-col gap-1">
            <span id={`${fileInputId}-label`} className="text-[12px] font-semibold text-admin-muted">
              Logo
            </span>
            <label
              htmlFor={fileInputId}
              onDragOver={(event) => {
                event.preventDefault();
                if (canManage) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`flex items-center gap-4 rounded-lg border-2 border-dashed px-4 py-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-admin-accent ${
                canManage ? 'cursor-pointer' : ''
              } ${dragging ? 'border-admin-accent bg-admin-bg' : 'border-admin-border'}`}
            >
              <span
                style={{ backgroundColor: colorValid ? primaryColor : saved.primaryColor }}
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg"
              >
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" className="h-11 w-11 object-contain" />
                ) : (
                  <ImageUp className="h-6 w-6 text-white" aria-hidden />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-admin-text">{logoLabel}</span>
                <span className="block text-[12px] text-admin-muted">
                  {picked
                    ? formatBytes(picked.file.size)
                    : 'Clique ou arraste. PNG, JPG ou WebP até 1 MB. Quadrada e com fundo transparente fica melhor.'}
                </span>
              </span>
              <input
                id={fileInputId}
                type="file"
                accept={LOGO_IMAGE_TYPES.join(',')}
                aria-labelledby={`${fileInputId}-label`}
                className="sr-only"
                onChange={(e) => {
                  pick(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
            {canManage && (picked || (saved.hasCustomLogo && !removeLogo)) && (
              <button
                type="button"
                onClick={() => {
                  if (picked) choose(null);
                  else setRemoveLogo(true);
                }}
                className="self-start text-[12px] font-semibold text-admin-muted underline"
              >
                {picked ? 'Descartar a logo escolhida' : 'Remover a logo enviada'}
              </button>
            )}
            {fieldError('logo') && <p className="text-[12px] font-semibold text-admin-danger">{fieldError('logo')}</p>}
          </div>

          <Field
            label="Cor principal"
            hint="Fundo do login, topo do app, botões e destaques."
            error={fieldError('primaryColor')}
          >
            {(id) => (
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Escolher a cor principal"
                  value={colorValid ? primaryColor.toLowerCase() : '#000000'}
                  onChange={(e) => setPrimaryColor(e.target.value.toUpperCase())}
                  className="h-9 w-12 cursor-pointer rounded-lg border border-admin-border bg-admin-surface p-1"
                />
                <input
                  id={id}
                  value={primaryColor}
                  maxLength={7}
                  onChange={(e) => {
                    const raw = e.target.value.toUpperCase().replace(/[^#0-9A-F]/g, '');
                    setPrimaryColor(raw.startsWith('#') ? raw : `#${raw}`);
                  }}
                  className={`${inputClass} w-28 font-mono uppercase`}
                />
              </div>
            )}
          </Field>

          <div className="flex flex-col gap-3 rounded-lg border border-admin-border p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p id={`${inviteBarId}-title`} className="text-[13px] font-semibold text-admin-text">
                  Barra de convite
                </p>
                <p className="text-[12px] text-admin-muted">
                  {inviteBarEnabled
                    ? 'Ligada: aparece no topo de todas as telas do jogador, com o botão Indicar.'
                    : 'Desligada: não aparece em nenhuma tela do jogador.'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={inviteBarEnabled}
                aria-labelledby={`${inviteBarId}-title`}
                onClick={() => setInviteBarEnabled((on) => !on)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-accent focus-visible:ring-offset-2 disabled:opacity-50 ${
                  inviteBarEnabled ? 'bg-admin-success' : 'bg-gray-300'
                }`}
              >
                <span
                  aria-hidden
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    inviteBarEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
            <Field label="Texto da barra de convite" error={fieldError('inviteBarText')}>
              {(id) => (
                <input
                  id={id}
                  value={inviteBarText}
                  maxLength={BRANDING_LIMITS.inviteBarMax}
                  required
                  onChange={(e) => setInviteBarText(e.target.value)}
                  className={`${inputClass} ${inviteBarEnabled ? '' : 'opacity-60'}`}
                />
              )}
            </Field>
          </div>

          <Field
            label="WhatsApp do suporte"
            hint="Botão Atendimento do app. Jogador com promotor vinculado fala com o promotor; os demais, com este número."
            error={fieldError('supportPhone')}
          >
            {(id) => (
              <input
                id={id}
                value={supportPhone}
                inputMode="tel"
                autoComplete="off"
                placeholder="(11) 98765-4321"
                onChange={(e) => setSupportPhone(maskPhoneInput(e.target.value))}
                className={`${inputClass} w-56 tabular-nums`}
              />
            )}
          </Field>

          {!canManage && <p className="text-[12.5px] text-admin-muted">Seu perfil pode consultar, mas não alterar.</p>}
        </fieldset>

        <BrandingPreview
          name={name}
          primaryColor={colorValid ? primaryColor : saved.primaryColor}
          secondaryColor={saved.secondaryColor}
          inviteBarText={inviteBarText.trim() || saved.inviteBarText}
          inviteBarEnabled={inviteBarEnabled}
          logoUrl={logoUrl}
        />
      </div>

      {error && (
        <p role="alert" className="mt-4 text-[12.5px] font-semibold text-admin-danger">
          {error.message}
        </p>
      )}
      {message && !error && (
        <p role="status" className="mt-4 text-[12.5px] font-semibold text-admin-success">
          {message}
        </p>
      )}
      {canManage && (
        <div className="mt-5 flex gap-2">
          <button type="submit" disabled={saving || !colorValid} className={primaryButton}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
          <button type="button" onClick={reset} disabled={saving} className={secondaryButton}>
            Desfazer alterações
          </button>
        </div>
      )}
    </form>
  );
}
