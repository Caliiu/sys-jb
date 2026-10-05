'use client';

import type { HTMLAttributes } from 'react';
import { useHorizontalScroll } from '@/hooks/useHorizontalScroll';

interface ScrollStripProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'nav' | 'ul';
}

/** Faixa horizontal do cassino (filtros, Top ganhos, jogos): rola com o dedo, com a roda do mouse e arrastando. */
export default function ScrollStrip({ as: Tag = 'div', className = '', ...rest }: ScrollStripProps) {
  const ref = useHorizontalScroll<HTMLElement>();
  return (
    <Tag
      ref={ref as never}
      className={`flex gap-2 overflow-x-auto overscroll-x-contain no-scrollbar select-none ${className}`}
      {...rest}
    />
  );
}
