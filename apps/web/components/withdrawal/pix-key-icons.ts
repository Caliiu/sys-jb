import { KeyRound, Mail, Smartphone, User } from 'lucide-react';
import type { PixKeyType } from '@/lib/pix-key';

/** Ícone de cada tipo de chave Pix (seletor de tipo e chaves recentes). */
export const PIX_KEY_ICONS: Record<PixKeyType, typeof User> = {
  cpf: User,
  email: Mail,
  phone: Smartphone,
  random: KeyRound,
};
