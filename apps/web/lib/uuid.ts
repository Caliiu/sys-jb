/**
 * UUID v4 aleatório (chaves de compra e de crédito: repetir a mesma chave não cobra de novo). `crypto.randomUUID` só
 * existe em página segura (HTTPS ou localhost); fora disso (ex.: o app aberto pelo IP da rede local), o UUID é montado
 * com `crypto.getRandomValues`, que vale em qualquer página e é a mesma fonte criptográfica.
 */
export function randomUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // versão 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variante RFC 4122
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
