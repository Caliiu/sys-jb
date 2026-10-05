/**
 * Jogador no PlayFivers (user_code): "<ID> <primeiro nome> - <banca>", ex. "10000 Carlos - Trevo da Sorte", para
 * ficar legível no painel do provedor. Só o primeiro nome (menos dado pessoal com terceiros). Quem identifica o
 * jogador é o ID do início (display_id, único em todas as bancas); nome e banca são só rótulo, então mudar um deles
 * não desvia dinheiro para outra pessoa.
 */

const MAX_DISPLAY_ID = 2_147_483_647;

/** Só letras, números e espaços simples, sem acento (formato aceito por qualquer sistema), cortado no tamanho. */
function plain(text: string, max: number): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

export function casinoUserCode(displayId: number, name: string, tenantName: string): string {
  const first = plain(name.trim().split(/\s+/)[0] ?? '', 20) || 'Jogador';
  const tenant = plain(tenantName, 40) || 'Banca';
  return `${displayId} ${first} - ${tenant}`;
}

/** ID do jogador no user_code (o número do início); null se não começar por um ID válido. */
export function displayIdFromUserCode(userCode: string): number | null {
  const match = /^([1-9]\d{0,9})(?:\s|$)/.exec(userCode);
  if (!match?.[1]) return null;
  const id = Number(match[1]);
  return id <= MAX_DISPLAY_ID ? id : null;
}
