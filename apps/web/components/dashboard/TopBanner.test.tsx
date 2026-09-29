import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TenantProvider } from '@/components/tenant/TenantProvider';
import { tenant } from '@/test/render';
import { InviteProvider } from './InviteProvider';
import TopBanner from './TopBanner';

const renderBanner = (patch: Partial<typeof tenant>) =>
  render(
    <TenantProvider tenant={{ ...tenant, ...patch }}>
      <InviteProvider inviteCode="CDYGE">
        <TopBanner />
      </InviteProvider>
    </TenantProvider>,
  );

describe('Barra de convite', () => {
  it('ligada: mostra o texto definido no painel e o botão Indicar', () => {
    renderBanner({ inviteBarEnabled: true, inviteBarText: 'Convide e ganhe R$ 10' });
    expect(screen.getByText('Convide e ganhe R$ 10')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Indicar' })).toBeInTheDocument();
  });

  it('desligada: não aparece', () => {
    const { container } = renderBanner({ inviteBarEnabled: false });
    expect(container).toBeEmptyDOMElement();
  });
});
