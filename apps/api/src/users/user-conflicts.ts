import { AppError } from '../common/app-error.js';
import { conflictingUserField, isUniqueViolation } from '../common/prisma-errors.js';

const FIELD_LABEL = { phone: 'Telefone', document: 'CPF', email: 'Email' } as const;

/** Converte a violação de unicidade de users em 409 com o campo em conflito (sem valores). */
export function mapUniqueViolation(error: unknown): never {
  if (isUniqueViolation(error)) {
    const field = conflictingUserField(error);
    const message = field ? `${FIELD_LABEL[field]} já cadastrado nesta banca.` : 'Dados já cadastrados nesta banca.';
    throw new AppError(409, 'CONFLICT', message, field ? [{ field, message: 'Já cadastrado.' }] : undefined);
  }
  throw error;
}
