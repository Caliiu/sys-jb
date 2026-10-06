import { clientIp } from '@/lib/client-ip';
import { forwardPaymentWebhook } from '@/lib/payments-webhook';

/**
 * URL pública do aviso de pagamento, enviada pela API ao gateway em cada cobrança
 * (ex.: https://trevo.com.br/integracoes/pagamentos/misticpay?d=<depósito>&t=<assinatura>). Só POST, só dos IPs de
 * PAYMENTS_WEBHOOK_IPS. Vale em qualquer hostname servido pelo web; a assinatura quem confere é a API.
 */
export async function POST(request: Request, { params }: { params: Promise<{ gateway: string }> }) {
  return forwardPaymentWebhook(request, (await params).gateway, await clientIp());
}
