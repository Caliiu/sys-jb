'use client';

import type { ReceiptPdfContent } from '@/lib/receipt-pdf';
import ReceiptScreen from '../receipt/ReceiptScreen';
import ReceiptSections from '../receipt/ReceiptSections';

interface ReportScreenProps {
  /** Rota da escolha da data (o voltar). */
  backHref: string;
  /** Conteúdo montado no servidor: o mesmo na tela e no PDF de "Compartilhar". */
  receipt: ReceiptPdfContent;
}

/** Relatórios > Consultar saldo / Movimento loterias de um dia. */
export default function ReportScreen({ backHref, receipt }: ReportScreenProps) {
  return (
    <ReceiptScreen title="Relatórios" back={{ href: backHref, label: 'Voltar para as datas' }} receipt={receipt}>
      <ReceiptSections sections={receipt.sections} />
    </ReceiptScreen>
  );
}
