import type { ReceiptSection } from '@/lib/receipt-pdf';

/**
 * Blocos do comprovante na tela, a partir das mesmas seções do PDF: bloco de uma linha com mais respiro
 * (as linhas de tabela), de várias linhas mais junto; traço embaixo de cada bloco.
 */
export default function ReceiptSections({ sections }: { sections: ReceiptSection[] }) {
  return sections.map((section, i) => (
    <div key={i} className={`border-b border-gray-200 px-3 ${section.length > 1 ? 'space-y-1.5 py-3' : 'py-4'}`}>
      {section.map((line, j) => (
        <p key={j} className="flex justify-between gap-3">
          <span>
            {typeof line.left === 'string'
              ? line.left
              : line.left.map((segment, k) =>
                  segment.bold ? <strong key={k}>{segment.text}</strong> : <span key={k}>{segment.text}</span>,
                )}
          </span>
          {line.right !== undefined &&
            (line.rightBold ? (
              <strong className="shrink-0 tabular-nums">{line.right}</strong>
            ) : (
              <span className="shrink-0 tabular-nums">{line.right}</span>
            ))}
        </p>
      ))}
    </div>
  ));
}
