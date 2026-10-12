import Image from 'next/image';
import AdminLoginForm from '@/components/admin/AdminLoginForm';

/**
 * Login do painel administrativo. Único para todas as bancas: a banca do operador é descoberta no
 * login (não há o que escolher aqui), então a tela leva a marca da plataforma, não a de uma banca.
 * Componente de servidor.
 */
export default function AdminLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-admin-bg px-4 font-body text-admin-text">
      <main className="w-full max-w-sm overflow-hidden rounded-xl bg-admin-surface shadow-admin">
        {/* A logo é clara e sem fundo: fica sobre uma faixa escura (a cor de texto do painel). */}
        <div className="flex items-center justify-center bg-admin-accent px-6 py-6">
          <Image
            src="/brands/fenix-igaming.webp"
            alt="Fenix iGaming"
            width={640}
            height={101}
            priority
            className="h-auto w-full max-w-[260px]"
          />
        </div>
        <div className="p-6">
          <div className="mb-6 text-center">
            <h1 className="font-display text-[15px]">PAINEL ADMINISTRATIVO</h1>
            <p className="mt-1 text-[12.5px] text-admin-muted">Acesso dos operadores</p>
          </div>
          <AdminLoginForm />
        </div>
      </main>
    </div>
  );
}
