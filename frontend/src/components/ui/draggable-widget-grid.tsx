import { animate, motion, MotionConfig, useMotionValue, useReducedMotion } from 'motion/react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

import { cn } from '../../lib/cn';

import {
  computeLayout,
  moveItem,
  nearestSlot,
  orderKey,
  SIZE_LABEL,
  slotRect,
  spanFor,
  type Geometry,
  type LayoutItem,
  type Placement,
  type WidgetSize,
} from './widget-grid-layout';

export type { LayoutItem, WidgetSize } from './widget-grid-layout';

export interface GridWidget extends LayoutItem {
  /** Spoken in announcements and used as the list item's accessible name. */
  label: string;
  /** Sizes this widget can take, in the order a size toggle cycles through. */
  sizes?: readonly WidgetSize[];
}

export interface WidgetRenderContext {
  size: WidgetSize;
  /** Cells actually occupied at the current column count. */
  span: { w: number; h: number };
  columns: number;
  dragging: boolean;
  /** Present when the widget allows more than one size. */
  cycleSize?: () => void;
  nextSize?: WidgetSize;
}

export interface ColumnBreakpoint {
  /** Minimum container width in pixels. */
  minWidth: number;
  columns: number;
}

export interface DraggableWidgetGridProps {
  items: readonly GridWidget[];
  /** Called once per completed move or resize, never mid-drag. */
  onItemsChange: (items: LayoutItem[]) => void;
  renderItem: (item: GridWidget, context: WidgetRenderContext) => ReactNode;
  /** Names the list for assistive technology. */
  label: string;
  /** Pixels per grid row, or a function of the column count. */
  rowHeight?: number | ((columns: number) => number);
  gap?: number;
  /** Chosen by the grid's own width, not the viewport's. */
  breakpoints?: readonly ColumnBreakpoint[];
  className?: string;
}

/** Single column below 600px of grid width, so phones get one card per row. */
export const DEFAULT_BREAKPOINTS: readonly ColumnBreakpoint[] = [
  { minWidth: 0, columns: 1 },
  { minWidth: 600, columns: 2 },
  { minWidth: 900, columns: 4 },
];

/** Pointer travel before a mouse or pen press becomes a drag, so clicks still click. */
const DRAG_THRESHOLD_PX = 4;
/** How long a finger must rest before a touch press becomes a drag. */
const LONG_PRESS_MS = 420;
/** A finger moving this far during the press is scrolling, not picking up. */
const LONG_PRESS_TOLERANCE_PX = 10;
/** A new target must hold this long before the board reflows to it. */
const SETTLE_MS = 140;
/** Distance within which the pointer triggers auto-scroll of the page. */
const AUTOSCROLL_EDGE_PX = 56;

const INTERACTIVE =
  'button, a[href], input, select, textarea, label, [role="button"], [role="tab"], [contenteditable="true"], [data-no-drag]';

const LAYOUT_SPRING = { type: 'spring', stiffness: 520, damping: 42, mass: 0.9 } as const;

interface DragSession {
  id: string;
  pointerId: number;
  pointerType: string;
  element: HTMLElement;
  startClient: { x: number; y: number };
  lastClient: { x: number; y: number };
  /** Pointer position within the card when it was picked up. */
  grab: { x: number; y: number };
  phase: 'pressing' | 'dragging';
  longPress: ReturnType<typeof setTimeout> | null;
  original: LayoutItem[];
  pending: { key: string; order: LayoutItem[]; timer: ReturnType<typeof setTimeout> } | null;
  frame: number | null;
}

function columnsFor(width: number, breakpoints: readonly ColumnBreakpoint[]): number {
  let columns = 1;
  for (const bp of breakpoints) if (width >= bp.minWidth) columns = bp.columns;
  return Math.max(1, columns);
}

