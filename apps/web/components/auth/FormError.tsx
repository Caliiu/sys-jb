/** Mensagem de erro dos formulários de autenticação, anunciada a leitores de tela. */
export default function FormError({ message, className = 'mt-3' }: { message: string | null; className?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className={`text-white text-[12.5px] font-semibold bg-black/25 rounded-lg px-3 py-2 ${className}`}>
      {message}
    </p>
  );
}
