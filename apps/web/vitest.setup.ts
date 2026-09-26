import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

// jsdom não implementa ResizeObserver (usado pelas barras superiores).
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom não implementa window.scrollTo (só loga "not implemented").
window.scrollTo = () => {};
