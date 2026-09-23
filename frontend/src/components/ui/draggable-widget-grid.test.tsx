import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { DraggableWidgetGrid, type GridWidget, type LayoutItem } from './draggable-widget-grid';

const WIDGETS: GridWidget[] = [
  { id: 'a', size: 'sm', label: 'Alpha', sizes: ['sm', 'wide'] },
  { id: 'b', size: 'sm', label: 'Bravo' },
  { id: 'c', size: 'sm', label: 'Charlie' },
];

function Harness({ onChange }: { onChange?: (items: LayoutItem[]) => void }) {
  const [items, setItems] = useState(WIDGETS);
  return (
    <DraggableWidgetGrid
      label="Dashboard"
      items={items}
      onItemsChange={(next) => {
        onChange?.(next);
        setItems(
          next.map((n) => {
            const base = WIDGETS.find((w) => w.id === n.id);
            return base === undefined ? { ...n, label: n.id } : { ...base, ...n };
          }),
        );
      }}
      renderItem={(item, ctx) => (
        <div>
          <h3>{item.label}</h3>
          {ctx.cycleSize !== undefined && (
            <button type="button" onClick={ctx.cycleSize}>
              Resize {item.label}
            </button>
          )}
        </div>
      )}
    />
  );
}

const names = () =>
  within(screen.getByRole('list', { name: 'Dashboard' }))
    .getAllByRole('listitem')
    .map((item) => item.getAttribute('aria-label'));

describe('DraggableWidgetGrid', () => {
  it('is a list of positioned items with a visible instruction', () => {
    render(<Harness />);
    const list = screen.getByRole('list', { name: 'Dashboard' });
    const listItems = within(list).getAllByRole('listitem');

    expect(listItems).toHaveLength(3);
    expect(listItems[0]).toHaveAttribute('aria-posinset', '1');
    expect(listItems[0]).toHaveAttribute('aria-setsize', '3');
    expect(screen.getByText(/Alt \+ arrow keys/)).toBeVisible();
    // The hint describes each card, so it is read on focus.
    const hintId = screen.getByText(/Alt \+ arrow keys/).id;
    expect(listItems[0]).toHaveAttribute('aria-describedby', hintId);
  });

  it('moves a focused card with Alt + arrow keys and announces it', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const alpha = screen.getByRole('listitem', { name: 'Alpha' });

    alpha.focus();
    fireEvent.keyDown(alpha, { key: 'ArrowDown', altKey: true });

    expect(names()).toEqual(['Bravo', 'Alpha', 'Charlie']);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Alpha moved to row 2/)).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'Alpha' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('listitem', { name: 'Alpha' }), {
      key: 'ArrowRight',
      altKey: true,
    });
    expect(names()).toEqual(['Bravo', 'Charlie', 'Alpha']);
  });

  it('says so rather than moving past either end', async () => {
    render(<Harness />);
    const alpha = screen.getByRole('listitem', { name: 'Alpha' });
    fireEvent.keyDown(alpha, { key: 'ArrowLeft', altKey: true });

    expect(names()).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(await screen.findByText('Alpha is already first.')).toBeInTheDocument();
  });

  it('leaves plain arrow keys, and keys inside a card, alone', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole('listitem', { name: 'Alpha' }), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Resize Alpha' }), {
      key: 'ArrowDown',
      altKey: true,
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('cycles a card through the sizes it allows', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Resize Alpha' }));
    expect(onChange).toHaveBeenCalledWith([
      { id: 'a', size: 'wide' },
      { id: 'b', size: 'sm' },
      { id: 'c', size: 'sm' },
    ]);
    expect(await screen.findByText('Alpha is now wide.')).toBeInTheDocument();
    // A card with one size offers no toggle.
    expect(screen.queryByRole('button', { name: 'Resize Bravo' })).not.toBeInTheDocument();
  });

  it('does not start a drag from a control inside a card', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const button = screen.getByRole('button', { name: 'Resize Alpha' });

    fireEvent.pointerDown(button, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 5 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 200, clientY: 200 });
    fireEvent.pointerUp(window, { pointerId: 1 });

    expect(screen.getByRole('listitem', { name: 'Alpha' })).not.toHaveAttribute('data-dragging');
    expect(onChange).not.toHaveBeenCalled();
  });
});
