import { Logger } from '@nestjs/common';
import type { ApiError } from '@sysjb/contracts';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { TenantRequest } from '../tenancy/tenant.types.js';

const logger = new Logger('HTTP');

/** Loga método, caminho, status, duração e banca. Nunca corpo, query, headers ou credenciais. */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const tenant = (req as TenantRequest).tenant?.slug ?? '-';
    logger.log(`${req.method} ${req.path} ${res.statusCode} ${ms.toFixed(1)}ms tenant=${tenant}`);
  });
  next();
}

const parser = express.json({ limit: '16kb', strict: true });

/**
 * Body parser JSON com erros no formato padrão. Sem isso, JSON malformado cairia
 * no handler padrão do Express, que expõe stack trace fora de produção.
 */
export function jsonBody(req: Request, res: Response, next: NextFunction): void {
  parser(req, res, (err?: unknown) => {
    if (!err) {
      next();
      return;
    }
    const status = (err as { status?: number }).status;
    const body: ApiError =
      status === 413
        ? { statusCode: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Payload muito grande.' }
        : { statusCode: 400, code: 'VALIDATION_ERROR', message: 'JSON inválido.' };
    res.status(body.statusCode).json(body);
  });
}
