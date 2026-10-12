'use client';

import { type SVGProps } from 'react';
import { Root as Radio, Item } from '@radix-ui/react-radio-group';
import { CircleCheck, RotateCcw, Settings } from 'lucide-react';
import { IconLayoutCompact } from '@/admin/assets/custom/icon-layout-compact';
import { IconLayoutDefault } from '@/admin/assets/custom/icon-layout-default';
import { IconLayoutFull } from '@/admin/assets/custom/icon-layout-full';
import { IconSidebarFloating } from '@/admin/assets/custom/icon-sidebar-floating';
import { IconSidebarInset } from '@/admin/assets/custom/icon-sidebar-inset';
import { IconSidebarSidebar } from '@/admin/assets/custom/icon-sidebar-sidebar';
import { IconThemeDark } from '@/admin/assets/custom/icon-theme-dark';
import { IconThemeLight } from '@/admin/assets/custom/icon-theme-light';
import { IconThemeSystem } from '@/admin/assets/custom/icon-theme-system';
import { cn } from '@/admin/lib/utils';
import { type Collapsible, type Variant, useLayout } from '@/admin/context/layout-provider';
import { useTheme } from '@/admin/context/theme-provider';
import { type Theme } from '@/admin/lib/theme';
import { Button } from '@/admin/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/admin/components/ui/sheet';
import { useSidebar } from './ui/sidebar';

