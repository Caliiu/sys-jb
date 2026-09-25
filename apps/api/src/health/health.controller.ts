import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DatabaseService } from '../database/database.service.js';

/** Saúde básica. Não exige banca nem credencial e não expõe versões, URLs ou segredos. */
@Controller('health')
export class HealthController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  @Get()
  async check(@Res() res: Response): Promise<void> {
    try {
      await this.db.client.$queryRaw`SELECT 1`;
      res.status(200).json({ status: 'ok', database: 'up' });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'down' });
    }
  }
}
