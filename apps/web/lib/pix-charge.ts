import 'server-only';
import { randomBytes } from 'node:crypto';
import { buildStaticPixPayload } from './pix-brcode';
import { PIX_CHARGE_SECONDS, type PixCharge, type RechargeDestination } from './recharge';

interface CreatePixChargeInput {
  amountCents: number;
  destination: RechargeDestination;
}

/**
 * Ponto de integração com o provedor de Pix. O backend ainda não tem cobrança, então:
 * - em desenvolvimento, devolve uma cobrança de TESTE (chave inexistente: nenhum banco a paga);
 * - em produção, devolve null e a tela avisa que o Pix está indisponível.
 * Ao integrar o provedor, criar a cobrança aqui (server-side) e mapear a resposta para PixCharge.
 */
export async function createPixCharge({ amountCents, destination }: CreatePixChargeInput): Promise<PixCharge | null> {
  if (process.env.NODE_ENV === 'production') return null;

  const txid = `${destination === 'games' ? 'GAM' : 'LOT'}${randomBytes(11).toString('hex')}`;
  return {
    code: buildStaticPixPayload({
      key: '00000000-0000-4000-8000-000000000000',
      merchantName: 'SYSJB TESTE',
      merchantCity: 'SAO PAULO',
      amountCents,
      txid,
    }),
    amountCents,
    durationSeconds: PIX_CHARGE_SECONDS,
    expiresAt: new Date(Date.now() + PIX_CHARGE_SECONDS * 1000).toISOString(),
    isTest: true,
  };
}
