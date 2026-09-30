import { ChevronsUpDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { controlClass, labelClass } from './filter-styles';

interface FilterSelectProps {
  id: string;
  label: string;
  /** Sem nome, o campo não vai para a URL (filtro de cadastro que ainda não existe). */
  name?: string;
  defaultValue: string;
  /** Dica ao passar o mouse. */
  title?: string;
  children: ReactNode;
}

/** Campo de escolha dos filtros: rótulo em cima e select com a seta dupla à direita. */
export default function FilterSelect({ id, label, name, defaultValue, title, children }: FilterSelectProps) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          name={name}
          defaultValue={defaultValue}
          title={title}
          className={`${controlClass} appearance-none pr-9`}
        >
          {children}
        </select>
        <ChevronsUpDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted"
          aria-hidden
        />
      </div>
    </div>
  );
}
