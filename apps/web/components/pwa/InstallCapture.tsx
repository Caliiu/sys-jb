'use client';

// Só o efeito colateral da importação importa: registra os ouvintes de instalação assim que a página carrega.
import '@/lib/pwa-install';

/** Colocado no layout raiz para não perder o aviso de "pode instalar", que o navegador dá uma vez só. */
export default function InstallCapture() {
  return null;
}
