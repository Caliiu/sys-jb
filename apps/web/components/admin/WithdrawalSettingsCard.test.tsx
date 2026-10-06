import type { WithdrawalSettings } from '@sysjb/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, router } from '@/test/render';

const saveWithdrawalSettingsAction = vi.fn();
vi.mock('@/app/admin/actions', () => ({
  saveWithdrawalSettingsAction: (...args: unknown[]) => saveWithdrawalSettingsAction(...args),
}));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const { default: WithdrawalSettingsCard, withdrawalSettingsProblem } = await import('./WithdrawalSettingsCard');

const SETTINGS: WithdrawalSettings = {
  enabled: true,
  minCents: 1000,
  maxCents: 500000,
  dailyCount: 3,
  autoLimitCents: 20000,
};

beforeEach(() => vi.clearAllMocks());

describe('Limites de saque', () => {
  it('confere a coerência antes de enviar', () => {
    expect(withdrawalSettingsProblem(SETTINGS)).toBeNull();
    expect(withdrawalSettingsProblem({ ...SETTINGS, minCents: 50 })).toMatch(/pelo menos R\$ 1,00/);
    expect(withdrawalSettingsProblem({ ...SETTINGS, maxCents: 500 })).toMatch(/não pode ser menor que o mínimo/);
    expect(withdrawalSettingsProblem({ ...SETTINGS, autoLimitCents: 600000 })).toMatch(/não pode passar do máximo/);
    expect(withdrawalSettingsProblem({ ...SETTINGS, dailyCount: 0 })).toMatch(/de 1 a 50/);
  });

  it('Gerente altera e salva; o servidor devolve o que ficou gravado', async () => {
    const ui = userEvent.setup();
    saveWithdrawalSettingsAction.mockResolvedValue({ ok: true, data: { ...SETTINGS, autoLimitCents: 0 } });
    renderWithProviders(<WithdrawalSettingsCard settings={SETTINGS} canManage />);
    const auto = screen.getByLabelText('Aprovação automática até');
    await ui.clear(auto);
    await ui.type(auto, '0');
    await ui.click(screen.getByRole('button', { name: 'Salvar limites' }));
    expect(saveWithdrawalSettingsAction).toHaveBeenCalledExactlyOnceWith({ ...SETTINGS, autoLimitCents: 0 });
    expect(await screen.findByText('Limites de saque salvos.')).toBeInTheDocument();
  });

  it('valor incoerente não chega ao servidor', async () => {
    const ui = userEvent.setup();
    renderWithProviders(<WithdrawalSettingsCard settings={{ ...SETTINGS, maxCents: 1000 }} canManage />);
    const min = screen.getByLabelText('Mínimo por saque');
    await ui.clear(min);
    await ui.type(min, '200000');
    await ui.click(screen.getByRole('button', { name: 'Salvar limites' }));
    expect(screen.getByRole('alert')).toHaveTextContent('O máximo por saque não pode ser menor que o mínimo.');
    expect(saveWithdrawalSettingsAction).not.toHaveBeenCalled();
  });

  it('outros perfis só consultam', () => {
    renderWithProviders(<WithdrawalSettingsCard settings={SETTINGS} canManage={false} />);
    expect(screen.queryByRole('button', { name: 'Salvar limites' })).toBeNull();
    expect(screen.getByLabelText('Mínimo por saque')).toBeDisabled();
    expect(screen.getByText('Só o Gerente altera os limites de saque.')).toBeInTheDocument();
  });
});
