/**
 * Contratos públicos da API. Sem dependências de servidor: pode ser importado pelo web e pela API.
 *
 * Convenção monetária: todo valor monetário numérico é um inteiro em CENTAVOS
 * (ex.: 1050 = R$ 10,50). Nunca há frações.
 */

/** Inteiro em centavos, dentro de Number.MAX_SAFE_INTEGER. */
export type Cents = number;

export interface PublicWallet {
  balanceJb: Cents;
  bonusJb: Cents;
  prizesJb: Cents;
  balanceGames: Cents;
  bonusGames: Cents;
  prizesGames: Cents;
  /** Sempre 0 nesta fase: não há regra de saque definida. */
  withdrawable: Cents;
  /** Derivado na leitura: balanceJb + bonusJb + prizesJb. Não define elegibilidade para apostas ou saque. */
  totalAvailableJb: Cents;
  /** Derivado na leitura: balanceGames + bonusGames + prizesGames. Não define elegibilidade para apostas ou saque. */
  totalAvailableGames: Cents;
}

/**
 * Campos de promotor: sempre null nesta fase. Mantidos juntos para evolução futura.
 */
export interface PublicPromoterFields {
  promoter: null;
  promoterName: null;
  promoterPhone: null;
}

/** Objeto público de usuário. Campos nullable sempre presentes (nunca omitidos). */
export interface PublicUser extends PublicPromoterFields {
  id: string;
  name: string;
  email: string | null;
  /** Somente dígitos, 10 ou 11 (formato nacional). String para preservar zeros. */
  phone: string;
  /** CPF, somente dígitos (11). Validados formato e dígitos verificadores; não é verificação de identidade. */
  document: string;
  avatar: string | null;
  displayId: number;
  /** Código do link de convite (`/cadastro?convite=CDYGE`): 5 caracteres, único e fixo. */
  inviteCode: string;
  wallet: PublicWallet;
}

/**
 * Dados do perfil do próprio usuário (tela "Perfil"): o contrato público mais a data de nascimento,
 * que só o dono da conta enxerga (fora de PublicUser de propósito).
 */
export interface PublicProfile extends PublicUser {
  /** YYYY-MM-DD. */
  birthDate: string;
}

/** PATCH /v1/me: o usuário só altera o próprio e-mail e telefone (null limpa o e-mail). Pelo menos um campo. */
export interface UpdateProfileRequest {
  email?: string | null;
  phone?: string;
}

/** POST /v1/me/password: define a nova senha. As outras sessões do usuário são encerradas. */
export interface ChangePasswordRequest {
  password: string;
}

export const USER_WRITABLE_FIELDS = ['name', 'email', 'phone', 'document', 'avatar'] as const;
export type UserWritableField = (typeof USER_WRITABLE_FIELDS)[number];

export interface CreateUserRequest {
  name: string;
  phone: string;
  /** CPF (aceita pontuação). */
  document: string;
  /** Data de nascimento no formato YYYY-MM-DD. Exige 18 anos completos. */
  birthDate: string;
  /** 8 a 128 caracteres. Nunca é devolvida pela API. */
  password: string;
  email?: string | null;
  avatar?: string | null;
  /** Código do link de convite (`?convite=`) de quem indicou (jogador ou promotor): o código de 5 caracteres (ex.: CDYGE) ou, em links antigos, o ID exibido. Código inexistente ou de usuário bloqueado é ignorado (o cadastro segue). */
  inviteCode?: string;
}

/** PATCH: campo ausente mantém o valor; null só é aceito em email e avatar. Pelo menos um campo. */
export interface UpdateUserRequest {
  name?: string;
  phone?: string;
  document?: string;
  email?: string | null;
  avatar?: string | null;
}

export interface LoginRequest {
  /** CPF (aceita pontuação). */
  document: string;
  password: string;
}

/**
 * Resposta do login. O token é opaco e deve ficar só no servidor do web (cookie HttpOnly);
 * nunca deve ser exposto a JavaScript do navegador.
 */
export interface LoginResponse {
  token: string;
  /** ISO 8601. */
  expiresAt: string;
  user: PublicUser;
}

export interface PublicTenant {
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  /** Texto da barra "Indique um amigo" do topo do app. */
  inviteBarText: string;
  /** Barra ligada: aparece no topo de todas as telas do jogador. */
  inviteBarEnabled: boolean;
  /** WhatsApp do suporte da banca (só dígitos); null = não configurado. */
  supportPhone: string | null;
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'TENANT_NOT_FOUND'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_BLOCKED'
  | 'SESSION_INVALID'
  | 'TOO_MANY_ATTEMPTS'
  | 'PAYLOAD_TOO_LARGE'
  | 'INSUFFICIENT_FUNDS'
  | 'NUMBERS_UNAVAILABLE'
  | 'DRAW_CLOSED'
  | 'QUOTE_CHANGED'
  | 'DRAW_HAS_BETS'
  | 'INTERNAL_ERROR';

export interface ApiError {
  statusCode: number;
  code: ApiErrorCode;
  message: string;
  /** Detalhes seguros (nomes de campos), nunca valores enviados. */
  details?: Array<{ field: string; message: string }>;
}

export * from './admin.js';
export * from './fazendinha.js';
export * from './quotes.js';
export * from './lotteries.js';
export * from './draws.js';
export * from './prizes.js';
export * from './reports.js';
export * from './murals.js';
export * from './branding.js';
export * from './home-layout.js';
export * from './validation.js';
