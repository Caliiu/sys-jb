'use client';

import { type CasinoGameCard, casinoGamePath } from '@sysjb/contracts';
import { Gamepad2, Heart } from 'lucide-react';

interface CasinoGameTileProps {
  game: CasinoGameCard;
  favorite: boolean;
  onToggleFavorite: (game: CasinoGameCard) => void;
  /** Largura fixa nas faixas horizontais; na grade ocupa a coluna. */
  inRow?: boolean;
}

/**
 * Card do jogo. O link é <a> comum (carga inteira da página): a tela do jogo tem uma CSP própria que libera o
 * iframe do provedor, e ela só vale numa carga nova do documento.
 */
export default function CasinoGameTile({ game, favorite, onToggleFavorite, inRow }: CasinoGameTileProps) {
  return (
    <div className={`relative ${inRow ? 'w-[148px] shrink-0' : ''}`}>
      <a
        href={casinoGamePath(game.id)}
        className="block aspect-[4/3] rounded-xl overflow-hidden bg-white/5 ring-1 ring-white/10 active:scale-[0.98] transition-transform"
      >
        {game.imageUrl ? (
          // Imagem externa do provedor (https), sem otimização do Next.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={game.imageUrl}
            alt={game.name}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="w-full h-full flex flex-col items-center justify-center gap-1.5 px-2 text-center">
            <Gamepad2 className="w-7 h-7 text-white/40" aria-hidden />
            <span className="text-[12px] font-semibold text-white/80 line-clamp-2">{game.name}</span>
          </span>
        )}
      </a>
      <button
        type="button"
        onClick={() => onToggleFavorite(game)}
        aria-pressed={favorite}
        aria-label={favorite ? `Remover ${game.name} dos favoritos` : `Favoritar ${game.name}`}
        className="absolute top-1.5 right-1.5 w-8 h-8 rounded-full bg-black/55 flex items-center justify-center active:scale-90 transition-transform"
      >
        <Heart className={`w-4 h-4 ${favorite ? 'fill-rose-500 text-rose-500' : 'text-white'}`} aria-hidden />
      </button>
    </div>
  );
}
