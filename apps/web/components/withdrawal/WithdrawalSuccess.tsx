'use client';

import { CircleCheck } from 'lucide-react';
import Link from 'next/link';
import { formatBrl } from '@/lib/currency';
import { pixKeyDisplay } from '@/lib/pix-key';
import { ROUTES } from '@/lib/routes';
import type { WithdrawalItem } from '@/lib/withdrawal';
import SectionBar from '../section/SectionBar';
import DetailRows from './DetailRows';

interface WithdrawalSuccessProps {
  /** Saque que acabou de ser solicitado (devolvido pelo servidor). */
  withdrawal: WithdrawalItem;
  /** "Acompanhar status": vai para a lista "Meus saques". */
  onTrack: () => void;
}

/** "Solicitação enviada": só aparece depois que o servidor confirma a criação do saque. */
export default function WithdrawalSuccess({ withdrawal, onTrack }: WithdrawalSuccessProps) {
  return (
    <>
      <SectionBar title="Solicitação enviada" back={{ onClick: onTrack }} />
      <main className="bg-white px-4 pb-10 pt-8">
        <div className="flex flex-col items-center text-center">
          <span aria-hidden className="flex h-[86px] w-[86px] items-center justify-center rounded-full bg-emerald-100">
            <CircleCheck className="h-11 w-11 text-emerald-500" strokeWidth={1.75} />
          </span>
          <h2 className="mt-5 text-[24px] font-extrabold text-gray-900">Solicitação enviada</h2>
          <p className="mt-1 text-[14px] text-gray-500">Seu saque está sendo processado.</p>
        </div>

        <div className="mt-6">
          <DetailRows
            rows={[
              { label: 'Valor', value: formatBrl(withdrawal.amountCents) },
              { label: 'Forma', value: 'Pix' },
              { label: 'Destino', value: pixKeyDisplay(withdrawal.keyType, withdrawal.keyValue) },
            ]}
          />
        </div>

        <button
          type="button"
          onClick={onTrack}
          className="mt-4 flex h-[46px] w-full items-center justify-center rounded-xl bg-brand-primary text-[14px] font-bold text-white transition-transform active:scale-[0.98]"
        >
          Acompanhar status
        </button>
        <Link href={ROUTES.home} className="mt-3 flex h-10 items-center justify-center text-[14px] text-gray-500">
          Voltar ao início
        </Link>
      </main>
    </>
  );
}
