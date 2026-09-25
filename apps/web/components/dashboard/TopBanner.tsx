'use client';

import { useInvite } from './InviteProvider';

export default function TopBanner() {
  const { openInvite } = useInvite();

  return (
    <div className="flex items-center justify-center gap-3 bg-brand-orange px-4 py-1">
      <p className="text-white text-[13px] font-semibold leading-tight">Indique um amigo e ganhe bônus</p>
      <button
        type="button"
        onClick={openInvite}
        className="shrink-0 bg-white text-brand-primary text-[13px] font-bold px-4 py-1 rounded-md shadow-sm active:scale-95 transition-transform"
      >
        Indicar
      </button>
    </div>
  );
}
