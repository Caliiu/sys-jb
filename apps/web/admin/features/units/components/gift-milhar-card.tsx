'use client';

import {
  type AdminGiftMilharSettings,
  findLotteryPlacement,
  GIFT_MILHAR_LABEL,
  GIFT_MILHAR_LIMITS,
  GIFT_MILHAR_PLACEMENTS,
} from '@sysjb/contracts';
import { Gift } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { saveGiftMilharSettingsAction } from '@/app/admin/actions';
import { MoneyInput } from '@/admin/components/money-input';
import { Alert, AlertDescription } from '@/admin/components/ui/alert';
import { Badge } from '@/admin/components/ui/badge';
import { Button } from '@/admin/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/admin/components/ui/card';
import { Label } from '@/admin/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/admin/components/ui/select';
import { Switch } from '@/admin/components/ui/switch';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { formatBrl } from '@/lib/currency';
import { FieldError } from '@/admin/components/field-error';

/** Configuração da banca carregada pelo servidor, ou a falha ao carregar. */
export type GiftMilharState =
  { status: 'ok'; settings: AdminGiftMilharSettings } | { status: 'error'; message: string };

type GiftMilharCardProps = {
  state: GiftMilharState;
  /** `quotes.manage`: pode alterar; sem ela, só consulta. */
  canManage: boolean;
};

export const placementLabel = (id: string) => findLotteryPlacement(id)?.label ?? id;

function validate(form: AdminGiftMilharSettings): Record<string, string> {
  const errors: Record<string, string> = {};
  if (form.minPuleCents < 1 || form.minPuleCents > GIFT_MILHAR_LIMITS.maxMinPuleCents) {
    errors.minPuleCents = `Entre R$ 0,01 e ${formatBrl(GIFT_MILHAR_LIMITS.maxMinPuleCents)}.`;
  }
  if (form.stakeCents < 1 || form.stakeCents > GIFT_MILHAR_LIMITS.maxStakeCents) {
    errors.stakeCents = `Entre R$ 0,01 e ${formatBrl(GIFT_MILHAR_LIMITS.maxStakeCents)}.`;
  }
  return errors;
}

/** Milhar Brinde da banca: regra geral (interruptor, mínimo do pule, valor e colocação do brinde). */
export function GiftMilharCard({ state, canManage }: GiftMilharCardProps) {
  const router = useRouter();
  const [saved, setSaved] = useState(state.status === 'ok' ? state.settings : null);
  const [form, setForm] = useState(saved);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const header = (
    <CardHeader>
      <CardTitle className="flex flex-wrap items-center gap-2">
        <Gift className="size-4" /> Milhar Brinde da banca
        {saved && (
          <Badge variant={saved.enabled ? 'default' : 'outline'}>{saved.enabled ? 'Ligado' : 'Desligado'}</Badge>
        )}
      </CardTitle>
      <CardDescription>
        Cada pule de Loterias que chega ao mínimo ganha uma aposta grátis de milhar ({GIFT_MILHAR_LABEL}), com número
        sorteado pelo sistema e prêmio pela cotação da milhar da tabela da unidade. O brinde só sai quando está ligado
        aqui na banca <strong>e</strong> na unidade (coluna Milhar Brinde da lista).
      </CardDescription>
    </CardHeader>
  );

  if (state.status === 'error' || !form || !saved) {
    return (
      <Card aria-label="Milhar Brinde da banca">
        {header}
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>
              {state.status === 'error' ? state.message : 'Configuração indisponível.'}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const readOnly = !canManage || pending;
  const changed =
    form.enabled !== saved.enabled ||
    form.minPuleCents !== saved.minPuleCents ||
    form.stakeCents !== saved.stakeCents ||
    form.placement !== saved.placement;
  const update = (patch: Partial<AdminGiftMilharSettings>) => {
    setForm({ ...form, ...patch });
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch)) delete next[key];
      return next;
    });
    setMessage(null);
  };

  const save = () => {
    const invalid = validate(form);
    setErrors(invalid);
    if (Object.keys(invalid).length > 0) return;
    startTransition(async () => {
      const result = await saveGiftMilharSettingsAction(form);
      if (!result.ok) {
        if (result.code === 'SESSION_INVALID') router.replace(ADMIN_ROUTES.login);
        setErrors(result.fieldErrors ?? {});
        setMessage(result.message);
        return;
      }
      setSaved(result.data);
      setForm(result.data);
      toast.success('Milhar Brinde salvo.');
      router.refresh();
    });
  };

  return (
    <Card aria-label="Milhar Brinde da banca">
      {header}
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="gift-enabled">Brinde na banca</Label>
          <div className="flex h-9 items-center gap-2">
            <Switch
              id="gift-enabled"
              checked={form.enabled}
              disabled={readOnly}
              onCheckedChange={(enabled) => update({ enabled })}
            />
            <span className="text-sm text-muted-foreground">{form.enabled ? 'Ligado' : 'Desligado'}</span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="gift-min-pule">Mínimo do pule</Label>
          <MoneyInput
            id="gift-min-pule"
            value={form.minPuleCents}
            maxCents={GIFT_MILHAR_LIMITS.maxMinPuleCents}
            onValueChange={(cents) => update({ minPuleCents: cents ?? 0 })}
            disabled={readOnly}
            aria-invalid={!!errors.minPuleCents}
            aria-describedby={errors.minPuleCents ? 'gift-min-pule-error' : undefined}
          />
          <FieldError id="gift-min-pule-error" message={errors.minPuleCents} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="gift-stake">Valor do brinde</Label>
          <MoneyInput
            id="gift-stake"
            value={form.stakeCents}
            maxCents={GIFT_MILHAR_LIMITS.maxStakeCents}
            onValueChange={(cents) => update({ stakeCents: cents ?? 0 })}
            disabled={readOnly}
            aria-invalid={!!errors.stakeCents}
            aria-describedby={errors.stakeCents ? 'gift-stake-error' : undefined}
          />
          <FieldError id="gift-stake-error" message={errors.stakeCents} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="gift-placement">Colocação</Label>
          <Select value={form.placement} onValueChange={(placement) => update({ placement })} disabled={readOnly}>
            <SelectTrigger id="gift-placement" className="w-full" aria-invalid={!!errors.placement}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GIFT_MILHAR_PLACEMENTS.map((id) => (
                <SelectItem key={id} value={id}>
                  {placementLabel(id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError id="gift-placement-error" message={errors.placement} />
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          O brinde não é cobrado, não gera comissão e não conta no limite diário nem nas vendas. Fazendinha não tem
          brinde.
        </p>
        {canManage ? (
          <Button type="button" onClick={save} disabled={!changed || pending}>
            {pending ? 'Salvando…' : 'Salvar Milhar Brinde'}
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Somente consulta: seu perfil não altera o brinde.</span>
        )}
      </CardFooter>
      {message && (
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        </CardContent>
      )}
    </Card>
  );
}
