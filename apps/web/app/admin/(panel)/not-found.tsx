import AdminMessage from '@/components/admin/AdminMessage';

/** notFound() dentro do painel (ex.: apostador de outra banca ou inexistente): aviso dentro do próprio painel. */
export default function NotFound() {
  return (
    <AdminMessage title="Não encontrado" backToUsers>
      O que você procurou não existe nesta banca.
    </AdminMessage>
  );
}
