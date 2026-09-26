'use client';

import type { UserStatus } from '@sysjb/contracts';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { setUserStatusAction } from '@/app/admin/actions';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import ConfirmDialog from './ConfirmDialog';

interface UserStatusActionsProps {
  userId: string;
  status: UserStatus;
}

/** Bloquear (usuário ativo) ou reativar (usuário bloqueado), sempre com confirmação. */
export default function UserStatusActions({ userId, status }: UserStatusActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const blocking = status === 'ACTIVE';

  function close() {
    setOpen(false);
    setError(null);
  }

  async function confirm() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await setUserStatusAction(userId, blocking ? 'BLOCKED' : 'ACTIVE');
      if (result.ok) {
        // O diálogo fecha junto com a atualização da página (sem piscar o status antigo).
        startTransition(() => {
          setOpen(false);
          router.refresh();
        });
      } else if (result.code === 'SESSION_INVALID') {
        router.replace(ADMIN_ROUTES.login);
      } else {
        setError(result.message);
      }
    } catch {
      setError('Não foi possível concluir. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  const Icon = blocking ? ShieldOff : ShieldCheck;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-semibold ${
          blocking ? 'bg-admin-danger/10 text-admin-danger' : 'bg-admin-success/10 text-admin-success'
        }`}
      >
        <Icon className="h-4 w-4" aria-hidden />
        {blocking ? 'Bloquear usuário' : 'Reativar usuário'}
      </button>

      <ConfirmDialog
        open={open}
        title={blocking ? 'Bloquear usuário' : 'Reativar usuário'}
        description={
          blocking
            ? 'O usuário será desconectado e não conseguirá entrar até ser reativado.'
            : 'O usuário voltará a poder entrar na plataforma.'
        }
        confirmLabel={blocking ? 'Bloquear' : 'Reativar'}
        tone={blocking ? 'danger' : 'primary'}
        pending={submitting || refreshing}
        error={error}
        onConfirm={confirm}
        onCancel={close}
      />
    </>
  );
}
