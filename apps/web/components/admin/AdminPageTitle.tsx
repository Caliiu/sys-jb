'use client';

import { useTenant } from '../tenant/TenantProvider';

/** Título da página do painel com o nome da banca ao lado, em cinza (fora do h1: o título fica só o nome da página). */
export default function AdminPageTitle({ title }: { title: string }) {
  const tenant = useTenant();
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-2">
      <h1 className="text-[22px] font-normal text-admin-text">{title}</h1>
      <span className="text-[12.5px] uppercase text-admin-muted">{tenant.name}</span>
    </div>
  );
}
