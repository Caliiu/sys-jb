import 'server-only';
import { isIP } from 'node:net';
import { headers } from 'next/headers';

/**
 * Quantos proxies confiáveis (nginx, balanceador, CDN) ficam na frente do web. Cada um acrescenta ao fim do
 * X-Forwarded-For o endereço de quem o chamou, então o IP do visitante é o N-ésimo a partir do fim. Padrão 1
 * (um nginx na frente: o web escuta só em 127.0.0.1 e nunca fica exposto direto). 0 = não informa IP à API.
 */
function trustedProxyHops(): number {
  const hops = Number(process.env.WEB_TRUSTED_PROXY_HOPS ?? '1');
  return Number.isInteger(hops) && hops >= 0 && hops <= 10 ? hops : 1;
}

/** "203.0.113.5:51234" -> "203.0.113.5"; "[2001:db8::1]:443" -> "2001:db8::1". */
function withoutPort(value: string): string {
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(value);
  if (bracketed) return bracketed[1]!;
  const v4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(value);
  return v4WithPort ? v4WithPort[1]! : value;
}

/**
 * IP do visitante para o limite de requisições da API, ou null se não houver um confiável. Entradas à esquerda
 * das que os proxies confiáveis acrescentaram vêm do próprio visitante e são ignoradas (podem ser forjadas).
 */
export async function clientIp(): Promise<string | null> {
  const hops = trustedProxyHops();
  if (hops === 0) return null;
  let forwarded: string | null;
  try {
    forwarded = (await headers()).get('x-forwarded-for');
  } catch {
    return null; // Fora de uma requisição (ex.: build): sem IP.
  }
  const chain = (forwarded ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const candidate = chain.length >= hops ? withoutPort(chain[chain.length - hops]!) : '';
  return isIP(candidate) !== 0 ? candidate : null;
}
