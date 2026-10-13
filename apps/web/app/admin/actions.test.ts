import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const apiRequest = vi.fn();
const readOperatorToken = vi.fn();
const headerValues: Record<string, string | null> = { host: 'admin.localhost:3000' };

// Módulos de servidor (cabeçalhos, cookie, chamada HTTP): aqui só interessa o que a action decide e devolve.
vi.mock('next/headers', () => ({ headers: async () => ({ get: (name: string) => headerValues[name] ?? null }) }));
vi.mock('@/lib/api-client', () => ({ apiRequest: (...args: unknown[]) => apiRequest(...args) }));
vi.mock('@/lib/admin/admin-session', () => ({
  readOperatorToken: () => readOperatorToken(),
  writeOperatorToken: vi.fn(),
  clearOperatorToken: vi.fn(),
}));
vi.mock('@/lib/server-env', () => ({
  hostnameOnly: (host: string | null) => (host ? host.replace(/:\d+$/, '') : null),
  isAdminHost: (hostname: string | null) => hostname === 'admin.localhost',
  serviceKeyFor: (hostname: string) => (['admin.localhost', 'aurora.localhost'].includes(hostname) ? 'chave' : null),
}));

const {
  createQuoteTableAction,
  deleteQuoteTableAction,
  renameQuoteTableAction,
  saveGiftMilharSettingsAction,
  saveQuoteValuesAction,
  searchPlayersAction,
  setDefaultQuoteTableAction,
  updateUnitSettingsAction,
} = await import('./actions');

const TOKEN = 'a'.repeat(43);
const PLAYER = { id: '11111111-1111-4111-8111-111111111111', displayId: 1020, name: 'José Ávila' };

beforeEach(() => {
  vi.clearAllMocks();
  headerValues.host = 'admin.localhost:3000';
  readOperatorToken.mockResolvedValue(TOKEN);
});

