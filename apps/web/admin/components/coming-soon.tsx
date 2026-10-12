'use client';

import { Telescope } from 'lucide-react';

export function ComingSoon() {
  return (
    // Altura da tela menos a barra superior (o cabeçalho fica no layout do painel).
    <div className="h-[calc(100svh-8rem)]">
      <div className="m-auto flex h-full w-full flex-col items-center justify-center gap-2">
        <Telescope size={72} />
        <h1 className="text-4xl leading-tight font-bold">Em breve!</h1>
        <p className="text-center text-muted-foreground">
          Esta página ainda não foi refeita no novo painel. <br />
          Ela volta em breve.
        </p>
      </div>
    </div>
  );
}
