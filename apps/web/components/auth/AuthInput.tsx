import type { InputHTMLAttributes, ReactNode } from 'react';

interface AuthInputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon: ReactNode;
}

/** Campo das telas de autenticação (visual original). Sem label visível: o placeholder vira o nome acessível. */
export default function AuthInput({ icon, className, ...props }: AuthInputProps) {
  return (
    <div className="relative">
      <input
        {...props}
        aria-label={props['aria-label'] ?? props.placeholder}
        className={`w-full h-14 rounded-2xl bg-white pl-4 pr-11 text-[14px] text-gray-800 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-brand-orange ${
          className ?? ''
        }`}
      />
      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">{icon}</span>
    </div>
  );
}
