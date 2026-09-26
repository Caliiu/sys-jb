/** CRC-16/CCITT-FALSE (polinômio 0x1021, início 0xFFFF), exigido no fim do BR Code do Pix. */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Campo EMV: id (2) + tamanho (2) + valor. */
const field = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`;

export interface StaticPixInput {
  key: string;
  /** Até 25 caracteres ASCII. */
  merchantName: string;
  /** Até 15 caracteres ASCII. */
  merchantCity: string;
  amountCents: number;
  /** Até 25 caracteres alfanuméricos. */
  txid: string;
}

/** BR Code estático de uso único ("copia e cola" e QR do Pix). */
export function buildStaticPixPayload(input: StaticPixInput): string {
  const body =
    field('00', '01') +
    field('01', '12') +
    field('26', field('00', 'br.gov.bcb.pix') + field('01', input.key)) +
    field('52', '0000') +
    field('53', '986') +
    field('54', (input.amountCents / 100).toFixed(2)) +
    field('58', 'BR') +
    field('59', input.merchantName) +
    field('60', input.merchantCity) +
    field('62', field('05', input.txid)) +
    '6304';
  return body + crc16(body);
}
