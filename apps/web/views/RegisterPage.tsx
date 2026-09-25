'use client';

import { type FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { User, Phone, FileText, Calendar, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import AuthLayout from '@/components/auth/AuthLayout';
import AuthInput from '@/components/auth/AuthInput';
import FormError from '@/components/auth/FormError';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { registerSchema } from '@/schemas/register.schema';
import { birthDateBrToIso, maskBirthDateInput, maskCpfInput, maskPhoneInput } from '@/lib/masks';
import { ApiError } from '@/services/http';

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cpf, setCpf] = useState('');
  const [nascimento, setNascimento] = useState('');
  const [senha, setSenha] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;

    setError(null);

    const parsed = registerSchema.safeParse({
      name: nome,
      cpf,
      phone: telefone,
      birthDate: birthDateBrToIso(nascimento),
      password: senha,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    setIsSubmitting(true);
    try {
      await register(parsed.data);
      toast.show('Cadastro concluído. Entre com seu CPF e senha.');
      router.replace('/login');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível concluir o cadastro.');
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-white font-display text-[22px] leading-none">Cadastre-se</h1>
      <p className="text-white/85 text-[13.5px] mt-2 mb-5">Preencha seus dados de cadastro</p>

      <form onSubmit={handleSubmit} noValidate>
        <div className="flex flex-col gap-3">
          <AuthInput
            type="text"
            placeholder="Nome completo"
            autoComplete="name"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            icon={<User className="w-4 h-4" aria-hidden />}
          />
          <AuthInput
            type="tel"
            placeholder="Telefone"
            autoComplete="tel-national"
            value={telefone}
            onChange={(e) => setTelefone(maskPhoneInput(e.target.value))}
            icon={<Phone className="w-4 h-4" aria-hidden />}
          />
          <AuthInput
            type="text"
            inputMode="numeric"
            placeholder="CPF"
            autoComplete="off"
            value={cpf}
            onChange={(e) => setCpf(maskCpfInput(e.target.value))}
            icon={<FileText className="w-4 h-4" aria-hidden />}
          />
          <AuthInput
            type="text"
            inputMode="numeric"
            placeholder="Data de nascimento (DD/MM/AAAA)"
            autoComplete="bday"
            value={nascimento}
            onChange={(e) => setNascimento(maskBirthDateInput(e.target.value))}
            icon={<Calendar className="w-4 h-4" aria-hidden />}
          />
          <AuthInput
            type={showSenha ? 'text' : 'password'}
            placeholder="Senha"
            autoComplete="new-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            icon={
              <button
                type="button"
                onClick={() => setShowSenha((v) => !v)}
                className="text-brand-orange"
                aria-label={showSenha ? 'Ocultar senha' : 'Mostrar senha'}
                aria-pressed={showSenha}
              >
                {showSenha ? <EyeOff className="w-4 h-4" aria-hidden /> : <Eye className="w-4 h-4" aria-hidden />}
              </button>
            }
          />
        </div>

        <FormError message={error} className="mt-4" />

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3.5 mt-6 rounded-2xl font-bold text-[15px] transition-all bg-brand-orange text-white shadow-card active:scale-[0.98] disabled:opacity-60"
        >
          {isSubmitting ? 'Enviando...' : 'Avançar'}
        </button>

        <Link
          href="/login"
          className="w-full flex items-center justify-center gap-2 text-white font-semibold text-[14px] mt-5"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden />
          Voltar
        </Link>
      </form>
    </AuthLayout>
  );
}
