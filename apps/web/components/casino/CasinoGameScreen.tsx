import type { CasinoLaunchResponse } from '@sysjb/contracts';
import { Power } from 'lucide-react';
import { ROUTES } from '@/lib/routes';

/**
 * Jogo na coluna do app (como as outras telas): barra com o nome e "Sair" (volta ao lobby numa carga nova, com o
 * saldo atualizado) e o jogo do provedor num iframe isolado: scripts e a origem do próprio jogo, sem poder navegar a
 * nossa página. Sem `launch` (provedor fora do ar), avisa e oferece voltar.
 */
export default function CasinoGameScreen({ launch }: { launch: CasinoLaunchResponse | null }) {
  return (
    // Mesma coluna das outras telas (app-shell, até 480px): altura exata da tela, sem rolar a página.
    <div className="app-shell h-dvh !min-h-0 flex flex-col overflow-hidden bg-black text-white">
      <header className="h-14 shrink-0 flex items-center justify-between px-4 bg-[#181a22]">
        <h1 className="text-[15px] font-bold truncate">{launch?.game.name ?? 'Cassino'}</h1>
        <a href={ROUTES.casino} className="flex items-center gap-1.5 text-[15px] shrink-0">
          <Power className="w-5 h-5" aria-hidden />
          Sair
        </a>
      </header>
      {launch ? (
        <iframe
          src={launch.launchUrl}
          title={launch.game.name}
          className="flex-1 w-full border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock allow-orientation-lock"
          allow="autoplay; fullscreen; screen-wake-lock"
          allowFullScreen
          referrerPolicy="no-referrer"
        />
      ) : (
        <div role="alert" className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-[15px] text-white/80">
            Não foi possível abrir o jogo agora. Tente novamente em instantes.
          </p>
          <a href={ROUTES.casino} className="h-11 px-5 rounded-xl bg-white/10 font-semibold flex items-center">
            Voltar ao cassino
          </a>
        </div>
      )}
    </div>
  );
}
