export interface PrizesConfig {
  /**
   * Carência da apuração (PRIZES_GRACE_MINUTES, padrão 30): o resultado precisa ficar esse tempo sem correção do
   * provedor antes de os prêmios serem pagos. Correção depois disso não muda o que foi pago; vira aviso no painel.
   */
  graceMinutes: number;
  /** Intervalo entre as rodadas de apuração (ms); null = sem rodada automática (os testes chamam a rodada). */
  sweepIntervalMs: number | null;
}

export const DEFAULT_PRIZES_GRACE_MINUTES = 30;
const SWEEP_INTERVAL_MS = 60_000;

export function loadPrizesConfig(env: NodeJS.ProcessEnv): PrizesConfig {
  const raw = env.PRIZES_GRACE_MINUTES?.trim() || String(DEFAULT_PRIZES_GRACE_MINUTES);
  const graceMinutes = Number(raw);
  if (!/^\d+$/.test(raw) || graceMinutes > 1440) {
    throw new Error('PRIZES_GRACE_MINUTES: use um inteiro de 0 a 1440 (minutos)');
  }
  return { graceMinutes, sweepIntervalMs: SWEEP_INTERVAL_MS };
}
