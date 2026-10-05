'use client';

import {
  CASINO_LIMITS,
  type CasinoGameCard,
  type CasinoGamesPage,
  type CasinoLobby as Lobby,
  casinoGamePath,
} from '@sysjb/contracts';
import { ChevronLeft, Flame, Gem, Heart, Loader2, Search, Trophy, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadCasinoGamesAction } from '@/app/casino-actions';
import { useLocalStorageItem } from '@/hooks/useLocalStorageItem';
import { casinoFavoritesKey, parseCasinoFavorites, toggleCasinoFavorite } from '@/lib/casino-favorites';
import { formatBrl } from '@/lib/currency';
import { ROUTES } from '@/lib/routes';
import PixIcon from '../icons/PixIcon';
import CasinoGameTile from './CasinoGameTile';
import ScrollStrip from './ScrollStrip';

interface CasinoLobbyProps {
  /** null = não foi possível carregar o lobby. */
  lobby: Lobby | null;
  /** Disponível Games (centavos): o saldo do cassino. */
  balanceCents: number;
  userId: string;
}

const FAVORITES = '__favoritos__';
const ALL = '__todos__';
const SEARCH_DELAY_MS = 350;

type ListTarget = { provider: string } | { search: string };

/** Lista de um alvo (provedor ou busca): `key` diz de qual, para não mostrar a de outro filtro. */
type ListState =
  | { status: 'loading'; key: string; items: CasinoGameCard[] }
  | { status: 'ready'; key: string; page: CasinoGamesPage; items: CasinoGameCard[] }
  | { status: 'error'; key: string; message: string; items: CasinoGameCard[] };

const keyOf = (target: ListTarget) => ('search' in target ? `s:${target.search}` : `p:${target.provider}`);

/**
 * Lobby do cassino (visual de IMAGES/Cassino-1.png): saldo (Disponível Games), Recarga Pix, busca por jogo ou
 * provedor, filtros (Todos, Favoritos e cada provedor), Top ganhos e uma faixa por provedor com "Ver todos".
 * Favoritos ficam neste aparelho. Lista do provedor e busca vêm aos poucos (server action), descartando respostas
 * atrasadas.
 */
