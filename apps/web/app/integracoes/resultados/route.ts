import { clientIp } from '@/lib/client-ip';
import { forwardResultsWebhook } from '@/lib/results-webhook';

/**
 * URL pública do webhook de resultados, cadastrada no painel do provedor (ex.: https://admin.seudominio.com.br/integracoes/resultados).
 * Só POST (os outros métodos respondem 405). Vale em qualquer hostname servido pelo web: quem autoriza é o token.
 */
export async function POST(request: Request) {
  return forwardResultsWebhook(request, await clientIp());
}
