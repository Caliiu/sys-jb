'use client';

import {
  type AdminQuoteTableSummary,
  type AdminUserDetail,
  BRAZILIAN_UFS,
  MAX_DAILY_LIMIT_CENTS,
} from '@sysjb/contracts';
import { useRouter } from 'next/navigation';
import { type ReactNode, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { updateUnitSettingsAction } from '@/app/admin/actions';
import { MoneyInput } from '@/admin/components/money-input';
import { Alert, AlertDescription } from '@/admin/components/ui/alert';
import { Button } from '@/admin/components/ui/button';
import { Input } from '@/admin/components/ui/input';
import { Label } from '@/admin/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/admin/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/admin/components/ui/sheet';
import { Skeleton } from '@/admin/components/ui/skeleton';
import { Switch } from '@/admin/components/ui/switch';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { formatCommission } from '@/lib/admin/commission';
import {
  dailyLimitText,
  isBrazilianUf,
  UNIT_COMMISSION_HELP,
  type UnitSettingsForm,
  unitSettingsForm,
  unitSettingsPatch,
} from '@/lib/admin/units';
import { formatBrl } from '@/lib/currency';
import { FieldError } from '@/admin/components/field-error';

/** Unidade aberta pela URL (?unidade=...), carregada pelo servidor. */
export type UnitDetailState = { id: string } & (
  { status: 'ok'; unit: AdminUserDetail } | { status: 'not-found' } | { status: 'error'; message: string }
);

/** Radix Select não aceita item com valor vazio. */
const NONE = 'none';
const BANK_DEFAULT = 'default';

type UnitSettingsSheetProps = {
  /** Unidade aberta (null = fechada). */
  openId: string | null;
  /** Dados da unidade aberta; null enquanto carregam. */
  detail: UnitDetailState | null;
  /** Tabelas da banca para escolher; null = sem `quotes.read` ou falha ao carregar. */
  quoteTables: AdminQuoteTableSummary[] | null;
  /** `units.manage`: pode alterar; sem ela, só consulta. */
  canManage: boolean;
  onClose: () => void;
};

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      <FieldError id={`${htmlFor}-error`} message={error} />
    </div>
  );
}

