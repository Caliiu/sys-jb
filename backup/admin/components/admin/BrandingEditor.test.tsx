import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type AdminBranding, ROLE_PERMISSIONS } from '@sysjb/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, router } from '@/test/render';

vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/personalizacao' }));
vi.mock('@/app/admin/actions', () => ({ saveBrandingAction: vi.fn(), adminLogoutAction: vi.fn() }));

const actions = await import('@/app/admin/actions');
const { default: BrandingEditor } = await import('./BrandingEditor');
const { default: AdminShell } = await import('./AdminShell');
const save = vi.mocked(actions.saveBrandingAction);

const BRANDING: AdminBranding = {
  name: 'Trevo da Sorte',
  primaryColor: '#DF2120',
  secondaryColor: '#F4F1EA',
  inviteBarText: 'Indique um amigo e ganhe bônus',
  inviteBarEnabled: true,
  supportPhone: '11987654321',
  logoUrl: '/marca/logo?v=abc',
  hasCustomLogo: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => 'blob:logo');
  URL.revokeObjectURL = vi.fn();
});

const renderEditor = (canManage = true, initial = BRANDING) =>
  renderWithProviders(<BrandingEditor initial={initial} canManage={canManage} />);
const preview = () => document.querySelector('figure')!;

describe('Identidade visual no painel', () => {
  it('a pré-visualização acompanha o formulário', async () => {
    renderEditor();
    const form = screen.getByRole('form', { name: 'Identidade visual' });
    await userEvent.clear(within(form).getByLabelText('Nome da banca'));
    await userEvent.type(within(form).getByLabelText('Nome da banca'), 'Sorte Grande');
    await userEvent.clear(within(form).getByLabelText('Texto da barra de convite'));
    await userEvent.type(within(form).getByLabelText('Texto da barra de convite'), 'Convide e ganhe');
    await userEvent.clear(within(form).getByLabelText('Cor principal'));
    await userEvent.type(within(form).getByLabelText('Cor principal'), '0a7c3e');

    expect(within(form).getByLabelText('Cor principal')).toHaveValue('#0A7C3E');
    expect(preview()).toHaveTextContent('Sorte Grande');
    expect(preview()).toHaveTextContent('Convide e ganhe');
    expect(preview().style.getPropertyValue('--brand-primary')).toBe('#0A7C3E');
  });

  it('salva com logo nova e atualiza o menu do painel', async () => {
    save.mockResolvedValue({ ok: true, data: { ...BRANDING, name: 'Sorte Grande', logoUrl: '/marca/logo?v=def' } });
    renderEditor();
    const form = screen.getByRole('form', { name: 'Identidade visual' });
    await userEvent.clear(within(form).getByLabelText('Nome da banca'));
    await userEvent.type(within(form).getByLabelText('Nome da banca'), 'Sorte Grande');
    const png = new File([new Uint8Array([0x89, 0x50])], 'logo.png', { type: 'image/png' });
    await userEvent.upload(within(form).getByLabelText('Logo'), png);
    expect(within(form).getByText('logo.png')).toBeInTheDocument();
    expect(preview().querySelector('img')).toHaveAttribute('src', 'blob:logo');

    await userEvent.click(within(form).getByRole('button', { name: 'Salvar' }));
    const sent = save.mock.calls[0]![0] as FormData;
    expect(Object.fromEntries([...sent.entries()].filter(([k]) => k !== 'logo'))).toEqual({
      name: 'Sorte Grande',
      primaryColor: '#DF2120',
      secondaryColor: '#F4F1EA',
      inviteBarText: 'Indique um amigo e ganhe bônus',
      inviteBarEnabled: '1',
      supportPhone: '(11) 98765-4321',
    });
    expect((sent.get('logo') as File).name).toBe('logo.png');
    expect(await within(form).findByRole('status')).toHaveTextContent('Identidade visual salva.');
    expect(router.refresh).toHaveBeenCalled();
  });

  it('remove a logo enviada (volta à padrão)', async () => {
    save.mockResolvedValue({ ok: true, data: { ...BRANDING, logoUrl: null, hasCustomLogo: false } });
    renderEditor();
    const form = screen.getByRole('form', { name: 'Identidade visual' });
    await userEvent.click(within(form).getByRole('button', { name: 'Remover a logo enviada' }));
    expect(within(form).getByText(/volta à padrão ao salvar/)).toBeInTheDocument();
    await userEvent.click(within(form).getByRole('button', { name: 'Salvar' }));
    const sent = save.mock.calls[0]![0] as FormData;
    expect(sent.get('removeLogo')).toBe('1');
    expect(sent.has('logo')).toBe(false);
  });

  it('WhatsApp do suporte: com máscara; apagar envia vazio (remove)', async () => {
    save.mockResolvedValue({ ok: true, data: { ...BRANDING, supportPhone: null } });
    renderEditor();
    const form = screen.getByRole('form', { name: 'Identidade visual' });
    const phone = within(form).getByLabelText('WhatsApp do suporte');
    expect(phone).toHaveValue('(11) 98765-4321');
    await userEvent.clear(phone);
    await userEvent.type(phone, '1134567890');
    expect(phone).toHaveValue('(11) 3456-7890');
    await userEvent.clear(phone);
    await userEvent.click(within(form).getByRole('button', { name: 'Salvar' }));
    expect((save.mock.calls[0]![0] as FormData).get('supportPhone')).toBe('');
    expect(phone).toHaveValue('');
  });

  it('liga e desliga a barra de convite', async () => {
    save.mockResolvedValue({ ok: true, data: { ...BRANDING, inviteBarEnabled: false } });
    renderEditor();
    const form = screen.getByRole('form', { name: 'Identidade visual' });
    const toggle = within(form).getByRole('switch', { name: 'Barra de convite' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(preview()).toHaveTextContent('Indique um amigo e ganhe bônus');

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(within(form).getByText(/Desligada: não aparece/)).toBeInTheDocument();
    expect(preview()).not.toHaveTextContent('Indique um amigo e ganhe bônus');

    await userEvent.click(within(form).getByRole('button', { name: 'Salvar' }));
    expect((save.mock.calls[0]![0] as FormData).get('inviteBarEnabled')).toBe('0');
  });

  it('recusa formato de logo não aceito e mostra erro de campo da API', async () => {
    save.mockResolvedValue({
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'Corrija os campos destacados.',
      fieldErrors: { name: 'No mínimo 2 caracteres.' },
    });
    renderEditor();
    const form = screen.getByRole('form', { name: 'Identidade visual' });
    const svg = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' });
    await userEvent.setup({ applyAccept: false }).upload(within(form).getByLabelText('Logo'), svg);
    expect(within(form).getByRole('alert')).toHaveTextContent('Use uma imagem PNG, JPG ou WebP.');

    await userEvent.click(within(form).getByRole('button', { name: 'Salvar' }));
    expect(within(form).getByText('No mínimo 2 caracteres.')).toBeInTheDocument();
  });

  it('sem permissão de alterar: só consulta', () => {
    renderEditor(false);
    expect(screen.getByLabelText('Nome da banca')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull();
  });

  it('menu: Configurações > Personalização (aberta) e Mural, só para quem pode ver', () => {
    const renderSidebar = (permissions: readonly (typeof ROLE_PERMISSIONS.MANAGER)[number][]) =>
      renderWithProviders(
        <AdminShell tenantName="Banca" operatorName="Operador" roleLabel="Gerente" permissions={permissions} />,
      );
    const manager = renderSidebar(ROLE_PERMISSIONS.MANAGER);
    const group = screen.getAllByRole('group', { name: 'Configurações' })[0]!;
    const link = within(group).getByRole('link', { name: 'Personalização' });
    expect(link).toHaveAttribute('href', '/personalizacao');
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(within(group).getByRole('link', { name: 'Mural' })).toHaveAttribute('href', '/mural');
    manager.unmount();

    // Suporte não vê nada de Configurações (nem os cadastros "em breve", que são do Gerente).
    renderSidebar(ROLE_PERMISSIONS.SUPPORT);
    expect(screen.queryByRole('group', { name: 'Configurações' })).toBeNull();
  });
});
