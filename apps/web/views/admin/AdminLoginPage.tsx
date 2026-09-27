import { ShieldCheck } from 'lucide-react';
import AdminLoginForm from '@/components/admin/AdminLoginForm';

/**
 * Login do painel administrativo. Único para todas as bancas: a banca do operador é descoberta no
 * login (não há o que escolher aqui), então a tela é neutra. Componente de servidor.
 */
export default function AdminLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-admin-bg px-4 font-body text-admin-text">
      <main className="w-full max-w-sm rounded-xl bg-admin-surface p-6 shadow-admin">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-admin-accent/10">
            <ShieldCheck className="h-6 w-6 text-admin-accent" aria-hidden />
          </div>
          <h1 className="font-display text-[15px]">PAINEL ADMINISTRATIVO</h1>
          <p className="mt-1 text-[12.5px] text-admin-muted">Acesso dos operadores</p>
        </div>
        <AdminLoginForm />
      </main>
    </div>
  );
}