function scrollParent(element: HTMLElement | null): HTMLElement | null {
  let node = element?.parentElement ?? null;
  while (node !== null) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/** 1-based position in reading order. */
const positionIn = (id: string, placements: readonly Placement[]) =>
  placements.findIndex((p) => p.id === id) + 1;

const toLayoutItems = (items: readonly GridWidget[]): LayoutItem[] =>
  items.map(({ id, size }) => ({ id, size }));

/**
 * A dashboard grid whose cards can be rearranged and resized.
 *
 * - Mouse and pen drag at once (after a few pixels, so clicks still work);
 *   touch needs a long press, so the page still scrolls under a finger.
 * - Keyboard: focus a card, then Alt + arrow keys. Left and right step through
 *   reading order; up and down move a row.
 * - The board only reflows once a new target has held for a moment, and only
 *   when it is clearly nearer, so it does not thrash under a moving pointer.
 * - Layout motion goes through `motion`, under `MotionConfig reducedMotion="user"`,
 *   so anyone who asked for reduced motion sees cards jump rather than glide.
 */
export function DraggableWidgetGrid({
  items,
  onItemsChange,
  renderItem,
  label,
  rowHeight: rowHeightProp = 220,
  gap = 16,
  breakpoints = DEFAULT_BREAKPOINTS,
  className,
}: DraggableWidgetGridProps) {
  const hintId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef(new Map<string, HTMLElement>());
  const reducedMotion = useReducedMotion() === true;

  const [width, setWidth] = useState(0);
  const [working, setWorking] = useState<LayoutItem[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [refocusId, setRefocusId] = useState<string | null>(null);

  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    setWidth(container.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry !== undefined) setWidth(entry.contentRect.width);
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, []);

  const columns = columnsFor(width, breakpoints);
  const rowHeight = typeof rowHeightProp === 'function' ? rowHeightProp(columns) : rowHeightProp;
  const committed = useMemo(() => toLayoutItems(items), [items]);
  const order = working ?? committed;
  const layout = useMemo(() => computeLayout(order, columns), [order, columns]);
  const widgetsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const geometry = useMemo<Geometry>(
    () => ({
      columns,
      columnWidth: Math.max(0, (width - gap * (columns - 1)) / columns),
      rowHeight,
      gap,
    }),
    [columns, width, gap, rowHeight],
  );

  // Handlers run outside React's render cycle; they read the latest values here.
  const latest = useRef({ order, layout, geometry, widgetsById });
  latest.current = { order, layout, geometry, widgetsById };
  const session = useRef<DragSession | null>(null);

  const labelOf = useCallback(
    (id: string) => widgetsById.get(id)?.label ?? 'Widget',
    [widgetsById],
  );

  /** Keeps the floating card under the pointer, relative to its current slot. */
  const syncOffset = useCallback(() => {
    const s = session.current;
    const container = containerRef.current;
    if (s?.phase !== 'dragging' || container === null) return;
    const placement = latest.current.layout.byId.get(s.id);
    if (placement === undefined) return;

    const box = container.getBoundingClientRect();
    const slot = slotRect(placement, latest.current.geometry);
    dragX.set(s.lastClient.x - box.left - s.grab.x - slot.x);
    dragY.set(s.lastClient.y - box.top - s.grab.y - slot.y);
  }, [dragX, dragY]);

  // A reflow moves the dragged card's slot; re-anchor before the browser paints.
  useLayoutEffect(() => {
    syncOffset();
  }, [layout, syncOffset]);

  // Moving a focused node through the DOM can drop focus; put it back.
  useEffect(() => {
    if (refocusId === null) return;
    const element = itemRefs.current.get(refocusId);
    if (element !== undefined && document.activeElement !== element) element.focus();
    setRefocusId(null);
  }, [refocusId, layout]);

  const evaluate = useCallback(() => {
    const s = session.current;
    const container = containerRef.current;
    if (s?.phase !== 'dragging' || container === null) return;

    const { order: current, layout: currentLayout, geometry: g } = latest.current;
    const placement = currentLayout.byId.get(s.id);
    if (placement === undefined) return;

    const box = container.getBoundingClientRect();
    const rect = slotRect(placement, g);
    const centre = {
      x: s.lastClient.x - box.left - s.grab.x + rect.width / 2,
      y: s.lastClient.y - box.top - s.grab.y + rect.height / 2,
    };

    const { current: here, best } = nearestSlot(current, s.id, centre, g);
    // Hysteresis: a new slot must be clearly nearer, not a pixel nearer.
    const margin = Math.min(g.columnWidth, g.rowHeight) * 0.2;
    const key = orderKey(best.order);
    const wins = key !== orderKey(current) && best.distance < here.distance - margin;

    if (!wins) {
      if (s.pending !== null) clearTimeout(s.pending.timer);
      s.pending = null;
      return;
    }
    if (s.pending?.key === key) return;
    if (s.pending !== null) clearTimeout(s.pending.timer);

    s.pending = {
      key,
      order: best.order,
      timer: setTimeout(() => {
        if (session.current !== s || s.pending?.key !== key) return;
        s.pending = null;
        setWorking(best.order);
        const to = positionIn(s.id, computeLayout(best.order, g.columns).placements);
        setAnnouncement(
          `${labelOf(s.id)}, position ${String(to)} of ${String(best.order.length)}.`,
        );
      }, SETTLE_MS),
    };
  }, [labelOf]);

  const autoScroll = useCallback(() => {
    const s = session.current;
    if (s?.phase !== 'dragging') return;
    const scroller = scrollParent(containerRef.current);
    const top = scroller === null ? 0 : scroller.getBoundingClientRect().top;
    const bottom = scroller === null ? window.innerHeight : scroller.getBoundingClientRect().bottom;
    const y = s.lastClient.y;

    let delta = 0;
    if (y < top + AUTOSCROLL_EDGE_PX) delta = -Math.ceil((top + AUTOSCROLL_EDGE_PX - y) / 4);
    else if (y > bottom - AUTOSCROLL_EDGE_PX)
      delta = Math.ceil((y - (bottom - AUTOSCROLL_EDGE_PX)) / 4);

    if (delta !== 0) {
      if (scroller === null) window.scrollBy(0, delta);
      else scroller.scrollTop += delta;
      syncOffset();
      evaluate();
    }
    s.frame = requestAnimationFrame(autoScroll);
  }, [evaluate, syncOffset]);

  const endSession = useCallback(
    (outcome: 'drop' | 'cancel') => {
      const s = session.current;
      if (s === null) return;
      session.current = null;

      if (s.longPress !== null) clearTimeout(s.longPress);
      if (s.pending !== null) clearTimeout(s.pending.timer);
      if (s.frame !== null) cancelAnimationFrame(s.frame);
      document.body.style.removeProperty('user-select');
      document.body.style.removeProperty('-webkit-user-select');
      try {
        if (s.element.hasPointerCapture(s.pointerId)) s.element.releasePointerCapture(s.pointerId);
      } catch {
        // The element may already be gone.
      }

      if (s.phase !== 'dragging') return;

      const finalOrder = outcome === 'drop' ? latest.current.order : s.original;
      const changed = orderKey(finalOrder) !== orderKey(s.original);
      if (outcome === 'drop' && changed) onItemsChange(finalOrder);
      setWorking(null);
      setDraggingId(null);

      const finalLayout = computeLayout(finalOrder, latest.current.geometry.columns);
      const name = labelOf(s.id);
      setAnnouncement(
        outcome === 'cancel'
          ? `${name} returned to position ${String(positionIn(s.id, finalLayout.placements))}.`
          : `${name} dropped at position ${String(positionIn(s.id, finalLayout.placements))} of ${String(finalOrder.length)}.`,
      );

      // Glide from where it was let go into its slot.
      setSettlingId(s.id);
      if (reducedMotion) {
        dragX.set(0);
        dragY.set(0);
        setSettlingId(null);
      } else {
        void Promise.all([animate(dragX, 0, LAYOUT_SPRING), animate(dragY, 0, LAYOUT_SPRING)]).then(
          () => {
            setSettlingId((id) => (id === s.id ? null : id));
          },
        );
      }
      setRefocusId(s.id);
    },
    [dragX, dragY, labelOf, onItemsChange, reducedMotion],
  );

  const beginDrag = useCallback(
    (s: DragSession) => {
      const container = containerRef.current;
      const placement = latest.current.layout.byId.get(s.id);
      if (container === null || placement === undefined) return;

      const box = container.getBoundingClientRect();
      const slot = slotRect(placement, latest.current.geometry);
      s.phase = 'dragging';
      s.grab = {
        x: s.startClient.x - box.left - slot.x,
        y: s.startClient.y - box.top - slot.y,
      };
      s.original = [...latest.current.order];

      try {
        s.element.setPointerCapture(s.pointerId);
      } catch {
        // Pointer already released; the up handler will end the session.
      }
      document.body.style.setProperty('user-select', 'none');
      document.body.style.setProperty('-webkit-user-select', 'none');
      if (s.pointerType === 'touch' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(8);
      }

      dragX.set(0);
      dragY.set(0);
      setSettlingId(null);
      setWorking(s.original);
      setDraggingId(s.id);
      setAnnouncement(
        `Picked up ${labelOf(s.id)}, position ${String(positionIn(s.id, latest.current.layout.placements))} of ${String(s.original.length)}. Press Escape to cancel.`,
      );
      syncOffset();
      s.frame = requestAnimationFrame(autoScroll);
    },
    [autoScroll, dragX, dragY, labelOf, syncOffset],
  );

  // Window-level listeners, so a drag survives the pointer leaving the card.
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const s = session.current;
      if (s?.pointerId !== event.pointerId) return;
      s.lastClient = { x: event.clientX, y: event.clientY };
      const travelled = Math.hypot(
        event.clientX - s.startClient.x,
        event.clientY - s.startClient.y,
      );

      if (s.phase === 'pressing') {
        if (s.pointerType === 'touch') {
          // Moving before the long press completes is a scroll: let it be one.
          if (travelled > LONG_PRESS_TOLERANCE_PX) endSession('cancel');
        } else if (travelled > DRAG_THRESHOLD_PX) {
          beginDrag(s);
        }
        return;
      }

      event.preventDefault();
      syncOffset();
      evaluate();
    };
    const onUp = (event: PointerEvent) => {
      if (session.current?.pointerId === event.pointerId) endSession('drop');
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && session.current?.phase === 'dragging') {
        event.preventDefault();
        endSession('cancel');
      }
    };
    // Once a touch drag is live the page must not scroll underneath it. This
    // has to be a non-passive listener; React's synthetic touch handlers are
    // passive and cannot prevent the scroll.
    const onTouchMove = (event: TouchEvent) => {
      if (session.current?.phase === 'dragging') event.preventDefault();
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', onKey);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('touchmove', onTouchMove);
    };
  }, [beginDrag, endSession, evaluate, syncOffset]);

  // Never leave a drag half-finished if the grid unmounts mid-gesture.
  useEffect(
    () => () => {
      const s = session.current;
      if (s === null) return;
      if (s.longPress !== null) clearTimeout(s.longPress);
      if (s.pending !== null) clearTimeout(s.pending.timer);
      if (s.frame !== null) cancelAnimationFrame(s.frame);
      document.body.style.removeProperty('user-select');
      document.body.style.removeProperty('-webkit-user-select');
    },
    [],
  );

  const onPointerDown = (id: string) => (event: ReactPointerEvent<HTMLElement>) => {
    if (session.current !== null) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const target = event.target as HTMLElement;
    // Controls inside a card keep working; only the card's own surface drags.
    const interactive = target.closest(INTERACTIVE);
    if (interactive !== null && interactive !== event.currentTarget) return;

    const s: DragSession = {
      id,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      element: event.currentTarget,
      startClient: { x: event.clientX, y: event.clientY },
      lastClient: { x: event.clientX, y: event.clientY },
      grab: { x: 0, y: 0 },
      phase: 'pressing',
      longPress: null,
      original: [],
      pending: null,
      frame: null,
    };
    session.current = s;
    if (event.pointerType === 'touch') {
      s.longPress = setTimeout(() => {
        s.longPress = null;
        if (session.current === s) beginDrag(s);
      }, LONG_PRESS_MS);
    }
  };

  const commit = (next: LayoutItem[], id: string, message: string) => {
    onItemsChange(next);
    setAnnouncement(message);
    setRefocusId(id);
  };

  const onKeyDown = (id: string) => (event: ReactKeyboardEvent<HTMLElement>) => {
    // Keys pressed inside a card's own controls are theirs.
    if (event.target !== event.currentTarget || !event.altKey) return;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();

    const { layout: now, geometry: g } = latest.current;
    // Work from what is on screen, so "left" means the card to the left.
    const visual = now.placements.map((p) => ({
      id: p.id,
      size: widgetsById.get(p.id)?.size ?? 'sm',
    }));
    const index = visual.findIndex((item) => item.id === id);
    const placement = now.byId.get(id);
    if (index < 0 || placement === undefined) return;
    const total = visual.length;
    const name = labelOf(id);

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const step = event.key === 'ArrowLeft' ? -1 : 1;
      // Exact tiling can pull a card straight back; step further until it moves.
      for (let to = index + step; to >= 0 && to < total; to += step) {
        const next = moveItem(visual, index, to);
        const landed = positionIn(id, computeLayout(next, g.columns).placements) - 1;
        if (step < 0 ? landed < index : landed > index) {
          commit(next, id, `${name} moved to position ${String(landed + 1)} of ${String(total)}.`);
          return;
        }
      }
      setAnnouncement(`${name} is already ${step < 0 ? 'first' : 'last'}.`);
      return;
    }

    const down = event.key === 'ArrowDown';
    const rect = slotRect(placement, g);
    const target = {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2 + (down ? 1 : -1) * (g.rowHeight + g.gap),
    };
    const { best } = nearestSlot(visual, id, target, g, (p) =>
      down ? p.row > placement.row : p.row < placement.row,
    );
    const landed = best.layout.byId.get(id);
    if (landed === undefined || landed.row === placement.row) {
      setAnnouncement(`${name} is already in the ${down ? 'bottom' : 'top'} row.`);
      return;
    }
    commit(
      best.order,
      id,
      `${name} moved to row ${String(landed.row + 1)}, position ${String(positionIn(id, best.layout.placements))} of ${String(total)}.`,
    );
  };

  const cycleSizeOf = (widget: GridWidget) => {
    const sizes = widget.sizes ?? [];
    if (sizes.length < 2) return {};
    const next = sizes[(sizes.indexOf(widget.size) + 1) % sizes.length] ?? sizes[0] ?? widget.size;
    return {
      nextSize: next,
      cycleSize: () => {
        commit(
          committed.map((item) => (item.id === widget.id ? { ...item, size: next } : item)),
          widget.id,
          `${widget.label} is now ${SIZE_LABEL[next]}.`,
        );
      },
    };
  };

  const draggedPlacement = draggingId === null ? undefined : layout.byId.get(draggingId);
  const total = layout.placements.length;

  return (
    <MotionConfig reducedMotion="user">
      <div className={cn('flex flex-col gap-2', className)}>
        <p id={hintId} className="text-2xs text-text-subtle">
          Drag a card to rearrange it — on touch, press and hold first. From the keyboard, focus a
          card and use Alt + arrow keys. Escape cancels a drag.
        </p>

        <div
          ref={containerRef}
          role="list"
          aria-label={label}
          className="relative grid"
          style={{
            gridTemplateColumns: `repeat(${String(columns)}, minmax(0, 1fr))`,
            gridAutoRows: `${String(rowHeight)}px`,
            gap: `${String(gap)}px`,
          }}
        >
          {/* Where the card will land, drawn under it while it floats. */}
          {draggedPlacement !== undefined && (
            <div
              aria-hidden
              className="pointer-events-none rounded border border-dashed border-accent/60 bg-accent/5"
              style={{
                gridColumn: `${String(draggedPlacement.col + 1)} / span ${String(draggedPlacement.w)}`,
                gridRow: `${String(draggedPlacement.row + 1)} / span ${String(draggedPlacement.h)}`,
              }}
            />
          )}

          {layout.placements.map((placement, index) => {
            const widget = widgetsById.get(placement.id);
            if (widget === undefined) return null;
            const dragging = draggingId === widget.id;
            const floating = dragging || settlingId === widget.id;

            return (
              <motion.div
                key={widget.id}
                ref={(element: HTMLDivElement | null) => {
                  if (element === null) itemRefs.current.delete(widget.id);
                  else itemRefs.current.set(widget.id, element);
                }}
                role="listitem"
                aria-label={widget.label}
                aria-posinset={index + 1}
                aria-setsize={total}
                aria-roledescription="movable card"
                aria-describedby={hintId}
                tabIndex={0}
                data-widget-id={widget.id}
                data-dragging={dragging || undefined}
                // The floating card follows the pointer, not the layout spring.
                layout={!floating}
                transition={{ layout: LAYOUT_SPRING }}
                animate={{ scale: dragging ? 1.015 : 1 }}
                onPointerDown={onPointerDown(widget.id)}
                onKeyDown={onKeyDown(widget.id)}
                onContextMenu={(event) => {
                  // A long press on touch opens the context menu otherwise.
                  if (session.current !== null) event.preventDefault();
                }}
                className={cn(
                  'relative min-w-0 rounded outline-offset-2',
                  '[-webkit-touch-callout:none]',
                  dragging ? 'cursor-grabbing shadow-lg' : 'cursor-grab',
                  floating && 'z-dropdown',
                )}
                style={{
                  gridColumn: `${String(placement.col + 1)} / span ${String(placement.w)}`,
                  gridRow: `${String(placement.row + 1)} / span ${String(placement.h)}`,
                  ...(floating ? { x: dragX, y: dragY } : {}),
                }}
              >
                {renderItem(widget, {
                  size: widget.size,
                  span: spanFor(widget.size, columns),
                  columns,
                  dragging,
                  ...cycleSizeOf(widget),
                })}
              </motion.div>
            );
          })}
        </div>

        <p aria-live="polite" aria-atomic="true" className="sr-only">
          {announcement}
        </p>
      </div>
    </MotionConfig>
  );
}