export default function CasinoLobby({ lobby, balanceCents, userId }: CasinoLobbyProps) {
  const router = useRouter();
  const favoritesItem = useLocalStorageItem(casinoFavoritesKey(userId));
  const favorites = useMemo(() => parseCasinoFavorites(favoritesItem.raw), [favoritesItem.raw]);
  const favoriteIds = useMemo(() => new Set(favorites.map((g) => g.id)), [favorites]);
  const toggleFavorite = useCallback(
    (game: CasinoGameCard) =>
      favoritesItem.write(JSON.stringify(toggleCasinoFavorite(parseCasinoFavorites(favoritesItem.read()), game))),
    [favoritesItem],
  );

  const [filter, setFilter] = useState<string>(ALL);
  const [query, setQuery] = useState('');
  const [list, setList] = useState<ListState | null>(null);
  const requestRef = useRef(0);

  const search = query.trim();
  const searching = search.length >= CASINO_LIMITS.searchMin;
  const provider = !searching && filter !== ALL && filter !== FAVORITES ? filter : null;
  const target = useMemo<ListTarget | null>(
    () => (searching ? { search } : provider ? { provider } : null),
    [searching, search, provider],
  );
  const targetKey = target ? keyOf(target) : null;
  // Até a primeira resposta do alvo atual, a lista mostra o carregando (nunca a lista do filtro anterior).
  const shown: ListState =
    list && list.key === targetKey ? list : { status: 'loading', key: targetKey ?? '', items: [] };

  const load = useCallback(
    async (to: ListTarget, page: number, previous: CasinoGameCard[]) => {
      const id = ++requestRef.current;
      const key = keyOf(to);
      setList({ status: 'loading', key, items: previous });
      let res: Awaited<ReturnType<typeof loadCasinoGamesAction>>;
      try {
        res = await loadCasinoGamesAction({ ...to, page });
      } catch {
        res = { ok: false, code: 'UNAVAILABLE', message: 'Não foi possível carregar os jogos. Tente novamente.' };
      }
      if (id !== requestRef.current) return;
      if (res.ok) {
        setList({ status: 'ready', key, page: res.page, items: [...previous, ...res.page.items] });
      } else if (res.code === 'SESSION_INVALID') {
        router.replace('/login');
      } else {
        setList({ status: 'error', key, message: res.message, items: previous });
      }
    },
    [router],
  );

  // Busca (com espera curta entre teclas) ou lista do provedor escolhido; sem alvo, respostas pendentes são ignoradas.
  useEffect(() => {
    if (!target) {
      requestRef.current += 1;
      return;
    }
    const timer = setTimeout(() => void load(target, 1, []), 'search' in target ? SEARCH_DELAY_MS : 0);
    return () => clearTimeout(timer);
  }, [target, load]);

  const loadMore = () => {
    if (!target || shown.status !== 'ready' || shown.page.page >= shown.page.totalPages) return;
    void load(target, shown.page.page + 1, shown.items);
  };

  const selectFilter = (next: string) => {
    setFilter(next);
    setQuery('');
    window.scrollTo({ top: 0 });
  };

  const sections = lobby?.sections ?? [];
  const showList = target !== null;

  return (
    <div className="min-h-dvh bg-[#14151c] text-white pb-10">
      <header className="sticky top-0 z-20 bg-[#14151c]/95 backdrop-blur px-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <Link href={ROUTES.home} aria-label="Voltar" className="w-9 h-9 flex items-center justify-center shrink-0">
            <ChevronLeft className="w-6 h-6" strokeWidth={2.5} aria-hidden />
          </Link>
          <h1 className="text-[19px] font-bold flex-1 truncate">Cassino</h1>
          <span
            aria-label={`Saldo do cassino ${formatBrl(balanceCents)}`}
            className="h-9 px-3 rounded-lg bg-white/10 text-[14px] font-bold flex items-center tabular-nums"
          >
            {formatBrl(balanceCents)}
          </span>
          <Link
            href={ROUTES.pixTopUp}
            className="h-9 px-3 rounded-lg bg-gradient-to-r from-cyan-500 to-sky-600 text-[13px] font-semibold flex items-center gap-1.5 shrink-0"
          >
            <PixIcon className="w-4 h-4" aria-hidden />
            Recarga Pix
          </Link>
        </div>

        <label className="mt-3 flex items-center gap-2 h-12 px-4 rounded-2xl bg-white/[0.06] ring-1 ring-white/10 focus-within:ring-white/30">
          <Search className="w-5 h-5 text-white/50 shrink-0" aria-hidden />
          <span className="sr-only">Buscar por jogo ou provedor</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value.slice(0, CASINO_LIMITS.searchMax))}
            placeholder="Buscar por jogo ou provedor"
            autoComplete="off"
            enterKeyHint="search"
            className="flex-1 min-w-0 bg-transparent outline-none text-[15px] placeholder:text-white/45"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Limpar busca" className="shrink-0">
              <X className="w-4 h-4 text-white/60" aria-hidden />
            </button>
          )}
        </label>

        {sections.length > 0 && (
          <ScrollStrip as="nav" aria-label="Filtros" className="mt-3 -mx-3 px-3">
            <Chip active={!searching && filter === ALL} onClick={() => selectFilter(ALL)}>
              Todos
            </Chip>
            {favorites.length > 0 && (
              <Chip active={!searching && filter === FAVORITES} onClick={() => selectFilter(FAVORITES)}>
                <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" aria-hidden /> Favoritos
              </Chip>
            )}
            {sections.map((s) => (
              <Chip
                key={s.provider}
                active={!searching && filter === s.provider}
                onClick={() => selectFilter(s.provider)}
              >
                <Gem className="w-3.5 h-3.5 text-pink-500" aria-hidden /> {s.provider}
              </Chip>
            ))}
          </ScrollStrip>
        )}
      </header>

      {!lobby ? (
        <Notice>Não foi possível carregar o cassino. Tente novamente em instantes.</Notice>
      ) : !lobby.available ? (
        <Notice>Cassino indisponível no momento.</Notice>
      ) : showList ? (
        <GameList
          title={searching ? `Resultados para "${search}"` : (provider ?? '')}
          state={shown}
          favoriteIds={favoriteIds}
          onToggleFavorite={toggleFavorite}
          onMore={loadMore}
        />
      ) : filter === FAVORITES ? (
        <section className="px-3 pt-3">
          <SectionTitle icon={<Heart className="w-4 h-4 text-rose-500 fill-rose-500" aria-hidden />}>
            Favoritos
          </SectionTitle>
          {favorites.length === 0 ? (
            <p className="text-[14px] text-white/60 py-6 text-center">Toque no coração de um jogo para favoritar.</p>
          ) : (
            <Grid games={favorites} favoriteIds={favoriteIds} onToggleFavorite={toggleFavorite} />
          )}
        </section>
      ) : sections.length === 0 ? (
        <Notice>Nenhum jogo disponível no momento.</Notice>
      ) : (
        <>
          {lobby.topWins.length > 0 && (
            <section className="pt-3">
              <SectionTitle icon={<Trophy className="w-4 h-4 text-amber-400" aria-hidden />} className="px-3">
                Top ganhos
              </SectionTitle>
              <ScrollStrip as="ul" className="px-3">
                {lobby.topWins.map((win, i) => (
                  <li key={`${win.game.id}-${i}`} className="shrink-0">
                    <a
                      href={casinoGamePath(win.game.id)}
                      className="flex items-center gap-2.5 w-[200px] p-2 rounded-xl bg-white/[0.05] ring-1 ring-white/10"
                    >
                      <span className="w-11 h-11 rounded-lg overflow-hidden bg-white/10 shrink-0">
                        {win.game.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={win.game.imageUrl}
                            alt=""
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[12.5px] text-white/80 truncate">{win.playerLabel}</span>
                        <span className="block text-[11.5px] text-white/50 truncate">{win.game.name}</span>
                        <span className="block text-[14px] font-bold text-emerald-400 tabular-nums">
                          {formatBrl(win.winCents)}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ScrollStrip>
            </section>
          )}

          {sections.map((section, i) => (
            <section key={section.provider} className="pt-4">
              <div className="flex items-center justify-between px-3">
                <SectionTitle
                  icon={
                    i === 0 ? (
                      <Flame className="w-4 h-4 text-orange-500" aria-hidden />
                    ) : (
                      <Gem className="w-4 h-4 text-pink-500" aria-hidden />
                    )
                  }
                >
                  {section.provider}
                </SectionTitle>
                {section.total > section.games.length && (
                  <button
                    type="button"
                    onClick={() => selectFilter(section.provider)}
                    className="h-7 px-3 mb-2 rounded-full bg-white/10 text-[12.5px] text-white/80"
                    aria-label={`Ver todos os jogos de ${section.provider}`}
                  >
                    Ver todos
                  </button>
                )}
              </div>
              <ScrollStrip className="px-3">
                {section.games.map((game) => (
                  <CasinoGameTile
                    key={game.id}
                    game={game}
                    inRow
                    favorite={favoriteIds.has(game.id)}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </ScrollStrip>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        // O filtro escolhido fica inteiro à vista na faixa.
        event.currentTarget.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        onClick();
      }}
      aria-pressed={active}
      className={`h-10 px-4 rounded-xl text-[14px] font-semibold flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
        active ? 'bg-white text-[#14151c]' : 'bg-white/[0.07] text-white/90'
      }`}
    >
      {children}
    </button>
  );
}

function SectionTitle({
  icon,
  children,
  className = '',
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2 className={`flex items-center gap-1.5 text-[15.5px] font-bold mb-2 ${className}`}>
      {icon}
      {children}
    </h2>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="mx-3 mt-6 p-4 rounded-xl bg-white/[0.05] text-[14px] text-white/75 text-center">
      {children}
    </p>
  );
}

function Grid({
  games,
  favoriteIds,
  onToggleFavorite,
}: {
  games: CasinoGameCard[];
  favoriteIds: Set<number>;
  onToggleFavorite: (game: CasinoGameCard) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {games.map((game) => (
        <CasinoGameTile
          key={game.id}
          game={game}
          favorite={favoriteIds.has(game.id)}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </div>
  );
}

function GameList({
  title,
  state,
  favoriteIds,
  onToggleFavorite,
  onMore,
}: {
  title: string;
  state: ListState;
  favoriteIds: Set<number>;
  onToggleFavorite: (game: CasinoGameCard) => void;
  onMore: () => void;
}) {
  const items = state.items;
  const hasMore = state.status === 'ready' && state.page.page < state.page.totalPages;
  return (
    <section className="px-3 pt-3" aria-busy={state.status === 'loading'}>
      <SectionTitle icon={<Gem className="w-4 h-4 text-pink-500" aria-hidden />}>
        <span className="truncate">{title}</span>
      </SectionTitle>
      {items.length > 0 && <Grid games={items} favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} />}
      {state.status === 'ready' && items.length === 0 && (
        <p className="text-[14px] text-white/60 py-6 text-center">Nenhum jogo encontrado.</p>
      )}
      {state.status === 'error' && (
        <p role="alert" className="text-[14px] text-rose-300 py-4 text-center">
          {state.message}
        </p>
      )}
      {state.status === 'loading' && (
        <div className="flex justify-center py-6">
          <Loader2 className="w-6 h-6 animate-spin text-white/60" aria-label="Carregando" />
        </div>
      )}
      {hasMore && (
        <button
          type="button"
          onClick={onMore}
          className="mt-4 w-full h-11 rounded-xl bg-white/10 text-[14px] font-semibold"
        >
          Carregar mais
        </button>
      )}
    </section>
  );
}
