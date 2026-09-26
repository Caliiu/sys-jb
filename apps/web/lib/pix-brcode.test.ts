import { describe, expect, it } from 'vitest';
import { buildStaticPixPayload, crc16 } from './pix-brcode';

describe('crc16', () => {
  it('bate com o vetor de teste padrão do CRC-16/CCITT-FALSE', () => {
    expect(crc16('123456789')).toBe('29B1');
  });
});

describe('buildStaticPixPayload', () => {
  const payload = buildStaticPixPayload({
    key: '00000000-0000-4000-8000-000000000000',
    merchantName: 'SYSJB TESTE',
    merchantCity: 'SAO PAULO',
    amountCents: 5000,
    txid: 'LOT0123456789',
  });

  it('segue a estrutura do BR Code (Pix, moeda BRL, valor e país)', () => {
    expect(payload.startsWith('000201010212')).toBe(true);
    expect(payload).toContain('0014br.gov.bcb.pix');
    expect(payload).toContain('5303986');
    expect(payload).toContain('540550.00');
    expect(payload).toContain('5802BR');
    expect(payload).toContain('5911SYSJB TESTE');
  });

  it('termina com o CRC do próprio conteúdo', () => {
    const body = payload.slice(0, -4);
    expect(body.endsWith('6304')).toBe(true);
    expect(payload.slice(-4)).toBe(crc16(body));
  });
});
