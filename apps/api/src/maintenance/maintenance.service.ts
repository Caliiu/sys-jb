import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DatabaseService } from '../database/database.service.js';

export interface PurgeResult {
  sessions: number;
  operatorSessions: number;
  loginFailures: number;
  operatorLoginFailures: number;
  resultConsultations: number;
}

/**
 * Limpeza diária (maintenance_purge no banco): sessões encerradas, tentativas de login antigas e consultas antigas ao
 * provedor de resultados. O que e até quando apagar é do banco; aqui só agenda (ao subir e a cada intervalo) e registra
 * quantas linhas saíram. Falha não derruba a API: tenta de novo no próximo intervalo.
 */
@Injectable()
export class MaintenanceService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Maintenance');
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<PurgeResult | null> | null = null;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  onApplicationBootstrap(): void {
    const every = this.config.maintenancePurgeMs;
    if (every === null) return;
    const tick = () => void this.purge();
    this.timer = setInterval(tick, every);
    this.timer.unref?.();
    tick();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Uma limpeza por vez nesta instância; null se falhou (já registrado no log). */
  purge(): Promise<PurgeResult | null> {
    this.running ??= this.run().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async run(): Promise<PurgeResult | null> {
    try {
      const [row] = await this.db.client.$queryRaw<
        Array<{
          sessions: bigint;
          operator_sessions: bigint;
          login_failures: bigint;
          operator_login_failures: bigint;
          result_consultations: bigint;
        }>
      >`SELECT * FROM maintenance_purge()`;
      const result: PurgeResult = {
        sessions: Number(row?.sessions ?? 0n),
        operatorSessions: Number(row?.operator_sessions ?? 0n),
        loginFailures: Number(row?.login_failures ?? 0n),
        operatorLoginFailures: Number(row?.operator_login_failures ?? 0n),
        resultConsultations: Number(row?.result_consultations ?? 0n),
      };
      this.logger.log(
        `limpeza: ${result.sessions} sessão(ões) de jogador, ${result.operatorSessions} de operador, ` +
          `${result.loginFailures + result.operatorLoginFailures} tentativa(s) de login, ` +
          `${result.resultConsultations} consulta(s) ao provedor`,
      );
      return result;
    } catch {
      this.logger.error('limpeza: falha inesperada (tenta de novo no próximo intervalo)');
      return null;
    }
  }
}
