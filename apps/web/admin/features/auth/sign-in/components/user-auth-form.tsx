'use client';

import { useState } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { Loader2, LogIn } from 'lucide-react';
import { adminLoginAction } from '@/app/admin/actions';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { cn } from '@/admin/lib/utils';
import { Button } from '@/admin/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/admin/components/ui/form';
import { Input } from '@/admin/components/ui/input';
import { PasswordInput } from '@/admin/components/password-input';

const formSchema = z.object({
  email: z.email({
    error: (iss) => (iss.input === '' ? 'Informe o e-mail.' : 'E-mail inválido.'),
  }),
  password: z.string().min(1, 'Informe a senha.'),
});

export function UserAuthForm({ className, ...props }: React.HTMLAttributes<HTMLFormElement>) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  async function onSubmit(data: z.infer<typeof formSchema>) {
    setIsLoading(true);
    setError(null);
    try {
      // O token vai só para o cookie HttpOnly (server action); o navegador não o recebe.
      const result = await adminLoginAction(data);
      if (result.ok) {
        router.replace(ADMIN_ROUTES.home);
        router.refresh();
        return;
      }
      setError(result.message);
    } catch {
      setError('Não foi possível entrar. Tente novamente.');
    }
    setIsLoading(false);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className={cn('grid gap-3', className)} {...props}>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>E-mail</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="username" placeholder="nome@exemplo.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Senha</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="current-password" placeholder="********" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
        <Button className="mt-2" disabled={isLoading}>
          {isLoading ? <Loader2 className="animate-spin" /> : <LogIn />}
          Entrar
        </Button>
      </form>
    </Form>
  );
}
