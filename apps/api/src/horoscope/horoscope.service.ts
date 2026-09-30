import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { type HoroscopeTodayResponse, drawDateOf, isHoroscopeSign } from '@sysjb/contracts';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DatabaseService } from '../database/database.service.js';
import { HoroscopeScheduler, cachedSigns, syncHoroscope } from './horoscope-sync.js';

/**
 * Horóscopo do dia: busca diária na API do provedor (agendada aqui, com HOROSCOPE_API_TOKEN) e leitura do cache para o
 * jogador. O jogador nunca chama o provedor. Com mais de uma instância da API, cada uma agenda a sua busca: a gravação é
 * idempotente, então o custo é só uma requisição a mais por dia por instância.
 */
@Injectable()
export class HoroscopeService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Horoscope');
  private scheduler: HoroscopeScheduler | null = null;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  onApplicationBootstrap(): void {
    const horoscope = this.config.horoscope;
    if (!horoscope) {
      this.logger.log('integração desligada (sem HOROSCOPE_API_TOKEN): a tela usa o texto local');
      return;
    }
    this.scheduler = new HoroscopeScheduler(
      () => syncHoroscope(this.db.client, horoscope),
      async () => (await cachedSigns(this.db.client, drawDateOf(new Date().toISOString(), 0))) > 0,
      horoscope,
      (level, message) => this.logger[level](message),
    );
    // Não segura a subida da API: a primeira busca roda em segundo plano.
    void this.scheduler.start();
  }

  onApplicationShutdown(): void {
    this.scheduler?.stop();
  }

  /** Previsões de hoje (Brasília) no cache; vazio se o provedor ainda não publicou. */
  async today(): Promise<HoroscopeTodayResponse> {
    const date = drawDateOf(new Date().toISOString(), 0);
    const rows = await this.db.client.horoscopeReading.findMany({
      where: { referenceDate: new Date(`${date}T00:00:00Z`) },
      orderBy: { sign: 'asc' },
    });
    return {
      date,
      readings: rows.flatMap((row) =>
        isHoroscopeSign(row.sign) ? [{ sign: row.sign, text: row.text, tens: row.tens, colors: row.colors }] : [],
      ),
    };
  }
}
