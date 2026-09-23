import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Always supply one: Radix warns, and screen readers need the context. */
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /**
   * `center` is the modal; `left` is a full-height drawer from the leading
   * edge, used for navigation on narrow screens.
   */
  side?: 'center' | 'left';
  className?: string;
}

/**
 * Modal dialog on Radix: focus trap, restore-on-close, escape handling and
 * `aria-modal` come from the primitive.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  side = 'center',
  className,
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-overlay bg-overlay/80 animate-fade-in" />
        <RadixDialog.Content
          className={cn(
            side === 'center'
              ? [
                  'fixed left-1/2 top-1/2 z-dialog w-[min(32rem,calc(100vw-2rem))]',
                  '-translate-x-1/2 -translate-y-1/2 animate-slide-up',
                  'rounded border border-border bg-surface shadow-lg',
                ]
              : [
                  'fixed inset-y-0 left-0 z-dialog flex w-72 max-w-[85vw] flex-col',
                  'animate-fade-in border-r border-border bg-surface shadow-lg',
                ],
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <RadixDialog.Title className="text-sm font-semibold text-text">
                {title}
              </RadixDialog.Title>
              {description !== undefined && (
                <RadixDialog.Description className="text-xs text-text-muted">
                  {description}
                </RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close
              aria-label="Close dialog"
              className="rounded-sm p-1 text-text-subtle transition-colors duration-base hover:bg-surface-raised hover:text-text"
            >
              <X aria-hidden className="size-4" />
            </RadixDialog.Close>
          </div>

          <div
            className={cn(
              'text-sm text-text',
              side === 'center' ? 'px-4 py-4' : 'min-h-0 flex-1 overflow-y-auto',
            )}
          >
            {children}
          </div>

          {footer !== undefined && (
            <div className="flex justify-end gap-2 border-t border-border px-4 py-3">{footer}</div>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
