import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import BottomSheet from './BottomSheet';

function Sheet({ onClose = vi.fn(), dismissible = true }: { onClose?: () => void; dismissible?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <BottomSheet
      open={open}
      dismissible={dismissible}
      titleId="t"
      onClose={() => {
        onClose();
        setOpen(false);
      }}
    >
      <h2 id="t">Detalhes</h2>
    </BottomSheet>
  );
}

const handle = () => document.querySelector<HTMLElement>('[data-sheet-handle]')!;
const panel = () => screen.getByRole('dialog', { name: 'Detalhes' });

/** Arrasta a barrinha `dy` px para baixo em `ms` milissegundos (relógio controlado). */
function dragHandle(dy: number, ms = 500) {
  const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
  fireEvent.pointerDown(handle(), { pointerId: 1, clientY: 100 });
  fireEvent.pointerMove(handle(), { pointerId: 1, clientY: 100 + dy });
  clock.mockReturnValue(1000 + ms);
  fireEvent.pointerUp(handle(), { pointerId: 1, clientY: 100 + dy });
  clock.mockRestore();
}

describe('BottomSheet: arrastar para fechar', () => {
  it('arrastar a barrinha para baixo além do limite fecha a folha', async () => {
    const onClose = vi.fn();
    render(<Sheet onClose={onClose} />);
    fireEvent.pointerDown(handle(), { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(handle(), { pointerId: 1, clientY: 180 });
    // A folha acompanha o dedo, sem animação enquanto arrasta.
    expect(panel().style.transform).toBe('translateY(80px)');
    expect(panel().style.transition).toBe('none');
    fireEvent.pointerUp(handle(), { pointerId: 1, clientY: 300 });
    expect(panel().style.transform).toBe('translateY(100%)');
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('arrasto curto e lento volta para o lugar', async () => {
    const onClose = vi.fn();
    render(<Sheet onClose={onClose} />);
    dragHandle(40, 800);
    expect(panel().style.transform).toBe('translateY(0px)');
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('puxão rápido para baixo fecha mesmo sendo curto', async () => {
    const onClose = vi.fn();
    render(<Sheet onClose={onClose} />);
    dragHandle(60, 50);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it('puxar para cima não mexe na folha', () => {
    render(<Sheet />);
    fireEvent.pointerDown(handle(), { pointerId: 1, clientY: 300 });
    fireEvent.pointerMove(handle(), { pointerId: 1, clientY: 100 });
    expect(panel().style.transform).toBe('translateY(0px)');
  });

  it('não fecha arrastando quando não pode ser dispensada (ex.: envio em andamento)', async () => {
    const onClose = vi.fn();
    render(<Sheet onClose={onClose} dismissible={false} />);
    dragHandle(400, 100);
    expect(panel().style.transform).toBe('translateY(0px)');
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(onClose).not.toHaveBeenCalled();
  });
});
