import { Prisma } from '@sysjb/database';

const UNIQUE_FIELDS = ['phone', 'document', 'email'] as const;
export type UniqueUserField = (typeof UNIQUE_FIELDS)[number];

export function isUniqueViolation(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Descobre qual unicidade foi violada pelos metadados (constraint/campos),
 * sem usar a mensagem do banco, que pode conter valores.
 */
export function conflictingUserField(error: Prisma.PrismaClientKnownRequestError): UniqueUserField | null {
  const meta = JSON.stringify(error.meta ?? {});
  return UNIQUE_FIELDS.find((field) => new RegExp(`\\b(users_tenant_id_${field}_key|${field})\\b`).test(meta)) ?? null;
}
