import 'server-only';
import type { BalanceReport, LotteryMovementReport, PuleDetail, PuleList } from '@sysjb/contracts';
import { apiRequest } from './api-client';
import { readSessionToken } from './session';

/** GET da API com a sessão do jogador. null = não foi possível consultar (a tela avisa). */
async function get<T>(hostname: string, path: string): Promise<{ status: number; data: T | null } | null> {
  const sessionToken = await readSessionToken();
  if (!sessionToken) return null;
  const res = await apiRequest<T>(hostname, 'GET', path, undefined, { sessionToken });
  return { status: res.status, data: res.ok ? res.data : null };
}

const byDate = (path: string, date: string) => `${path}?date=${encodeURIComponent(date)}`;

/** Relatórios do jogador logado, lidos no servidor. As datas já vêm conferidas pela página. */
export async function loadBalance(hostname: string, date: string): Promise<BalanceReport | null> {
  return (await get<BalanceReport>(hostname, byDate('/v1/me/reports/balance', date)))?.data ?? null;
}

export async function loadLotteryMovement(hostname: string, date: string): Promise<LotteryMovementReport | null> {
  return (await get<LotteryMovementReport>(hostname, byDate('/v1/me/reports/lottery-movement', date)))?.data ?? null;
}

export async function loadPules(hostname: string, date: string): Promise<PuleList | null> {
  return (await get<PuleList>(hostname, byDate('/v1/me/pules', date)))?.data ?? null;
}

/** Recibo da pule (código já normalizado): 'not_found' se não for do jogador ou não existir. */
export async function loadPule(hostname: string, puleCode: string): Promise<PuleDetail | 'not_found' | null> {
  const res = await get<PuleDetail>(hostname, `/v1/me/pules/${encodeURIComponent(puleCode)}`);
  if (res?.status === 404) return 'not_found';
  return res?.data ?? null;
}
