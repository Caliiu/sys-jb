import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { defaultQuotes } from '@sysjb/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, router } from '@/test/render';

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/app/admin/actions', () => ({
  saveTraditionalQuotesAction: vi.fn(),
  saveFazendinhaQuotesAction: vi.fn(),
}));

const actions = await import('@/app/admin/actions');
const { default: QuotesEditor } = await import('./QuotesEditor');
const saveTraditional = vi.mocked(actions.saveTraditionalQuotesAction);
const saveFazendinha = vi.mocked(actions.saveFazendinhaQuotesAction);

beforeEach(() => vi.clearAllMocks());

const traditionalForm = () => screen.getByRole('form', { name: 'Tradicional' });
const fazendinhaForm = () => screen.getByRole('form', { name: 'Fazendinha' });

describe('Cotações no painel', () => {
  it('mostra as duas tabelas com os valores atuais', () => {
    renderWithProviders(<QuotesEditor quotes={defaultQuotes()} canManage />);
    expect(traditionalForm()).toHaveTextContent('Tabela atual: 800/1/8000');
    expect(screen.getByLabelText('Prêmio MILHAR')).toHaveValue('8.000,00');
    expect(screen.getByLabelText('Prêmio GP-1')).toHaveValue('22,00');
    expect(screen.getByLabelText('Prêmio CT-100')).toHaveValue('0,00');
    // Nada mudou: salvar fica desligado.
    expect(within(traditionalForm()).getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  it('Gerente edita e salva só o item alterado (não desfaz o que outro gerente salvou)', async () => {
    saveTraditional.mockResolvedValue({ ok: true, data: defaultQuotes() });
    renderWithProviders(<QuotesEditor quotes={defaultQuotes()} canManage />);
    const grupo = screen.getByLabelText('Prêmio GRUPO');
    await userEvent.clear(grupo);
    await userEvent.type(grupo, '1850');
    expect(grupo).toHaveValue('18,50');

    await userEvent.click(within(traditionalForm()).getByRole('button', { name: 'Salvar' }));
    const payload = saveTraditional.mock.calls[0]![0] as { quotes: Array<{ modality: string; prizeCents: number }> };
    expect(payload.quotes).toEqual([{ modality: 'grupo', prizeCents: 1850 }]);
    expect(screen.getByText('Cotações salvas.')).toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalled();
    expect(saveFazendinha).not.toHaveBeenCalled();
  });

  it('erro da API aparece na tabela; sessão encerrada vai ao login', async () => {
    saveFazendinha.mockResolvedValueOnce({
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'Corrija os campos destacados.',
    });
    renderWithProviders(<QuotesEditor quotes={defaultQuotes()} canManage />);
    await userEvent.type(screen.getByLabelText('Prêmio CT-100'), '1');
    await userEvent.click(within(fazendinhaForm()).getByRole('button', { name: 'Salvar' }));
    expect(within(fazendinhaForm()).getByRole('alert')).toHaveTextContent('Corrija os campos destacados.');

    saveFazendinha.mockResolvedValueOnce({ ok: false, code: 'SESSION_INVALID', message: 'Sessão encerrada.' });
    await userEvent.click(within(fazendinhaForm()).getByRole('button', { name: 'Salvar' }));
    expect(router.replace).toHaveBeenCalledWith('/login');
  });

  it('Financeiro vê as tabelas sem poder editar', () => {
    renderWithProviders(<QuotesEditor quotes={defaultQuotes()} canManage={false} />);
    expect(screen.getByLabelText('Prêmio MILHAR')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull();
  });
});
