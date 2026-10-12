import { ServerOff } from 'lucide-react';

/** O painel só responde no host dele (ver proxy.ts) e com a API no ar; nos outros casos, este aviso. */
export function Unavailable({ message }: { message: string }) {
  return (
    <div className="h-svh">
      <div className="m-auto flex h-full w-full flex-col items-center justify-center gap-2 px-4">
        <ServerOff size={72} aria-hidden />
        <h1 className="text-2xl leading-tight font-bold">Painel administrativo indisponível</h1>
        <p className="text-center text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
