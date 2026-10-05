import { clientIp } from '@/lib/client-ip';
import { forwardCasinoWebhook } from '@/lib/casino-webhook';

/**
 * URL pública do webhook do cassino, cadastrada no painel do PlayFivers com o token no fim
 * (ex.: https://admin.seudominio.com.br/integracoes/cassino?token=...). Só POST, só dos IPs de CASINO_WEBHOOK_IPS;
 * o token e o segredo do agente quem confere é a API.
 */
export async function POST(request: Request) {
  return forwardCasinoWebhook(request, await clientIp());
}
