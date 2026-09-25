import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { ApiError, ApiErrorCode } from '@sysjb/contracts';
import { Prisma } from '@sysjb/database';
import type { Response } from 'express';
import { AppError, Errors } from './app-error.js';

const CODE_BY_STATUS: Record<number, ApiErrorCode> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
};

export function toApiError(exception: unknown): ApiError {
  if (exception instanceof AppError) return exception.toResponse();
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const code = CODE_BY_STATUS[status];
    if (code) {
      const message = status === 404 ? 'Rota não encontrada.' : 'Requisição inválida.';
      return { statusCode: status, code, message };
    }
  }
  return Errors.internal().toResponse();
}

/** Resposta de erro única para toda a API: sem stack trace, SQL ou dados enviados. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const body = toApiError(exception);
    if (body.statusCode >= 500) {
      // Somente tipo/código: mensagens de driver podem carregar valores.
      const prismaCode = exception instanceof Prisma.PrismaClientKnownRequestError ? ` ${exception.code}` : '';
      const name = exception instanceof Error ? exception.name : typeof exception;
      this.logger.error(`erro não tratado: ${name}${prismaCode}`);
    }
    res.status(body.statusCode).json(body);
  }
}
