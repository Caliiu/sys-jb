/**
 * Notificações (Web Push) do app instalado. O navegador inscreve o aparelho no serviço de push dele (Google, Apple,
 * Mozilla, Microsoft) com a chave pública VAPID da plataforma e manda a inscrição para a API, que guarda por jogador e
 * banca e assina os envios com a chave privada.
 */

/** Limites da inscrição (a API recusa o que passar; o banco confere de novo). */
export const PUSH_LIMITS = { endpointMax: 2048, maxPerUser: 10 } as const;

/** POST /v1/me/push-subscriptions: inscrição do aparelho (o `toJSON()` da PushSubscription do navegador). */
export interface PushSubscriptionRequest {
  /** Endereço do serviço de push (HTTPS, de um serviço conhecido). */
  endpoint: string;
  keys: {
    /** Chave pública P-256 do aparelho (base64url, 65 bytes). */
    p256dh: string;
    /** Segredo de autenticação (base64url, 16 bytes). */
    auth: string;
  };
}

/** DELETE /v1/me/push-subscriptions: tira o aparelho (sair da conta ou desativar). */
export interface PushUnsubscribeRequest {
  endpoint: string;
}

/** Conteúdo cifrado de uma notificação, lido pelo service worker (public/sw.js). */
export interface PushPayload {
  title: string;
  body: string;
  /** Caminho do app aberto ao tocar (sempre relativo: /...). */
  url: string;
  /** Notificações com a mesma tag se substituem (não empilham). */
  tag: string;
}
