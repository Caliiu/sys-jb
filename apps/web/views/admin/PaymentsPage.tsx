'use client';

import type { AdminPaymentSettings, WithdrawalSettings } from '@sysjb/contracts';
import { Info } from 'lucide-react';
import { useState } from 'react';
import AdminPageTitle from '@/components/admin/AdminPageTitle';
import PaymentGatewayCard from '@/components/admin/PaymentGatewayCard';
import WithdrawalSettingsCard from '@/components/admin/WithdrawalSettingsCard';

interface PaymentsPageProps {
  settings: AdminPaymentSettings;
  /** Limites de saque da banca; null = não foi possível ler (o cartão não aparece). */
  withdrawals?: WithdrawalSettings | null;
  /** Gerente (payments.manage): grava, testa e ativa. */
  canManage: boolean;
}

/**
 * Configurações > Pagamentos: os gateways disponíveis e qual a banca usa nas recargas Pix. Um ativo por vez; sem
 * nenhum ativo, a recarga fica indisponível para os jogadores.
 */
export default function PaymentsPage({ settings: initial, withdrawals = null, canManage }: PaymentsPageProps) {
  const [settings, setSettings] = useState(initial);
  const active = settings.gateways.find((gateway) => gateway.active);

  return (
    <div className="space-y-6">
      <AdminPageTitle title="Pagamentos" />

      {!settings.available && (
        <p
          role="alert"
          className="rounded-xl border border-admin-danger/25 bg-admin-danger/10 px-4 py-3 text-[13.5px] text-admin-danger"
        >
          Pagamentos desligados neste servidor (falta a chave PAYMENTS_SECRET_KEY da API). Não é possível gravar
          credenciais nem gerar Pix. Fale com o suporte técnico.
        </p>
      )}

      <p className="flex items-start gap-2 text-[13.5px] text-admin-muted">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          {active
            ? 'As recargas Pix dos jogadores são geradas no gateway ativo. As credenciais ficam cifradas e não são exibidas de novo depois de salvas.'
            : 'Nenhum gateway ativo: a recarga Pix está indisponível para os jogadores.'}
          {!canManage && ' Só o Gerente altera esta configuração.'}
        </span>
      </p>

      {settings.gateways.map((gateway) => (
        <PaymentGatewayCard
          key={gateway.gateway}
          gateway={gateway}
          anotherActive={!!active && active.gateway !== gateway.gateway}
          canManage={canManage}
          available={settings.available}
          onSettings={setSettings}
        />
      ))}

      {withdrawals && <WithdrawalSettingsCard settings={withdrawals} canManage={canManage} />}
    </div>
  );
}
