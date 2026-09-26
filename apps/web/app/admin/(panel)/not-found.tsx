import AdminMessage from '@/components/admin/AdminMessage';

export default function NotFound() {
  return (
    <AdminMessage title="Usuário não encontrado" backToUsers>
      Este usuário não existe nesta banca.
    </AdminMessage>
  );
}
