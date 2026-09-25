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
  /** Somente dígitos, 11. Validação apenas de formato, não de identidade ou validade fiscal. */
  document: string;
  avatar: string | null;
  displayId: number;
  wallet: PublicWallet;
}

export const USER_WRITABLE_FIELDS = ['name', 'email', 'phone', 'document', 'avatar'] as const;
export type UserWritableField = (typeof USER_WRITABLE_FIELDS)[number];

export interface CreateUserRequest {
  name: string;
  phone: string;
  document: string;
  email?: string | null;
  avatar?: string | null;
}

/** PATCH: campo ausente mantém o valor; null só é aceito em email e avatar. Pelo menos um campo. */
export interface UpdateUserRequest {
  name?: string;
  phone?: string;
  document?: string;
  email?: string | null;
  avatar?: string | null;
}

export interface PublicTenant {
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'TENANT_NOT_FOUND'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'INTERNAL_ERROR';

export interface ApiError {
  statusCode: number;
  code: ApiErrorCode;
  message: string;
  /** Detalhes seguros (nomes de campos), nunca valores enviados. */
  details?: Array<{ field: string; message: string }>;
}
