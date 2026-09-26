import { createHash, randomBytes } from 'node:crypto';

export const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

/** Token opaco de 256 bits; só o SHA-256 dele é persistido. */
export function newSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: sha256(token) };
}
