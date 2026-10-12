'use client';

import {
  type AdminPaymentGateway,
  type AdminPaymentSettings,
  PAYMENT_GATEWAY_INFO,
  type PaymentGatewayTestResult,
} from '@sysjb/contracts';
import { ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useId, useState } from 'react';
import { savePaymentGatewayAction, setPaymentGatewayActiveAction, testPaymentGatewayAction } from '@/app/admin/actions';
import type { AdminActionResult } from '@/lib/admin/admin-result';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { controlClass, labelClass, outlineButtonClass, primaryButtonClass } from './filter-styles';
import { formatBrl } from '@/lib/currency';
import { formatDateTime } from '@/lib/datetime';
import AdminBox from './AdminBox';

interface PaymentGatewayCardProps {
  gateway: AdminPaymentGateway;
  /** Outro gateway já é o ativo da banca (ativar este o substitui). */
  anotherActive: boolean;
  /** Gerente: grava credenciais, testa e ativa. Os outros perfis só consultam. */
  canManage: boolean;
  /** false: o servidor está sem PAYMENTS_SECRET_KEY (não dá para gravar). */
  available: boolean;
  onSettings: (settings: AdminPaymentSettings) => void;
}

type Feedback = { tone: 'success' | 'danger'; text: string } | null;

/**
 * Um gateway em Configurações > Pagamentos: situação (ativo, configurado), credenciais (só gravar: o segredo nunca volta
 * do servidor), "Testar conexão" e ativar/desativar.
 */