function SwitchField({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border p-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

/** Opções da tabela de cotação: a padrão da banca (null) e as tabelas; sem a lista, só a atual. */
function quoteTableOptions(unit: AdminUserDetail, tables: AdminQuoteTableSummary[] | null) {
  const current =
    unit.quoteTable.own && unit.quoteTable.id ? { id: unit.quoteTable.id, name: unit.quoteTable.name } : null;
  if (!tables) return current ? [current] : [];
  const options = tables.map((table) => ({
    id: table.id,
    name: table.isDefault ? `${table.name} (padrão)` : table.name,
  }));
  return current && !options.some((option) => option.id === current.id) ? [current, ...options] : options;
}

function UnitSettingsBody({
  unit: initial,
  quoteTables,
  canManage,
}: {
  unit: AdminUserDetail;
  quoteTables: AdminQuoteTableSummary[] | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [unit, setUnit] = useState(initial);
  const [form, setForm] = useState<UnitSettingsForm>(() => unitSettingsForm(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const readOnly = !canManage || pending;
  const defaultTable = quoteTables?.find((table) => table.isDefault);

  const update = (patch: Partial<UnitSettingsForm>, fields: string[]) => {
    setForm((current) => ({ ...current, ...patch }));
    setErrors((current) => {
      const next = { ...current };
      for (const field of fields) delete next[field];
      return next;
    });
    setMessage(null);
  };

  const result = unitSettingsPatch(unit, form);
  const changed = !result.ok || Object.keys(result.patch).length > 0;

  const save = () => {
    if (!result.ok) {
      setErrors(result.fieldErrors);
      return;
    }
    if (Object.keys(result.patch).length === 0) return;
    const patch = result.patch;
    startTransition(async () => {
      const saved = await updateUnitSettingsAction(unit.id, patch);
      if (!saved.ok) {
        if (saved.code === 'SESSION_INVALID') router.replace(ADMIN_ROUTES.login);
        setErrors(saved.fieldErrors ?? {});
        setMessage(saved.message);
        return;
      }
      setUnit(saved.data);
      setForm(unitSettingsForm(saved.data));
      setErrors({});
      toast.success('Configurações da unidade salvas.');
      router.refresh();
    });
  };

  const err = (field: string) => errors[field];
  const describedBy = (id: string, field: string) => (errors[field] ? `${id}-error` : undefined);

  return (
    <>
      <div className="flex flex-col gap-5 px-4 pb-4">
        <dl aria-label="Uso de hoje" className="grid grid-cols-2 gap-4 rounded-md border bg-muted/40 p-3">
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">Apostado hoje</dt>
            <dd className="text-sm font-medium tabular-nums">{formatBrl(unit.todaySpentCents)}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">Limite diário</dt>
            <dd className="text-sm font-medium tabular-nums">{dailyLimitText(unit)}</dd>
          </div>
        </dl>

        {!canManage && (
          <Alert>
            <AlertDescription>Somente consulta: seu perfil não altera as configurações da unidade.</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Região (UF)" htmlFor="unit-region" error={err('region')}>
            <Select
              value={form.region ?? NONE}
              onValueChange={(value) => update({ region: isBrazilianUf(value) ? value : null }, ['region'])}
              disabled={readOnly}
            >
              <SelectTrigger id="unit-region" className="w-full" aria-invalid={!!err('region')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Não informada</SelectItem>
                {BRAZILIAN_UFS.map((uf) => (
                  <SelectItem key={uf} value={uf}>
                    {uf}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Comissão da unidade (%)"
            htmlFor="unit-commission"
            hint={`${UNIT_COMMISSION_HELP} Atual: ${formatCommission(unit.unitCommissionBps)}.`}
            error={err('unitCommissionBps')}
          >
            <Input
              id="unit-commission"
              inputMode="decimal"
              autoComplete="off"
              value={form.commission}
              disabled={readOnly}
              aria-invalid={!!err('unitCommissionBps')}
              aria-describedby={describedBy('unit-commission', 'unitCommissionBps')}
              onChange={(event) => update({ commission: event.target.value }, ['unitCommissionBps'])}
            />
          </Field>

          <Field
            label="Tabela de cotação"
            htmlFor="unit-quote-table"
            hint={quoteTables ? undefined : 'Sem a lista de tabelas: dá para manter a atual ou voltar à padrão.'}
            error={err('quoteTableId')}
          >
            <Select
              value={form.quoteTableId ?? BANK_DEFAULT}
              onValueChange={(value) =>
                update({ quoteTableId: value === BANK_DEFAULT ? null : value }, ['quoteTableId'])
              }
              disabled={readOnly}
            >
              <SelectTrigger id="unit-quote-table" className="w-full" aria-invalid={!!err('quoteTableId')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={BANK_DEFAULT}>
                  Padrão da banca{defaultTable ? ` (${defaultTable.name})` : ''}
                </SelectItem>
                {quoteTableOptions(unit, quoteTables).map((table) => (
                  <SelectItem key={table.id} value={table.id}>
                    {table.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <SwitchField
          id="unit-gift"
          label="Milhar Brinde"
          hint="A unidade ganha o brinde só se o Milhar Brinde da banca também estiver ligado."
          checked={form.giftMilharEnabled}
          disabled={readOnly}
          onChange={(giftMilharEnabled) => update({ giftMilharEnabled }, ['giftMilharEnabled'])}
        />
        <FieldError id="unit-gift-error" message={err('giftMilharEnabled')} />
        <SwitchField
          id="unit-retain"
          label="Reter prêmios"
          hint="Prêmios de Loterias e Fazendinha não saem em saque enquanto ligado."
          checked={form.retainPrizes}
          disabled={readOnly}
          onChange={(retainPrizes) => update({ retainPrizes }, ['retainPrizes'])}
        />
        <FieldError id="unit-retain-error" message={err('retainPrizes')} />
        <SwitchField
          id="unit-daily-limit"
          label="Limite diário de apostas"
          hint="Loterias + Fazendinha no dia (Brasília), sem os cancelados. Desligado, o valor fica guardado."
          checked={form.dailyLimitEnabled}
          disabled={readOnly}
          onChange={(dailyLimitEnabled) => update({ dailyLimitEnabled }, ['dailyLimitEnabled', 'dailyLimitCents'])}
        />
        <FieldError id="unit-daily-limit-error" message={err('dailyLimitEnabled')} />
        {form.dailyLimitEnabled && (
          <Field label="Valor do limite diário" htmlFor="unit-daily-limit-value" error={err('dailyLimitCents')}>
            <MoneyInput
              id="unit-daily-limit-value"
              value={form.dailyLimitCents}
              maxCents={MAX_DAILY_LIMIT_CENTS}
              disabled={readOnly}
              aria-invalid={!!err('dailyLimitCents')}
              aria-describedby={describedBy('unit-daily-limit-value', 'dailyLimitCents')}
              onValueChange={(dailyLimitCents) => update({ dailyLimitCents }, ['dailyLimitCents'])}
            />
          </Field>
        )}

        {message && (
          <Alert variant="destructive">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
      </div>
      {canManage && (
        <SheetFooter className="border-t">
          <Button type="button" onClick={save} disabled={!changed || pending}>
            {pending ? 'Salvando…' : 'Salvar alterações'}
          </Button>
        </SheetFooter>
      )}
    </>
  );
}

/** Configurações da unidade numa gaveta à direita; fechar volta a URL da lista. */
export function UnitSettingsSheet({ openId, detail, quoteTables, canManage, onClose }: UnitSettingsSheetProps) {
  const unit = detail?.status === 'ok' ? detail.unit : null;
  return (
    <Sheet open={openId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {!detail ? (
          <>
            <SheetHeader>
              <SheetTitle>Carregando unidade…</SheetTitle>
              <SheetDescription className="sr-only">Buscando os dados da unidade.</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-3 px-4" aria-hidden>
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-40 w-full" />
            </div>
          </>
        ) : detail.status === 'not-found' ? (
          <SheetHeader>
            <SheetTitle>Unidade não encontrada</SheetTitle>
            <SheetDescription>O apostador pode não ser desta banca.</SheetDescription>
          </SheetHeader>
        ) : detail.status === 'error' ? (
          <SheetHeader>
            <SheetTitle>Não foi possível carregar a unidade</SheetTitle>
            <SheetDescription>{detail.message}</SheetDescription>
          </SheetHeader>
        ) : (
          unit && (
            <>
              <SheetHeader className="pe-12">
                <SheetTitle className="text-lg">
                  <span className="text-muted-foreground tabular-nums">{unit.displayId}</span> |{' '}
                  {unit.name.toUpperCase()}
                </SheetTitle>
                <SheetDescription>Configurações da unidade</SheetDescription>
              </SheetHeader>
              {/* key: outra unidade (ou a mesma recarregada) começa o formulário do zero. */}
              <UnitSettingsBody key={unit.id} unit={unit} quoteTables={quoteTables} canManage={canManage} />
            </>
          )
        )}
      </SheetContent>
    </Sheet>
  );
}
