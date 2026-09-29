'use client';

import type { ReactNode } from 'react';
import { openReceiptPdf, type ReceiptPdfContent } from '@/lib/receipt-pdf';
import SectionBar from '../section/SectionBar';
import { useTenant } from '../tenant/TenantProvider';
import type { BackAction } from '../ui/BackButton';
import { useToast } from '../ui/Toast';
import ReceiptActions from './ReceiptActions';
import ReceiptHeader from './ReceiptHeader';

/** Linha do comprovante: texto à esquerda e valor à direita, com traço embaixo. */
export const receiptRow = 'flex justify-between gap-3 px-3 py-4 border-b border-gray-200';

interface ReceiptScreenProps {
  title: string;
  back: BackAction;
  /** Conteúdo do PDF de "Compartilhar": o mesmo que a tela mostra (vendedor e data/hora inclusive). */
  receipt: ReceiptPdfContent;
  children: ReactNode;
}

/**
 * Tela de comprovante (Cotações, Premiadas, Reclame): barra, faixa com logo/vendedor/data e o conteúdo em
 * maiúsculas; no rodapé, Compartilhar (abre o PDF) e Voltar ao início.
 */
export default function ReceiptScreen({ title, back, receipt, children }: ReceiptScreenProps) {
  const tenant = useTenant();
  const toast = useToast();

  async function share() {
    if (!(await openReceiptPdf(tenant, receipt))) toast.show('Não foi possível gerar o PDF.');
  }

  return (
    <>
      <SectionBar title={title} back={back} />
      <main className="flex-1 bg-white text-[15px] tracking-wide text-gray-900 uppercase">
        <ReceiptHeader sellerId={receipt.sellerId} consultedAt={receipt.consultedAt} />
        {children}
      </main>
      <ReceiptActions onShare={share} />
    </>
  );
}
