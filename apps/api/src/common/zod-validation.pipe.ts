import type { ArgumentMetadata, PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { AppError } from './app-error.js';

export class ZodValidationPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown, metadata?: ArgumentMetadata): z.output<S> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    // Somente nomes de campos e mensagens próprias; nunca os valores recebidos.
    const root = metadata?.data ?? metadata?.type ?? 'body';
    const details = result.error.issues.flatMap((issue) => {
      if (issue.code === 'unrecognized_keys') {
        return issue.keys.map((key) => ({ field: key, message: 'Campo não permitido.' }));
      }
      return [{ field: issue.path.join('.') || root, message: issue.message }];
    });
    throw new AppError(400, 'VALIDATION_ERROR', 'Payload inválido.', details);
  }
}
