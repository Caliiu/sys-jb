import 'server-only';
import type { LotteryResultsResponse } from '@sysjb/contracts';
import { apiRequest } from './api-client';
import { readSessionToken } from './session';

/** Resultados das loterias de um dia (data já conferida pela página). null = não foi possível consultar. */
export async function loadResults(hostname: string, date: string): Promise<LotteryResultsResponse | null> {
  const sessionToken = await readSessionToken();
  if (!sessionToken) return null;
  const res = await apiRequest<LotteryResultsResponse>(
    hostname,
    'GET',
    `/v1/results?date=${encodeURIComponent(date)}`,
    undefined,
    { sessionToken },
  );
  return res.ok ? res.data : null;
}
