import { hash, verify } from '@node-rs/argon2';
import { Injectable } from '@nestjs/common';

// argon2id (padrão da biblioteca) com os parâmetros mínimos recomendados pela OWASP:
// 19 MiB de memória, 2 iterações, paralelismo 1.
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class PasswordService {
  private dummyHash: Promise<string> | null = null;

  hash(password: string): Promise<string> {
    return hash(password, OPTIONS);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  /**
   * Verificação contra um hash descartável, para CPF inexistente levar o mesmo tempo
   * que senha errada (não revela quais CPFs estão cadastrados).
   */
  async verifyDummy(password: string): Promise<false> {
    this.dummyHash ??= hash('senha-descartavel-para-tempo-constante', OPTIONS);
    await this.verify(await this.dummyHash, password);
    return false;
  }
}
