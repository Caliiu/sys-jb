import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUuid } from './uuid';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.restoreAllMocks());

describe('randomUuid', () => {
  it('usa crypto.randomUUID quando a página é segura', () => {
    const spy = vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111');
    expect(randomUuid()).toBe('11111111-1111-4111-8111-111111111111');
    expect(spy).toHaveBeenCalledOnce();
  });

  it('sem crypto.randomUUID (página sem HTTPS): UUID v4 válido e diferente a cada chamada', () => {
    // Como o navegador faz fora de HTTPS: o método não existe.
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      const ids = new Set(Array.from({ length: 200 }, () => randomUuid()));
      expect(ids.size).toBe(200);
      for (const id of ids) expect(id).toMatch(UUID_V4);
    } finally {
      delete (crypto as unknown as Record<string, unknown>).randomUUID;
    }
    expect(typeof crypto.randomUUID).toBe('function');
  });
});