describe('searchPlayersAction', () => {
  it('busca na lista de usuários com o token do operador e devolve só id, número e nome', async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      status: 200,
      data: { items: [{ ...PLAYER, cpf: '123', balanceCents: 10 }], page: 1, pageSize: 10, total: 1, totalPages: 1 },
    });
    expect(await searchPlayersAction('  josé ')).toEqual({ ok: true, data: [PLAYER] });
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith(
      'admin.localhost',
      'GET',
      '/v1/admin/users?page=1&pageSize=10&search=jos%C3%A9',
      undefined,
      { operatorToken: TOKEN },
    );
  });

  it('rejeita termo curto, longo ou que não é texto, sem chamar a API', async () => {
    for (const input of ['', ' a ', 'x'.repeat(101), 12, null, { search: 'ana' }]) {
      expect(await searchPlayersAction(input), JSON.stringify(input)).toMatchObject({ code: 'VALIDATION_ERROR' });
    }
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('sem cookie de sessão ou fora do host do painel, não chama a API', async () => {
    readOperatorToken.mockResolvedValue(undefined);
    expect(await searchPlayersAction('ana')).toMatchObject({ code: 'SESSION_INVALID' });
    readOperatorToken.mockResolvedValue(TOKEN);
    headerValues.host = 'aurora.localhost:3000';
    expect(await searchPlayersAction('ana')).toMatchObject({ code: 'TENANT_NOT_FOUND' });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('falha da API vira mensagem para o operador', async () => {
    apiRequest.mockResolvedValue({
      ok: false,
      status: 403,
      error: { statusCode: 403, code: 'FORBIDDEN', message: 'x' },
    });
    expect(await searchPlayersAction('ana')).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});

describe('updateUnitSettingsAction', () => {
  const ID = '11111111-1111-4111-8111-111111111111';

  it('envia só os campos recebidos ao PATCH da unidade com o token do operador', async () => {
    apiRequest.mockResolvedValue({ ok: true, status: 200, data: { id: ID } });
    const body = { unitCommissionBps: 1000, quoteTableId: null, dailyLimitEnabled: true, dailyLimitCents: 25000 };
    expect(await updateUnitSettingsAction(ID, body)).toEqual({ ok: true, data: { id: ID } });
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith(
      'admin.localhost',
      'PATCH',
      `/v1/admin/users/${ID}/settings`,
      body,
      { operatorToken: TOKEN },
    );
  });

  it('rejeita id inválido, corpo vazio, campo desconhecido ou fora do limite, sem chamar a API', async () => {
    const cases: [unknown, unknown][] = [
      ['abc', { retainPrizes: true }],
      [ID, {}],
      [ID, { foo: 1 }],
      [ID, { region: 'XX' }],
      [ID, { unitCommissionBps: 10001 }],
      [ID, { unitCommissionBps: 1.5 }],
      [ID, { dailyLimitCents: 0 }],
      [ID, { quoteTableId: 'padrão' }],
    ];
    for (const [id, input] of cases) {
      expect(await updateUnitSettingsAction(id, input), JSON.stringify(input)).toMatchObject({
        code: 'VALIDATION_ERROR',
      });
    }
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('devolve os erros de campo da API', async () => {
    apiRequest.mockResolvedValue({
      ok: false,
      status: 400,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'x',
        details: [{ field: 'dailyLimitCents', message: 'Informe o limite diário para ligá-lo.' }],
      },
    });
    expect(await updateUnitSettingsAction(ID, { dailyLimitEnabled: true })).toEqual({
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'Corrija os campos destacados.',
      fieldErrors: { dailyLimitCents: 'Informe o limite diário para ligá-lo.' },
    });
  });
});

describe('saveGiftMilharSettingsAction', () => {
  const GIFT = { enabled: true, minPuleCents: 1000, stakeCents: 10, placement: 'p1' };

  it('grava a configuração inteira da banca', async () => {
    apiRequest.mockResolvedValue({ ok: true, status: 200, data: GIFT });
    expect(await saveGiftMilharSettingsAction(GIFT)).toEqual({ ok: true, data: GIFT });
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith(
      'admin.localhost',
      'PUT',
      '/v1/admin/quote-tables/gift-milhar',
      GIFT,
      { operatorToken: TOKEN },
    );
  });

  it('rejeita valores fora dos limites ou colocação desconhecida, sem chamar a API', async () => {
    for (const patch of [
      { minPuleCents: 0 },
      { minPuleCents: 10_000_001 },
      { stakeCents: 10_001 },
      { placement: 'p99' },
      { enabled: 'sim' },
    ]) {
      expect(await saveGiftMilharSettingsAction({ ...GIFT, ...patch }), JSON.stringify(patch)).toMatchObject({
        code: 'VALIDATION_ERROR',
      });
    }
    expect(await saveGiftMilharSettingsAction({ enabled: true })).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe('ações das tabelas de cotação', () => {
  const ID = '55555555-5555-4555-8555-555555555555';
  const TABLE = { id: ID, name: 'VIP' };
  const okRes = { ok: true, status: 200, data: TABLE };
  const called = (method: string, path: string, body?: unknown) =>
    expect(apiRequest).toHaveBeenCalledWith('admin.localhost', method, path, body, { operatorToken: TOKEN });

  it('cria (nome sem espaços, cópia opcional), renomeia, escolhe a padrão e exclui com o token do operador', async () => {
    apiRequest.mockResolvedValue(okRes);
    expect(await createQuoteTableAction({ name: '  VIP  ', copyFromId: ID })).toEqual({ ok: true, data: TABLE });
    called('POST', '/v1/admin/quote-tables', { name: 'VIP', copyFromId: ID });
    expect(await createQuoteTableAction({ name: 'Nova' })).toEqual({ ok: true, data: TABLE });
    called('POST', '/v1/admin/quote-tables', { name: 'Nova' });
    expect(await renameQuoteTableAction(ID, { name: ' VIP 2 ' })).toEqual({ ok: true, data: TABLE });
    called('PATCH', `/v1/admin/quote-tables/${ID}`, { name: 'VIP 2' });
    expect(await setDefaultQuoteTableAction(ID)).toEqual({ ok: true, data: TABLE });
    called('POST', `/v1/admin/quote-tables/${ID}/default`);

    apiRequest.mockResolvedValue({ ok: true, status: 204, data: null });
    expect(await deleteQuoteTableAction(ID)).toEqual({ ok: true, data: null });
    called('DELETE', `/v1/admin/quote-tables/${ID}`);
  });

  it('rejeita id inválido, nome vazio ou longo e campo desconhecido, sem chamar a API', async () => {
    const inputs = [{ name: '   ' }, { name: 'x'.repeat(41) }, { name: 'A', foo: 1 }, { name: 'A', copyFromId: 'x' }];
    for (const input of inputs) {
      expect(await createQuoteTableAction(input), JSON.stringify(input)).toMatchObject({ code: 'VALIDATION_ERROR' });
    }
    expect(await renameQuoteTableAction('abc', { name: 'A' })).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await renameQuoteTableAction(ID, {})).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await setDefaultQuoteTableAction(null)).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await deleteQuoteTableAction('../x')).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('tabela em uso, nome repetido e tabela inexistente viram mensagem para o operador', async () => {
    const inUse = 'Há unidades usando esta tabela. Troque a tabela delas antes de excluir.';
    apiRequest.mockResolvedValue({
      ok: false,
      status: 409,
      error: { code: 'QUOTE_TABLE_IN_USE', message: inUse, details: [{ field: 'usersCount', message: '3' }] },
    });
    expect(await deleteQuoteTableAction(ID)).toEqual({
      ok: false,
      code: 'QUOTE_TABLE_IN_USE',
      message: inUse,
      fieldErrors: { usersCount: '3' },
    });
    apiRequest.mockResolvedValue({
      ok: false,
      status: 409,
      error: {
        code: 'CONFLICT',
        message: 'Já existe uma tabela com esse nome.',
        details: [{ field: 'name', message: 'Nome já usado.' }],
      },
    });
    expect(await renameQuoteTableAction(ID, { name: 'Padrão' })).toMatchObject({
      fieldErrors: { name: 'Nome já usado.' },
    });
    apiRequest.mockResolvedValue({ ok: false, status: 404, error: { code: 'NOT_FOUND', message: 'x' } });
    expect(await setDefaultQuoteTableAction(ID)).toMatchObject({ message: 'Tabela de cotação não encontrada.' });
  });

  describe('saveQuoteValuesAction', () => {
    const traditional = [{ modality: 'centena', prizeCents: 90_000 }];
    const fazendinha = [
      { mode: 'grupo', stakeCents: 100, prizeCents: 0 },
      { mode: 'dezena', stakeCents: 300, prizeCents: 30_000 },
    ];

    it('chama só o endpoint de cada jogo com itens e devolve a tabela da última chamada', async () => {
      apiRequest.mockResolvedValueOnce({ ok: true, status: 200, data: { id: ID, step: 1 } });
      apiRequest.mockResolvedValueOnce({ ok: true, status: 200, data: { id: ID, step: 2 } });
      expect(await saveQuoteValuesAction(ID, { traditional, fazendinha })).toEqual({
        ok: true,
        data: { id: ID, step: 2 },
      });
      expect(apiRequest).toHaveBeenCalledTimes(2);
      called('PUT', `/v1/admin/quote-tables/${ID}/tradicional`, { quotes: traditional });
      called('PUT', `/v1/admin/quote-tables/${ID}/fazendinha`, { quotes: fazendinha });

      apiRequest.mockClear();
      apiRequest.mockResolvedValue({ ok: true, status: 200, data: { id: ID } });
      await saveQuoteValuesAction(ID, { traditional, fazendinha: [] });
      expect(apiRequest).toHaveBeenCalledExactlyOnceWith(
        'admin.localhost',
        'PUT',
        `/v1/admin/quote-tables/${ID}/tradicional`,
        { quotes: traditional },
        { operatorToken: TOKEN },
      );
    });

    it('rejeita nada alterado, modalidade, valor de aposta ou prêmio inválidos, sem chamar a API', async () => {
      const cases: unknown[] = [
        { traditional: [], fazendinha: [] },
        { traditional: [{ modality: 'quina', prizeCents: 1 }], fazendinha: [] },
        { traditional: [{ modality: 'centena', prizeCents: -1 }], fazendinha: [] },
        { traditional: [{ modality: 'centena', prizeCents: 100_000_001 }], fazendinha: [] },
        { traditional: [{ modality: 'centena', prizeCents: 1.5 }], fazendinha: [] },
        { traditional: [], fazendinha: [{ mode: 'grupo', stakeCents: 200, prizeCents: 1 }] },
        { traditional: [], fazendinha: [{ mode: 'milhar', stakeCents: 100, prizeCents: 1 }] },
        { traditional },
        { traditional, fazendinha: [], extra: 1 },
      ];
      for (const input of cases) {
        expect(await saveQuoteValuesAction(ID, input), JSON.stringify(input)).toMatchObject({
          code: 'VALIDATION_ERROR',
        });
      }
      expect(await saveQuoteValuesAction('abc', { traditional, fazendinha: [] })).toMatchObject({
        code: 'VALIDATION_ERROR',
      });
      expect(apiRequest).not.toHaveBeenCalled();
    });

    it('erros de campo voltam pela chave da linha; falha na Fazendinha avisa que o Tradicional foi salvo', async () => {
      apiRequest.mockResolvedValueOnce({ ok: true, status: 200, data: { id: ID } });
      apiRequest.mockResolvedValueOnce({
        ok: false,
        status: 400,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Payload inválido.',
          details: [{ field: 'quotes.1.prizeCents', message: 'O prêmio máximo é R$ 1.000.000,00.' }],
        },
      });
      expect(await saveQuoteValuesAction(ID, { traditional, fazendinha })).toEqual({
        ok: false,
        code: 'VALIDATION_ERROR',
        message: 'Os prêmios do Tradicional foram salvos; os da Fazendinha, não. Corrija os campos destacados.',
        fieldErrors: { 'fazendinha:dezena:300': 'O prêmio máximo é R$ 1.000.000,00.' },
      });

      apiRequest.mockReset();
      apiRequest.mockResolvedValue({
        ok: false,
        status: 400,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'x',
          details: [{ field: 'quotes.0.prizeCents', message: 'Máximo.' }],
        },
      });
      expect(await saveQuoteValuesAction(ID, { traditional, fazendinha })).toEqual({
        ok: false,
        code: 'VALIDATION_ERROR',
        message: 'Corrija os campos destacados.',
        fieldErrors: { 'tradicional:centena': 'Máximo.' },
      });
      expect(apiRequest).toHaveBeenCalledTimes(1);
    });
  });
});
