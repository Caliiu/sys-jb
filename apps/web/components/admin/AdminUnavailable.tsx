import Notice from '../ui/Notice';

/** O painel só responde no host dele (ver proxy.ts); em qualquer outro caso, um aviso simples. */
export function AdminUnavailable({ message }: { message: string }) {
  return (
    <Notice title="Painel administrativo indisponível">
      <p>{message}</p>
    </Notice>
  );
}
