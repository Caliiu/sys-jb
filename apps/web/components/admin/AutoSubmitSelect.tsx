'use client';

import type { SelectHTMLAttributes } from 'react';

/**
 * Select de filtro que envia o formulário ao mudar (os filtros vivem na URL, via GET). Campos vazios ficam fora
 * da URL: desabilitados só durante o envio (o formulário é lido na hora do requestSubmit).
 */
export default function AutoSubmitSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      onChange={(event) => {
        const form = event.currentTarget.form;
        if (!form) return;
        const empty = Array.from(form.elements).filter(
          (el): el is HTMLInputElement | HTMLSelectElement =>
            (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) && el.name !== '' && el.value === '',
        );
        for (const el of empty) el.disabled = true;
        form.requestSubmit();
        for (const el of empty) el.disabled = false;
      }}
    />
  );
}
