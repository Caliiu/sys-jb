'use client';

import { type FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, FileText, ArrowRight } from 'lucide-react';
import AuthLayout from '@/components/auth/AuthLayout';
import AuthInput from '@/components/auth/AuthInput';
import FormError from '@/components/auth/FormError';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { loginSchema } from '@/schemas/login.schema';
import { maskCpfInput } from '@/lib/masks';
import { ApiError } from '@/services/http';

// Visual do LoginPage original, com login só por CPF ("CPF ou Telefone" -> "CPF").
export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const [cpf, setCpf] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;

    setError(null);

    const parsed = loginSchema.safeParse({ cpf, password: senha });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(parsed.data);
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível entrar. Tente novamente.');
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <h1 className="sr-only">Entrar</h1>
      <form onSubmit={handleSubmit} noValidate>
        <div className="flex flex-col gap-3">
          <AuthInput
            type="text"
            inputMode="numeric"
            placeholder="CPF"
            autoComplete="username"
            value={cpf}
            onChange={(e) => setCpf(maskCpfInput(e.target.value))}
            icon={<FileText className="w-4 h-4" aria-hidden />}
          />
          <AuthInput
            type="password"
            placeholder="Senha"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            icon={<Lock className="w-4 h-4" aria-hidden />}
          />
        </div>

        <FormError message={error} />

        <div className="flex justify-end mt-2">
          <button
            type="button"
            onClick={() => toast.comingSoon('Recuperação de senha')}
            className="text-white text-[13px] font-medium"
          >
            Esqueceu sua senha?
          </button>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full h-13 py-3.5 mt-6 rounded-2xl bg-gradient-to-r from-brand-orange to-brand-orangeDark text-white font-bold text-[15px] shadow-card active:scale-[0.98] transition-transform disabled:opacity-60"
        >
          {isSubmitting ? 'Entrando...' : 'Entrar'}
        </button>

        <div className="flex items-center gap-3 my-5" aria-hidden>
          <span className="flex-1 h-px bg-white/30" />
          <span className="text-white/80 text-[12px] font-medium">ou</span>
          <span className="flex-1 h-px bg-white/30" />
        </div>

        <Link
          href="/cadastro"
          className="w-full py-3.5 rounded-2xl bg-white/15 text-white font-bold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
        >
          Cadastre-se
          <ArrowRight className="w-4 h-4" aria-hidden />
        </Link>
      </form>
    </AuthLayout>
  );
}
