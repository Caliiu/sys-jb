import TenantLogo from '../tenant/TenantLogo';

/** Faixa do topo dos comprovantes (Cotações, Premiadas): logo da banca, vendedor e data/hora da consulta. */
export default function ReceiptHeader({ sellerId, consultedAt }: { sellerId: number; consultedAt: string }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-brand-primary px-3 py-2 text-white">
      <TenantLogo size={36} className="w-9 h-9 rounded-full" />
      <div className="text-right text-[13px] leading-tight">
        <p className="font-bold">VENDEDOR: {sellerId}</p>
        <p>{consultedAt}</p>
      </div>
    </div>
  );
}
