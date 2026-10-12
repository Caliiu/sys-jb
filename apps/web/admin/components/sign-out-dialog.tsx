'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { adminLogoutAction } from '@/app/admin/actions';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { ConfirmDialog } from '@/admin/components/confirm-dialog';

interface SignOutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SignOutDialog({ open, onOpenChange }: SignOutDialogProps) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  const handleSignOut = async () => {
    if (leaving) return;
    setLeaving(true);
    try {
      // Encerra a sessão na API e apaga o cookie HttpOnly (o navegador não tem o token).
      await adminLogoutAction();
      router.replace(ADMIN_ROUTES.login);
      router.refresh();
    } catch {
      // Sem confirmação do servidor a sessão pode continuar válida: fica na tela e avisa.
      toast.error('Não foi possível sair. Tente novamente.');
      setLeaving(false);
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Sair"
      desc="Tem certeza que deseja sair? Para voltar ao painel, será preciso entrar de novo."
      confirmText="Sair"
      cancelBtnText="Cancelar"
      destructive
      isLoading={leaving}
      handleConfirm={handleSignOut}
      className="sm:max-w-sm"
    />
  );
}
