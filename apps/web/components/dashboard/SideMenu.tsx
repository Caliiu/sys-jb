'use client';

import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Home,
  User,
  Coins,
  Gem,
  Disc,
  Award,
  BarChart2,
  FileText,
  Banknote,
  Settings,
  Headphones,
  LogOut,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useOverlay } from '@/hooks/useOverlay';
import PixIcon from '../icons/PixIcon';
import { ROUTES } from '@/lib/routes';
import { useToast } from '../ui/Toast';

/** id do painel: o botão de menu das barras superiores aponta para ele (aria-controls). */
export const SIDE_MENU_ID = 'side-menu';

interface SideMenuProps {
  id: string;
  open: boolean;
  onClose: () => void;
}

interface MenuItem {
  label: string;
  icon: typeof Home | typeof PixIcon;
  /** Rota existente. Sem rota, o item avisa que a funcionalidade vem em breve. */
  to?: string;
  highlight?: boolean;
}

const MAIN_ITEMS: MenuItem[] = [
  { label: 'Início', icon: Home, to: ROUTES.home },
  { label: 'Perfil', icon: User },
  { label: 'Loterias', icon: Coins },
  { label: 'Cassino', icon: Gem },
  { label: 'Bingo', icon: Disc },
  { label: 'Premiadas', icon: Award, to: ROUTES.prizes },
  { label: 'Resultados', icon: BarChart2, to: ROUTES.results },
  { label: 'Relatórios', icon: FileText, to: ROUTES.reports },
  { label: 'Recarga PIX', icon: PixIcon, to: ROUTES.pixTopUp, highlight: true },
  { label: 'Solicitar saque', icon: Banknote },
  { label: 'Configurações', icon: Settings },
];

const itemClass = 'w-full flex items-center gap-3 px-5 py-3 text-[14.5px] font-medium';

/**
 * Menu lateral (visual do original), encaixado na coluna do app (max 480px) e logo abaixo da
 * barra superior. Fechado, fica `inert`: fora do Tab e dos leitores de tela.
 */
export default function SideMenu({ id, open, onClose }: SideMenuProps) {
  const router = useRouter();
  const { logout } = useAuth();
  const toast = useToast();
  const panelRef = useRef<HTMLElement>(null);

  useOverlay(open, onClose, panelRef);

  function handleItem(item: MenuItem) {
    onClose();
    if (item.to) router.push(item.to);
    else toast.comingSoon(item.label);
  }

  async function handleLogout() {
    onClose();
    await logout();
    router.replace('/login');
  }

  return (
    <div
      inert={!open}
      style={{ top: 'var(--topbar-height)' }}
      className={`fixed inset-x-0 bottom-0 z-[60] mx-auto max-w-[480px] overflow-hidden ${
        open ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
    >
      <div
        onClick={onClose}
        aria-hidden
        className={`absolute inset-0 bg-black/40 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}
      />
      <aside
        id={id}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={`absolute top-0 right-0 h-full w-[72%] max-w-[320px] bg-white shadow-2xl transition-transform duration-300 overflow-y-auto overscroll-contain ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <nav className="pt-4 pb-4" aria-label="Menu principal">
          <ul>
            {MAIN_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.label}>
                  <button
                    type="button"
                    onClick={() => handleItem(item)}
                    className={`${itemClass} ${item.highlight ? 'text-brand-teal' : 'text-gray-700'}`}
                  >
                    <Icon
                      className={`w-4.5 h-4.5 ${item.highlight ? 'text-brand-teal' : 'text-brand-primary'}`}
                      size={18}
                      aria-hidden
                    />
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="px-5 pt-4 pb-1 text-[11px] font-semibold text-gray-400 tracking-wide">AJUDA</p>
          <ul>
            <li>
              <button
                type="button"
                onClick={() => handleItem({ label: 'Suporte', icon: Headphones })}
                className={`${itemClass} text-gray-700`}
              >
                <Headphones className="w-4.5 h-4.5 text-brand-primary" size={18} aria-hidden />
                Suporte
              </button>
            </li>
            <li>
              <button type="button" onClick={handleLogout} className={`${itemClass} text-gray-700`}>
                <LogOut className="w-4.5 h-4.5 text-brand-primary" size={18} aria-hidden />
                Sair
              </button>
            </li>
          </ul>
        </nav>
      </aside>
    </div>
  );
}
