const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

/**
 * Normaliza o hostname para comparação exata com tenants.domain:
 * minúsculas, sem ponto final e SEM PORTA. A porta é sempre ignorada, então
 * aurora.localhost:3000 (web) e aurora.localhost:4000 (API) resolvem a mesma banca.
 * Retorna null para qualquer valor fora do formato de hostname (inclui IPs v6).
 */
export function normalizeHost(raw: string | undefined): string | null {
  if (!raw) return null;
  let host = raw.trim().toLowerCase();
  if (host.startsWith('[')) return null;
  const colon = host.indexOf(':');
  if (colon !== -1) {
    const port = host.slice(colon + 1);
    if (!/^\d{1,5}$/.test(port)) return null;
    host = host.slice(0, colon);
  }
  if (host.endsWith('.')) host = host.slice(0, -1);
  if (host.length === 0 || host.length > 253 || !HOSTNAME_RE.test(host)) return null;
  return host;
}
