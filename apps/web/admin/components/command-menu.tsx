'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ChevronRight, Laptop, Moon, Sun } from 'lucide-react';
import { useSearch } from '@/admin/context/search-provider';
import { useSession } from '@/admin/context/session-provider';
import { useTheme } from '@/admin/context/theme-provider';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/admin/components/ui/command';
import { navGroupsFor } from './layout/data/sidebar-data';
import { ScrollArea } from './ui/scroll-area';

/** Texto sem acento e sem maiúsculas: "cotacoes" acha "Cotações". */
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const filter = (value: string, search: string, keywords?: string[]) =>
  normalize([value, ...(keywords ?? [])].join(' ')).includes(normalize(search.trim())) ? 1 : 0;

export function CommandMenu() {
  const router = useRouter();
  const { setTheme } = useTheme();
  const { open, setOpen } = useSearch();
  const { permissions } = useSession();

  const runCommand = React.useCallback(
    (command: () => unknown) => {
      setOpen(false);
      command();
    },
    [setOpen],
  );

  return (
    <CommandDialog modal open={open} onOpenChange={setOpen} filter={filter}>
      <CommandInput placeholder="Digite uma página ou comando…" />
      <CommandList>
        <ScrollArea type="hover" className="h-72 pe-1">
          <CommandEmpty>Nada encontrado.</CommandEmpty>
          {navGroupsFor(permissions).map((group) => (
            <CommandGroup key={group.title} heading={group.title}>
              {group.items.map((navItem, i) => {
                if (navItem.url)
                  return (
                    <CommandItem
                      key={`${navItem.url}-${i}`}
                      value={navItem.title}
                      onSelect={() => {
                        runCommand(() => router.push(navItem.url));
                      }}
                    >
                      <div className="flex size-4 items-center justify-center">
                        <ArrowRight className="size-2 text-muted-foreground/80" />
                      </div>
                      {navItem.title}
                    </CommandItem>
                  );

                return navItem.items?.map((subItem, i) => (
                  <CommandItem
                    key={`${navItem.title}-${subItem.url}-${i}`}
                    value={`${navItem.title} ${subItem.title}`}
                    onSelect={() => {
                      runCommand(() => router.push(subItem.url));
                    }}
                  >
                    <div className="flex size-4 items-center justify-center">
                      <ArrowRight className="size-2 text-muted-foreground/80" />
                    </div>
                    {navItem.title} <ChevronRight /> {subItem.title}
                  </CommandItem>
                ));
              })}
            </CommandGroup>
          ))}
          <CommandSeparator />
          <CommandGroup heading="Tema">
            <CommandItem value="Tema Claro" onSelect={() => runCommand(() => setTheme('light'))}>
              <Sun /> <span>Claro</span>
            </CommandItem>
            <CommandItem value="Tema Escuro" onSelect={() => runCommand(() => setTheme('dark'))}>
              <Moon className="scale-90" />
              <span>Escuro</span>
            </CommandItem>
            <CommandItem value="Tema Sistema" onSelect={() => runCommand(() => setTheme('system'))}>
              <Laptop />
              <span>Sistema</span>
            </CommandItem>
          </CommandGroup>
        </ScrollArea>
      </CommandList>
    </CommandDialog>
  );
}
