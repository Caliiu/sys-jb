'use client';

import type { FormHTMLAttributes } from 'react';

/**
 * Formulário GET dos filtros (os filtros vivem na URL: link compartilhável, voltar funciona). Campos vazios ficam
 * fora da URL: desabilitados só durante o envio (a lista de campos é montada depois do evento submit).
 */
export default function FilterForm(props: Omit<FormHTMLAttributes<HTMLFormElement>, 'method' | 'onSubmit'>) {
  return (
    <form
      {...props}
      method="get"
      onSubmit={(event) => {
        const empty = Array.from(event.currentTarget.elements).filter(
          (el): el is HTMLInputElement | HTMLSelectElement =>
            (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) && el.name !== '' && el.value === '',
        );
        for (const el of empty) el.disabled = true;
        // Volta ao normal depois do envio (se a página voltar do cache do navegador, os campos seguem editáveis).
        window.setTimeout(() => empty.forEach((el) => (el.disabled = false)), 0);
      }}
    />
  );
}
