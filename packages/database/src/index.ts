import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export * from './generated/prisma/client.js';

export interface CreatePrismaClientOptions {
  connectionString: string;
  /** Tamanho máximo do pool de conexões. */
  max?: number;
}

export function createPrismaClient({ connectionString, max = 10 }: CreatePrismaClientOptions): PrismaClient {
  const adapter = new PrismaPg({ connectionString, max });
  return new PrismaClient({ adapter });
}
