import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AdminMural } from '@sysjb/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, router, tenant } from '@/test/render';

vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/mural' }));
vi.mock('@/app/admin/actions', () => ({ saveMuralAction: vi.fn(), deleteMuralAction: vi.fn() }));

const actions = await import('@/app/admin/actions');
const { default: MuralsManager } = await import('./MuralsManager');
const save = vi.mocked(actions.saveMuralAction);
const remove = vi.mocked(actions.deleteMuralAction);

const TODAY = '2026-09-29';
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const mural = (n: number, patch: Partial<AdminMural>): AdminMural => ({
  id: ID(n),
  name: `Mural ${n}`,
  startsOn: TODAY,
  endsOn: TODAY,
  displayMode: 'ONCE',
  imageType: 'image/png',
  imageBytes: 1000,
  viewsCount: 0,
  version: `v${n}`,
  createdAt: '2026-09-29T12:00:00.000Z',
  updatedAt: '2026-09-29T12:00:00.000Z',
  ...patch,
});
const MURALS = [
  mural(1, { name: 'Coelho da Fortuna', startsOn: '2026-09-28', endsOn: '2026-09-30', viewsCount: 1234 }),
  mural(2, { name: 'Natal', startsOn: '2026-12-01', endsOn: '2026-12-25', displayMode: 'ALWAYS' }),
  mural(3, { name: 'Dia dos Pais', startsOn: '2026-08-01', endsOn: '2026-08-09' }),
];

const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'coelho.png', { type: 'image/png' });

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

const renderManager = (canManage = true, murals = MURALS) =>
  renderWithProviders(<MuralsManager initial={murals} canManage={canManage} today={TODAY} tenant={tenant} />);

describe('Mural no painel', () => {
  it('lista com vigência, exibição, quem já viu e situação', () => {
    renderManager();
    expect(screen.getByRole('heading', { name: 'Murais (3)' })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Coelho da Fortuna/ })).toHaveTextContent(
      /28\/09\/2026 a 30\/09\/2026\s*Apenas uma vez\s*1\.234 jogador\(es\)\s*No ar/,
    );
    expect(screen.getByRole('row', { name: /Natal/ })).toHaveTextContent(/Sempre\s*—\s*Agendado/);
    expect(screen.getByRole('row', { name: /Dia dos Pais/ })).toHaveTextContent(/Encerrado/);
  });

  it('cadastra um mural com imagem, com pré-visualização', async () => {
    save.mockResolvedValue({ ok: true, data: [...MURALS, mural(4, { name: 'Raspadinha' })] });
    renderManager();
    await userEvent.click(screen.getByRole('button', { name: 'Novo mural' }));
    const form = screen.getByRole('form', { name: 'Novo mural' });

    await userEvent.type(within(form).getByLabelText('Nome do mural'), 'Raspadinha');
    await userEvent.clear(within(form).getByLabelText('Data final'));
    await userEvent.type(within(form).getByLabelText('Data final'), '2026-10-05');
    await userEvent.click(within(form).getByRole('radio', { name: /Sempre/ }));
    await userEvent.upload(within(form).getByLabelText('Imagem'), png());

    expect(within(form).getByText('coelho.png')).toBeInTheDocument();
    expect(within(form).getByText('Pré-visualização: Raspadinha')).toBeInTheDocument();
    expect(form.querySelector('figure img')).toHaveAttribute('src', 'blob:preview');

    await userEvent.click(within(form).getByRole('button', { name: 'Salvar' }));
    const sent = save.mock.calls[0]![0] as FormData;
    expect(Object.fromEntries([...sent.entries()].filter(([k]) => k !== 'image'))).toEqual({
      name: 'Raspadinha',
      startsOn: TODAY,
      endsOn: '2026-10-05',
      displayMode: 'ALWAYS',
    });
    expect((sent.get('image') as File).name).toBe('coelho.png');
    expect(await screen.findByText('Mural cadastrado.')).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Raspadinha/ })).toBeInTheDocument();
  });

  it('exige imagem no cadastro e recusa formato não aceito antes de enviar', async () => {
    renderManager();
    await userEvent.click(screen.getByRole('button', { name: 'Novo mural' }));
    const form = screen.getByRole('form', { name: 'Novo mural' });
    await userEvent.type(within(form).getByLabelText('Nome do mural'), 'Sem imagem');
    await userEvent.click(within(form).getByRole('button', { name: 'Salvar' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('Envie a imagem do mural.');

    const gif = new File(['GIF89a'], 'anim.gif', { type: 'image/gif' });
    await userEvent.setup({ applyAccept: false }).upload(within(form).getByLabelText('Imagem'), gif);
    expect(within(form).getByRole('alert')).toHaveTextContent('Use uma imagem PNG, JPG ou WebP.');
    expect(save).not.toHaveBeenCalled();
  });

  it('edita sem trocar a imagem e mostra o erro de campo da API', async () => {
    save.mockResolvedValue({
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'Corrija os campos destacados.',
      fieldErrors: { endsOn: 'A data final já passou.' },
    });
    renderManager();
    await userEvent.click(screen.getByRole('button', { name: 'Editar Coelho da Fortuna' }));
    const form = screen.getByRole('form', { name: 'Editar Coelho da Fortuna' });
    expect(form.querySelector('figure img')).toHaveAttribute('src', `/mural/${ID(1)}/imagem?v=v1`);

    await userEvent.click(within(form).getByRole('button', { name: 'Salvar' }));
    const sent = save.mock.calls[0]![0] as FormData;
    expect(sent.get('id')).toBe(ID(1));
    expect(sent.has('image')).toBe(false);
    expect(within(form).getByText('A data final já passou.')).toBeInTheDocument();
  });

  it('exclui com confirmação', async () => {
    remove.mockResolvedValue({ ok: true, data: MURALS.slice(1) });
    renderManager();
    await userEvent.click(screen.getByRole('button', { name: 'Excluir Coelho da Fortuna' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir' }));
    expect(remove).toHaveBeenCalledWith(ID(1));
    expect(screen.queryByRole('row', { name: /Coelho da Fortuna/ })).toBeNull();
  });

  it('sem permissão de alterar: só consulta e visualiza', async () => {
    renderManager(false);
    expect(screen.queryByRole('button', { name: 'Novo mural' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Editar/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Visualizar Natal' }));
    const dialog = screen.getByRole('dialog', { name: 'Natal' });
    expect(dialog.querySelector('img')).toHaveAttribute('src', `/mural/${ID(2)}/imagem?v=v2`);
  });
});
