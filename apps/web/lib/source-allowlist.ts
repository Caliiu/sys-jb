import 'server-only';
import { BlockList, isIP } from 'node:net';

/**
 * Lista de IPs de origem dos webhooks de provedores (cassino, pagamentos). A API não é exposta: o web é a única porta,
 * então é aqui que se recusa quem não é o provedor.
 */

/** Lista de origem do webhook: `null` = sem lista (aceita e registra o IP); `'invalid'` = configuração com erro. */
export type SourceAllowlist = BlockList | null | 'invalid';

/** "1.2.3.4, 10.0.0.0/24, 2001:db8::/32" -> BlockList. Entrada inválida invalida a lista inteira (recusa tudo). */
export function parseSourceAllowlist(raw: string): SourceAllowlist {
  const entries = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (entries.length === 0) return null;
  const list = new BlockList();
  for (const entry of entries) {
    const [address = '', prefixRaw, extra] = entry.split('/');
    const family = isIP(address);
    if (family === 0 || extra !== undefined) return 'invalid';
    const type = family === 4 ? 'ipv4' : 'ipv6';
    if (prefixRaw === undefined) {
      list.addAddress(address, type);
      continue;
    }
    const prefix = /^\d{1,3}$/.test(prefixRaw) ? Number(prefixRaw) : NaN;
    if (!(prefix >= 0 && prefix <= (family === 4 ? 32 : 128))) return 'invalid';
    list.addSubnet(address, prefix, type);
  }
  return list;
}

/** O IP de origem está na lista? IPv4 escrito como IPv6 (::ffff:1.2.3.4) conta como o IPv4. */
export function sourceAllowed(list: BlockList, ip: string | null): boolean {
  if (!ip) return false;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip)?.[1];
  const address = mapped ?? ip;
  const family = isIP(address);
  if (family === 0) return false;
  return list.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

/** Lista lida da configuração, reaproveitada enquanto o texto não muda. */
export function cachedAllowlist(readRaw: () => string): () => SourceAllowlist {
  let cached: { raw: string; list: SourceAllowlist } | null = null;
  return () => {
    const raw = readRaw();
    if (cached?.raw !== raw) cached = { raw, list: parseSourceAllowlist(raw) };
    return cached.list;
  };
}

/**
 * Confere a origem de um webhook. Sem lista: aceita e registra o IP (para descobrir os IPs do provedor e preencher a
 * variável). Lista inválida ou IP fora dela: recusa e registra. Só o IP vai para o log (do servidor do provedor; nunca
 * o endereço com o token nem o corpo).
 */
export function checkSource(list: SourceAllowlist, ip: string | null, label: string, variable: string): boolean {
  if (list === 'invalid') {
    console.error(`[${label}] webhook recusado: ${variable} com entrada inválida`);
    return false;
  }
  if (list === null) {
    console.warn(`[${label}] webhook de ${ip ?? 'IP desconhecido'} aceito sem ${variable} configurado`);
    return true;
  }
  if (!sourceAllowed(list, ip)) {
    console.warn(`[${label}] webhook recusado: origem ${ip ?? 'desconhecida'} fora de ${variable}`);
    return false;
  }
  return true;
}