export function ConfigDrawer() {
  const { setOpen } = useSidebar();
  const { resetTheme } = useTheme();
  const { resetLayout } = useLayout();

  const handleReset = () => {
    setOpen(true);
    resetTheme();
    resetLayout();
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button size="icon" variant="ghost" aria-label="Aparência" className="rounded-full">
          <Settings aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent className="flex flex-col">
        <SheetHeader className="pb-0 text-start">
          <SheetTitle>Aparência</SheetTitle>
          <SheetDescription>Ajuste o tema e o layout do painel ao seu gosto.</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 overflow-y-auto px-4">
          <ThemeConfig />
          <SidebarConfig />
          <LayoutConfig />
        </div>
        <SheetFooter className="gap-2">
          <Button variant="destructive" onClick={handleReset}>
            Restaurar padrão
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function SectionTitle({
  title,
  showReset = false,
  onReset,
  resetAriaLabel,
  className,
}: {
  title: string;
  showReset?: boolean;
  onReset?: () => void;
  /** Shown on the small per-section reset (RotateCcw) for accessibility and tests. */
  resetAriaLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn('mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground', className)}>
      {title}
      {showReset && onReset && (
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="size-4 rounded-full"
          onClick={onReset}
          aria-label={resetAriaLabel}
        >
          <RotateCcw className="size-3" />
        </Button>
      )}
    </div>
  );
}

function RadioGroupItem({
  item,
  isTheme = false,
}: {
  item: {
    value: string;
    label: string;
    icon: (props: SVGProps<SVGSVGElement>) => React.ReactElement;
  };
  isTheme?: boolean;
}) {
  return (
    <Item
      value={item.value}
      className={cn('group outline-none', 'transition duration-200 ease-in')}
      aria-label={item.label}
      aria-describedby={`${item.value}-description`}
    >
      <div
        className={cn(
          'relative rounded-[6px] ring-[1px] ring-border',
          'group-data-[state=checked]:shadow-2xl group-data-[state=checked]:ring-primary',
          'group-focus-visible:ring-2',
        )}
        role="img"
        aria-hidden="false"
        aria-label={`Prévia: ${item.label}`}
      >
        <CircleCheck
          className={cn(
            'size-6 fill-primary stroke-white',
            'group-data-[state=unchecked]:hidden',
            'absolute top-0 right-0 translate-x-1/2 -translate-y-1/2',
          )}
          aria-hidden="true"
        />
        <item.icon
          className={cn(
            !isTheme &&
              'fill-primary stroke-primary group-data-[state=unchecked]:fill-muted-foreground group-data-[state=unchecked]:stroke-muted-foreground',
          )}
          aria-hidden="true"
        />
      </div>
      <div className="mt-1 text-xs" id={`${item.value}-description`} aria-live="polite">
        {item.label}
      </div>
    </Item>
  );
}

function ThemeConfig() {
  const { defaultTheme, theme, setTheme } = useTheme();
  return (
    <div>
      <SectionTitle
        title="Tema"
        showReset={theme !== defaultTheme}
        onReset={() => setTheme(defaultTheme)}
        resetAriaLabel="Voltar o tema ao padrão"
      />
      <Radio
        value={theme}
        onValueChange={(value) => setTheme(value as Theme)}
        className="grid w-full max-w-md grid-cols-3 gap-4"
        aria-label="Tema"
        aria-describedby="theme-description"
      >
        {[
          {
            value: 'system',
            label: 'Sistema',
            icon: IconThemeSystem,
          },
          {
            value: 'light',
            label: 'Claro',
            icon: IconThemeLight,
          },
          {
            value: 'dark',
            label: 'Escuro',
            icon: IconThemeDark,
          },
        ].map((item) => (
          <RadioGroupItem key={item.value} item={item} isTheme />
        ))}
      </Radio>
      <div id="theme-description" className="sr-only">
        Escolha entre o tema do sistema, claro ou escuro
      </div>
    </div>
  );
}

function SidebarConfig() {
  const { defaultVariant, variant, setVariant } = useLayout();
  return (
    <div className="max-md:hidden">
      <SectionTitle
        title="Menu lateral"
        showReset={defaultVariant !== variant}
        onReset={() => setVariant(defaultVariant)}
        resetAriaLabel="Voltar o menu lateral ao padrão"
      />
      <Radio
        value={variant}
        onValueChange={(value) => setVariant(value as Variant)}
        className="grid w-full max-w-md grid-cols-3 gap-4"
        aria-label="Estilo do menu lateral"
        aria-describedby="sidebar-description"
      >
        {[
          {
            value: 'inset',
            label: 'Embutido',
            icon: IconSidebarInset,
          },
          {
            value: 'floating',
            label: 'Flutuante',
            icon: IconSidebarFloating,
          },
          {
            value: 'sidebar',
            label: 'Lateral',
            icon: IconSidebarSidebar,
          },
        ].map((item) => (
          <RadioGroupItem key={item.value} item={item} />
        ))}
      </Radio>
      <div id="sidebar-description" className="sr-only">
        Escolha entre menu embutido, flutuante ou lateral
      </div>
    </div>
  );
}

function LayoutConfig() {
  const { open, setOpen } = useSidebar();
  const { defaultCollapsible, collapsible, setCollapsible } = useLayout();

  const radioState = open ? 'default' : collapsible;

  return (
    <div className="max-md:hidden">
      <SectionTitle
        title="Layout"
        showReset={radioState !== 'default'}
        onReset={() => {
          setOpen(true);
          setCollapsible(defaultCollapsible);
        }}
        resetAriaLabel="Voltar o layout ao padrão"
      />
      <Radio
        value={radioState}
        onValueChange={(v) => {
          if (v === 'default') {
            setOpen(true);
            return;
          }
          setOpen(false);
          setCollapsible(v as Collapsible);
        }}
        className="grid w-full max-w-md grid-cols-3 gap-4"
        aria-label="Layout"
        aria-describedby="layout-description"
      >
        {[
          {
            value: 'default',
            label: 'Padrão',
            icon: IconLayoutDefault,
          },
          {
            value: 'icon',
            label: 'Compacto',
            icon: IconLayoutCompact,
          },
          {
            value: 'offcanvas',
            label: 'Tela cheia',
            icon: IconLayoutFull,
          },
        ].map((item) => (
          <RadioGroupItem key={item.value} item={item} />
        ))}
      </Radio>
      <div id="layout-description" className="sr-only">
        Escolha entre menu aberto, só ícones ou escondido
      </div>
    </div>
  );
}
