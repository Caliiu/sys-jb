'use client';

import type { ReceiptPdfContent } from '@/lib/receipt-pdf';
import ReceiptScreen from '../receipt/ReceiptScreen';
import ReceiptSections from '../receipt/ReceiptSections';

interface ResultsScreenProps {
  /** Escolha das extrações do dia, com as marcadas (o voltar). */
  backHref: string;
  /** Conteúdo montado no servidor (resultsReceipt): o mesmo na tela e no PDF de "Compartilhar". */
  receipt: ReceiptPdfContent;
}

/** Resultados > Resultado loterias: resultado das extrações escolhidas no dia (número, grupo e bicho de cada prêmio). */
export default function ResultsScreen({ backHref, receipt }: ResultsScreenProps) {
  return (
    <ReceiptScreen title="Resultados" back={{ href: backHref, label: 'Voltar para as loterias' }} receipt={receipt}>
      <ReceiptSections sections={receipt.sections} />
    </ReceiptScreen>
  );
}
