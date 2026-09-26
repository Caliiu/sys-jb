'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { SectionMenuItem } from '@/lib/section-menus';
import { useToast } from '../ui/Toast';

const rowClass =
  'w-full flex items-center justify-between rounded-xl bg-white px-4 py-4 text-left text-[14px] font-medium uppercase text-gray-900 shadow-sm active:scale-[0.99] transition-transform';

/** Lista de atalhos em cartões brancos. Item sem `href` avisa que vem em breve. */
export default function MenuList({ items, label }: { items: readonly SectionMenuItem[]; label: string }) {
  const toast = useToast();

  return (
    <nav aria-label={label}>
      <ul className="flex flex-col gap-1.5 px-3 pt-2">
        {items.map(({ label: text, href }) => {
          const content = (
            <>
              {text}
              <ChevronRight className="w-4 h-4 shrink-0 text-gray-300" aria-hidden />
            </>
          );
          return (
            <li key={text}>
              {href ? (
                <Link href={href} className={rowClass}>
                  {content}
                </Link>
              ) : (
                <button type="button" onClick={() => toast.comingSoon(text)} className={rowClass}>
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
