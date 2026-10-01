import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => cleanup());

// jsdom não implementa ResizeObserver (usado pelas barras superiores).
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom não implementa window.scrollTo (só loga "not implemented"). Testes de servidor rodam sem window.
if (typeof window !== 'undefined') window.scrollTo = () => {};

// Server action do atendimento (usada pelo menu lateral, rodapé e login): no navegador de teste não há servidor.
// Os testes que dependem do número redefinem o retorno (ex.: SupportBanner.test.tsx).
vi.mock('@/app/support-actions', () => ({
  supportContactAction: vi.fn(async () => ({ phone: null, message: 'Olá, preciso de ajuda.' })),
}));

// Server actions das notificações (login, saída e app aberto): os testes de push redefinem quando precisam.
vi.mock('@/app/push-actions', () => ({
  savePushSubscriptionAction: vi.fn(async () => true),
  removePushSubscriptionAction: vi.fn(async () => undefined),
}));
