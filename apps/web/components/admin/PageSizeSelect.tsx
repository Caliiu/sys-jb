import { PAGE_SIZES } from '@/lib/admin/page-size';
import AutoSubmitSelect from './AutoSubmitSelect';

/** "[25] resultados por página": campo `pageSize` do formulário GET da lista (envia ao mudar). */
export default function PageSizeSelect({ id, value }: { id: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5 text-[12.5px]">
      <AutoSubmitSelect
        id={id}
        name="pageSize"
        defaultValue={String(value)}
        aria-label="Resultados por página"
        className="h-8 rounded-sm border border-admin-border bg-admin-surface px-1.5 text-[12.5px] outline-none focus:border-admin-accent"
      >
        {PAGE_SIZES.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </AutoSubmitSelect>
      <span aria-hidden>resultados por página</span>
    </div>
  );
}