export default function PaymentGatewayCard({
  gateway,
  anotherActive,
  canManage,
  available,
  onSettings,
}: PaymentGatewayCardProps) {
  const router = useRouter();
  const info = PAYMENT_GATEWAY_INFO[gateway.gateway];
  const ids = { clientId: useId(), clientSecret: useId(), activate: useId() };
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [activate, setActivate] = useState(gateway.active || !anotherActive);
  const [busy, setBusy] = useState<'save' | 'test' | 'active' | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /** Roda uma ação do painel com o mesmo tratamento de sessão, erro e "ocupado". */
  async function run<T>(
    kind: 'save' | 'test' | 'active',
    action: () => Promise<AdminActionResult<T>>,
    onOk: (data: T) => void,
  ) {
    if (busy) return;
    setBusy(kind);
    setFeedback(null);
    setFieldErrors({});
    try {
      const result = await action();
      if (result.ok) onOk(result.data);
      else if (result.code === 'SESSION_INVALID') router.replace(ADMIN_ROUTES.login);
      else {
        setFieldErrors(result.fieldErrors ?? {});
        setFeedback({ tone: 'danger', text: result.message });
      }
    } catch {
      setFeedback({ tone: 'danger', text: 'Não foi possível concluir. Tente novamente.' });
    } finally {
      setBusy(null);
    }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!clientId.trim() || !clientSecret.trim()) {
      setFeedback({ tone: 'danger', text: 'Informe o Client ID e o Client Secret.' });
      return;
    }
    void run(
      'save',
      () => savePaymentGatewayAction(gateway.gateway, { clientId, clientSecret, activate }),
      (settings: AdminPaymentSettings) => {
        // O segredo sai da tela assim que foi gravado.
        setClientId('');
        setClientSecret('');
        onSettings(settings);
        setFeedback({ tone: 'success', text: 'Credenciais salvas. Use "Testar conexão" para conferir.' });
      },
    );
  }

  const test = () =>
    run(
      'test',
      () => testPaymentGatewayAction(gateway.gateway),
      (result: PaymentGatewayTestResult) =>
        setFeedback({
          tone: result.ok ? 'success' : 'danger',
          text:
            result.ok && result.balanceCents !== null
              ? `${result.message} Saldo na conta: ${formatBrl(result.balanceCents)}.`
              : result.message,
        }),
    );

  const toggleActive = () =>
    run(
      'active',
      () => setPaymentGatewayActiveAction(gateway.gateway, !gateway.active),
      (settings: AdminPaymentSettings) => {
        onSettings(settings);
        setFeedback({
          tone: 'success',
          text: gateway.active ? 'Gateway desativado: a recarga Pix fica indisponível.' : 'Gateway ativado.',
        });
      },
    );

  const badge = gateway.active
    ? { text: 'Ativo', className: 'border-admin-success/25 bg-admin-success/10 text-admin-success' }
    : gateway.configured
      ? { text: 'Configurado', className: 'border-admin-border bg-admin-hover text-admin-text' }
      : { text: 'Não configurado', className: 'border-admin-border bg-admin-hover text-admin-muted' };

  return (
    <AdminBox
      title={info.label}
      actions={
        <>
          <span
            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] font-medium ${badge.className}`}
          >
            {badge.text}
          </span>
          <a
            href={info.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-admin-accent"
          >
            Documentação
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </>
      }
    >
      <div className="space-y-5 px-6 pt-3 pb-6">
        <dl className="grid gap-x-6 gap-y-2 text-[13.5px] sm:grid-cols-2">
          <div>
            <dt className="text-admin-muted">Credencial gravada</dt>
            <dd className="font-medium text-admin-text tabular-nums">{gateway.credentialsHint ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-admin-muted">Última alteração</dt>
            <dd className="font-medium text-admin-text">
              {gateway.updatedAt
                ? `${formatDateTime(gateway.updatedAt)}${gateway.updatedBy ? ` · ${gateway.updatedBy.name}` : ''}`
                : '—'}
            </dd>
          </div>
        </dl>

        {canManage && available && (
          <form onSubmit={save} noValidate aria-label={`Credenciais ${info.label}`} className="space-y-4">
            <p className="text-[12.5px] text-admin-muted">{info.requirements}</p>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor={ids.clientId} className={labelClass}>
                  {info.clientIdLabel}
                </label>
                <input
                  id={ids.clientId}
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={fieldErrors.clientId ? true : undefined}
                  className={controlClass}
                />
                {fieldErrors.clientId && <p className="mt-1 text-[12px] text-admin-danger">{fieldErrors.clientId}</p>}
              </div>
              <div>
                <label htmlFor={ids.clientSecret} className={labelClass}>
                  {info.clientSecretLabel}
                </label>
                <input
                  id={ids.clientSecret}
                  type="password"
                  value={clientSecret}
                  onChange={(event) => setClientSecret(event.target.value)}
                  autoComplete="new-password"
                  spellCheck={false}
                  aria-invalid={fieldErrors.clientSecret ? true : undefined}
                  className={controlClass}
                />
                {fieldErrors.clientSecret && (
                  <p className="mt-1 text-[12px] text-admin-danger">{fieldErrors.clientSecret}</p>
                )}
              </div>
            </div>
            <label htmlFor={ids.activate} className="flex items-center gap-2 text-[13.5px] text-admin-text">
              <input
                id={ids.activate}
                type="checkbox"
                checked={activate}
                onChange={(event) => setActivate(event.target.checked)}
                className="h-4 w-4 accent-admin-accent"
              />
              Usar este gateway nas recargas Pix
              {anotherActive && !gateway.active && ' (substitui o gateway ativo)'}
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={busy !== null} className={primaryButtonClass}>
                {busy === 'save' ? 'Salvando…' : gateway.configured ? 'Substituir credenciais' : 'Salvar credenciais'}
              </button>
              {gateway.configured && (
                <>
                  <button type="button" onClick={test} disabled={busy !== null} className={outlineButtonClass}>
                    {busy === 'test' ? 'Testando…' : 'Testar conexão'}
                  </button>
                  <button type="button" onClick={toggleActive} disabled={busy !== null} className={outlineButtonClass}>
                    {busy === 'active' ? 'Aguarde…' : gateway.active ? 'Desativar' : 'Ativar'}
                  </button>
                </>
              )}
            </div>
          </form>
        )}

        {feedback && (
          <p
            role={feedback.tone === 'danger' ? 'alert' : 'status'}
            className={`text-[13px] font-semibold ${feedback.tone === 'danger' ? 'text-admin-danger' : 'text-admin-success'}`}
          >
            {feedback.text}
          </p>
        )}
      </div>
    </AdminBox>
  );
}
