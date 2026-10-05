'use client';

import type { ReceiptPdfContent } from '@/lib/receipt-pdf';
import ReceiptScreen from '../receipt/ReceiptScreen';
import ReceiptSections from '../receipt/ReceiptSections';
import type { BackAction } from '../ui/BackButton';

interface ResultsScreenProps {
  /** Volta para a escolha das extrações do dia, com as marcadas. */
  back: BackAction;
  /** Conteúdo do comprovante (resultsReceipt): o mesmo na tela e no PDF de "Compartilhar". */
  receipt: ReceiptPdfContent;
}

/** Resultados > Resultado loterias: resultado das extrações escolhidas no dia (número, grupo e bicho de cada prêmio). */
export default function ResultsScreen({ back, receipt }: ResultsScreenProps) {
  return (
    <ReceiptScreen title="Resultados" back={back} receipt={receipt}>
      <ReceiptSections sections={receipt.sections} />
    </ReceiptScreen>
  );
}
