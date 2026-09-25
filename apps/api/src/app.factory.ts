import 'reflect-metadata';
import type { LoggerService, LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { jsonBody, requestLogger } from './common/http-middleware.js';
import type { AppConfig } from './config/config.js';

export async function createApp(
  config: AppConfig,
  logger: LoggerService | LogLevel[] | false = ['log', 'warn', 'error'],
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), {
    bodyParser: false,
    logger,
  });
  // Por padrão false: X-Forwarded-Host é ignorado e a banca vem do Host real.
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.use(requestLogger);
  app.use(jsonBody);
  app.enableShutdownHooks();
  return app;
}
