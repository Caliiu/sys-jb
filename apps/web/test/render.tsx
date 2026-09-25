import type { PublicTenant, PublicUser } from '@sysjb/contracts';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { TenantProvider } from '@/components/tenant/TenantProvider';
import { ToastProvider } from '@/components/ui/Toast';

export const tenant: PublicTenant = {
  name: 'Banca Teste',
  slug: 'teste',
  logoUrl: null,
  primaryColor: '#DF2120',
  secondaryColor: '#F4F1EA',
};

export const user: PublicUser = {
  id: '5b0f3c3e-4d1c-4b63-9a3a-0c1f2e3d4a5b',
  name: 'Pessoa Sintética',
  email: null,
  phone: '11912345678',
  document: '52998224725',
  avatar: null,
  displayId: 100042,
  wallet: {
    balanceJb: 123456,
    bonusJb: 500,
    prizesJb: 44,
    balanceGames: 1000,
    bonusGames: 0,
    prizesGames: 0,
    withdrawable: 0,
    totalAvailableJb: 124000,
    totalAvailableGames: 1000,
  },
  promoter: null,
  promoterName: null,
  promoterPhone: null,
};

export const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };

/** Renderiza com os providers de banca e de toast usados nas telas. */
export function renderWithProviders(ui: ReactElement) {
  return render(
    <TenantProvider tenant={tenant}>
      <ToastProvider>{ui}</ToastProvider>
    </TenantProvider>,
  );
}
