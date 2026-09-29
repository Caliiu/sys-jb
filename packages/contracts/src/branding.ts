/**
 * Identidade visual da banca, editada pelo Gerente em Personalização > Identidade visual: nome, logo, cores e o
 * texto da barra "Indique um amigo" do app do jogador.
 */

export const DEFAULT_INVITE_BAR_TEXT = 'Indique um amigo e ganhe bônus';

export const BRANDING_LIMITS = {
  nameMin: 2,
  nameMax: 40,
  inviteBarMax: 60,
  /** 1 MB. O banco confere o mesmo limite. */
  logoMaxBytes: 1024 * 1024,
} as const;

/** Formatos aceitos para a logo (o servidor confere pelo conteúdo do arquivo). SVG não: pode conter script. */
export const LOGO_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** Cor no formato #RRGGBB (guardada em maiúsculas). */
export const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/** GET/PUT /v1/admin/branding. */
export interface AdminBranding {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  inviteBarText: string;
  /** Barra ligada: aparece no topo de todas as telas do jogador. */
  inviteBarEnabled: boolean;
  /** WhatsApp do suporte (só dígitos); null = não configurado. */
  supportPhone: string | null;
  /** Logo em uso (a enviada pelo painel ou a padrão da banca); null = só a inicial do nome. */
  logoUrl: string | null;
  /** true = há uma logo enviada pelo painel (pode ser removida, voltando à padrão). */
  hasCustomLogo: boolean;
}

/**
 * PUT /v1/admin/branding. `logo`: base64 de uma imagem nova; null remove a logo enviada; ausente mantém a atual.
 */
export interface SaveBrandingRequest {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  inviteBarText: string;
  inviteBarEnabled: boolean;
  /** Com ou sem máscara; null (ou vazio) remove. */
  supportPhone: string | null;
  logo?: string | null;
}

/**
 * GET /v1/me/support: WhatsApp do atendimento do jogador da sessão (o do promotor que o indicou, se ainda for
 * promotor ativo; senão o da banca) e a mensagem inicial pronta. phone null = sem atendimento.
 */
export interface SupportContact {
  phone: string | null;
  message: string;
}

/**
 * Mensagem inicial do atendimento:
 * - para o promotor: "Olá Promotor <nome>, preciso de ajuda, meu código de unidade é: <código>."
 * - para a banca: "Olá, preciso de ajuda, meu código de unidade é: <código>."
 * - sem sessão (login e cadastro, sem código): "Olá, preciso de ajuda."
 */
export function supportMessage({
  promoterName,
  unitCode,
}: {
  promoterName: string | null;
  unitCode: number | null;
}): string {
  const greeting = promoterName ? `Olá Promotor ${promoterName.trim()}` : 'Olá';
  return unitCode === null
    ? `${greeting}, preciso de ajuda.`
    : `${greeting}, preciso de ajuda, meu código de unidade é: ${unitCode}.`;
}

/** Link do WhatsApp (api.whatsapp.com/send) para um telefone nacional (só dígitos), com a mensagem inicial. */
export function whatsappUrl(phone: string, text: string): string {
  return `https://api.whatsapp.com/send?phone=+55${phone}&text=${encodeURIComponent(text)}`;
}
