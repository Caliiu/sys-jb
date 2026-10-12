import type { DepositBonusSettings } from '@sysjb/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, router } from '@/test/render';

const saveDepositBonusSettingsAction = vi.fn();
vi.mock('@/app/admin/actions', () => ({
  saveDepositBonusSettingsAction: (...args: unknown[]) => saveDepositBonusSettingsAction(...args),
}));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const { default: DepositBonusSettingsCard, depositBonusProblem } = await import('./DepositBonusSettingsCard');

const SETTINGS: DepositBonusSettings = {
  minDepositCents: 1000,
  firstDeposit: { enabled: true, bps: 10000, maxCents: 30000 },
  daily: { enabled: true, bps: 1000, maxCents: 30000 },
  federal: { enabled: false, bps: 0, maxCents: 30000 },
};
const RATES = { firstDeposit: '100', daily: '10', federal: '0' };

beforeEach(() => vi.clearAllMocks());

const rule = (name: string) => screen.getByRole('group', { name });

describe('Bônus de recarga (painel)', () => {
  it('confere o formulário antes de enviar', () => {
    expect(depositBonusProblem(SETTINGS, RATES)).toBeNull();
    expect(depositBonusProblem({ ...SETTINGS, minDepositCents: 50 }, RATES)).toMatch(/pelo menos R\$ 1,00/);
    expect(depositBonusProblem(SETTINGS, { ...RATES, daily: '101' })).toMatch(/^Primeira recarga diária: %/);
    expect(depositBonusProblem(SETTINGS, { ...RATES, daily: '0' })).toMatch(/informe a % do bônus para ativar/);
    expect(depositBonusProblem({ ...SETTINGS, daily: { ...SETTINGS.daily, maxCents: 0 } }, RATES)).toMatch(
      /informe o limite do bônus/,
    );
    // Inativa pode ficar com 0% e sem limite.
    expect(depositBonusProblem({ ...SETTINGS, federal: { enabled: false, bps: 0, maxCents: 0 } }, RATES)).toBeNull();
  });

  it('visual da referência: título, aviso de não cumulativos, regras com status e contagem de ativas', () => {
    renderWithProviders(<DepositBonusSettingsCard settings={SETTINGS} canManage />);
    expect(screen.getByRole('heading', { level: 2, name: 'Bônus de recarga' })).toBeInTheDocument();
    expect(screen.getByText('Bônus não cumulativos')).toBeInTheDocument();
    expect(screen.getByText('2 de 3 ativas')).toBeInTheDocument();
    expect(within(rule('Primeira recarga')).getByRole('switch', { name: 'Primeira recarga' })).toBeChecked();
    expect(within(rule('Recarga em dia de Federal')).getByText('Inativa')).toBeInTheDocument();
    expect(screen.getByLabelText('Recarga mínima elegível')).toHaveValue('10,00');
    // Sem alterações: nada a salvar ou descartar.
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Descartar alterações' })).toBeDisabled();
  });

  it('ativa uma regra com % e limite e salva; o servidor devolve o que ficou gravado', async () => {
    const ui = userEvent.setup();
    saveDepositBonusSettingsAction.mockImplementation(async (input: DepositBonusSettings) => ({ ok: true, data: input }));
    renderWithProviders(<DepositBonusSettingsCard settings={SETTINGS} canManage />);
    const federal = rule('Recarga em dia de Federal');
    const rate = within(federal).getByLabelText('Bônus (%)');
    await ui.clear(rate);
    await ui.type(rate, '12,5');
    const max = within(federal).getByLabelText('Limite do bônus');
    await ui.clear(max);
    await ui.type(max, '15000');
    await ui.click(within(federal).getByRole('switch'));
    expect(screen.getByText('3 de 3 ativas')).toBeInTheDocument();
    await ui.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(saveDepositBonusSettingsAction).toHaveBeenCalledWith({
      ...SETTINGS,
      federal: { enabled: true, bps: 1250, maxCents: 15000 },
    });
    expect(await screen.findByText('Alterações salvas.')).toHaveAttribute('role', 'status');
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();
  });

  it('pausar mantém a % digitada; descartar volta ao que está gravado', async () => {
    const ui = userEvent.setup();
    renderWithProviders(<DepositBonusSettingsCard settings={SETTINGS} canManage />);
    const daily = rule('Primeira recarga diária');
    await ui.click(within(daily).getByRole('switch'));
    expect(within(daily).getByText('Inativa')).toBeInTheDocument();
    expect(within(daily).getByLabelText('Bônus (%)')).toHaveValue('10');

    await ui.click(screen.getByRole('button', { name: 'Descartar alterações' }));
    expect(within(daily).getByRole('switch')).toBeChecked();
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();
  });

  it('ativar sem % mostra o erro e não chama o servidor', async () => {
    const ui = userEvent.setup();
    renderWithProviders(<DepositBonusSettingsCard settings={SETTINGS} canManage />);
    await ui.click(within(rule('Recarga em dia de Federal')).getByRole('switch'));
    await ui.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Recarga em dia de Federal: informe a % do bônus para ativar.');
    expect(saveDepositBonusSettingsAction).not.toHaveBeenCalled();
  });

  it('"Como funciona" abre as regras completas e fecha', async () => {
    const ui = userEvent.setup();
    renderWithProviders(<DepositBonusSettingsCard settings={SETTINGS} canManage={false} />);
    await ui.click(screen.getByRole('button', { name: 'Como funciona' }));
    const dialog = screen.getByRole('dialog', { name: 'Como funciona o bônus' });
    expect(dialog).toHaveAccessibleDescription('Entenda as regras do bônus de recarga.');
    expect(within(dialog).getByText('Um bônus por recarga')).toBeInTheDocument();
    expect(
      within(dialog)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual([
      'Recargas elegíveis',
      'Cálculo do bônus',
      'Dia e horário',
      'Pagamento por outro titular',
      'Uso do bônus e prêmios',
      'Comissões',
    ]);
    expect(within(dialog).getByText('Bônus = menor valor entre (% × recarga) e limite')).toBeInTheDocument();
    await ui.click(within(dialog).getByRole('button', { name: 'Entendi' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    // O X e o Esc também fecham.
    await ui.click(screen.getByRole('button', { name: 'Como funciona' }));
    await ui.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await ui.click(screen.getByRole('button', { name: 'Como funciona' }));
    await ui.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sem permissão de alterar: só consulta', () => {
    renderWithProviders(<DepositBonusSettingsCard settings={SETTINGS} canManage={false} />);
    expect(screen.queryByRole('button', { name: 'Salvar alterações' })).toBeNull();
    expect(screen.getByText('Só o Gerente altera o bônus de recarga.')).toBeInTheDocument();
    for (const input of screen.getAllByLabelText('Bônus (%)')) expect(input).toBeDisabled();
    for (const toggle of screen.getAllByRole('switch')) expect(toggle).toBeDisabled();
  });
});
