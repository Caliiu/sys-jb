import type { useSheetDrag } from '@/hooks/useSheetDrag';

/**
 * Faixa do topo das folhas inferiores com a barrinha: arrastar daqui para baixo fecha (useSheetDrag). A faixa
 * toda é a área de pegar, não só a barrinha (mais fácil no celular). `className` ajusta as margens ao painel.
 */
export default function SheetHandle({
  handlers,
  enabled,
  className = '',
}: {
  handlers: ReturnType<typeof useSheetDrag>['handlers'];
  enabled: boolean;
  className?: string;
}) {
  return (
    <div
      data-sheet-handle
      aria-hidden
      {...handlers}
      className={`flex justify-center touch-none select-none ${enabled ? 'cursor-grab active:cursor-grabbing' : ''} ${className}`}
    >
      <span className="block h-1 w-10 rounded-full bg-gray-300" />
    </div>
  );
}
