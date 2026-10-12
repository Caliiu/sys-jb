import { Main } from '@/admin/components/layout/main';
import { NotFoundError } from '@/admin/features/errors/not-found-error';

export default function PanelNotFound() {
  return (
    <Main>
      <NotFoundError />
    </Main>
  );
}
