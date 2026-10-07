import 'server-only';
import type { PublicTenant } from '@sysjb/contracts';
import { apiRequest } from './api-client';
import type { ApiResult } from './api-result';

/** Por quanto tempo os dados públicos da banca valem na memória deste servidor do web. */
export const TENANT_CACHE_TTL_MS = 30_000;
/** Teto de entradas (os hostnames já vêm limitados a WEB_SERVICE_KEYS; isto é só uma segunda trava). */
const MAX_ENTRIES = 512;

interface Entry {
  tenant: PublicTenant;
  expiresAt: number;
}

const entries = new Map<string, Entry>();
/** Busca em andamento por hostname: requisições simultâneas num cache vazio fazem uma chamada só à API. */
const inflight = new Map<string, Promise<ApiResult<PublicTenant>>>();
/**
 * Muda a cada limpeza: uma busca que começou antes de uma alteração no painel termina com os dados antigos e não pode
 * gravá-los no cache (senão a identidade velha voltaria por mais TENANT_CACHE_TTL_MS).
 */
let generation = 0;

/**
 * Dados públicos da banca (nome, cores, logo, barra de convite, WhatsApp) para o hostname, guardados por alguns
 * segundos. Quase não mudam e eram pedidos à API em toda página. Só respostas de sucesso entram no cache: banca
 * inexistente, inativa ou falha da API são consultadas de novo na próxima requisição.
 *
 * Nada pessoal ou de dinheiro passa por aqui (é o mesmo conteúdo de GET /v1/tenant, igual para todos os visitantes da
 * banca). Uma alteração feita no painel deste servidor limpa o cache na hora (invalidateTenantCache); em outro
 * servidor do web, vale em até TENANT_CACHE_TTL_MS.
 */
export async function loadTenant(hostname: string, now: () => number = Date.now): Promise<ApiResult<PublicTenant>> {
  const cached = entries.get(hostname);
  if (cached && cached.expiresAt > now()) return { ok: true, status: 200, data: cached.tenant };

  const pending = inflight.get(hostname);
  if (pending) return pending;

  const startedAt = generation;
  const request = apiRequest<PublicTenant>(hostname, 'GET', '/v1/tenant')
    .then((res): ApiResult<PublicTenant> => {
      if (!res.ok) {
        entries.delete(hostname);
        return res;
      }
      // Todos recebem o mesmo objeto, congelado: ninguém altera o que outra requisição vai ler.
      const tenant = Object.freeze({ ...res.data });
      if (startedAt !== generation) return { ok: true, status: res.status, data: tenant };
      if (!entries.has(hostname) && entries.size >= MAX_ENTRIES) {
        // Sai a entrada mais antiga (a Map guarda a ordem de inclusão).
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
      entries.set(hostname, { tenant, expiresAt: now() + TENANT_CACHE_TTL_MS });
      return { ok: true, status: res.status, data: tenant };
    })
    .finally(() => {
      if (inflight.get(hostname) === request) inflight.delete(hostname);
    });
  inflight.set(hostname, request);
  return request;
}

/** Esquece todas as bancas (depois de uma alteração de identidade visual ou atendimento no painel). */
export function invalidateTenantCache(): void {
  generation += 1;
  entries.clear();
  // A próxima requisição busca de novo, sem esperar (nem aproveitar) uma busca iniciada antes da alteração.
  inflight.clear();
}
