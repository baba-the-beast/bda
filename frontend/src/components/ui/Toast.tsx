import * as RadixToast from '@radix-ui/react-toast';
import { X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { cn } from '../../lib/cn';
import { humanizeEnum } from '../../lib/format';

import { type Status, StatusPill } from './Status';

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  status: Status;
}

interface ToastContextValue {
  /** Queue a toast. Returns its id so a caller can dismiss it early. */
  toast: (message: Omit<ToastMessage, 'id'>) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (context === null) {
    throw new Error('useToast must be used inside a <ToastProvider>');
  }
  return context;
}

let sequence = 0;

/**
 * Global toaster for mutation results.
 *
 * Ids come from a counter rather than Math.random, which the lint config bans
 * in production code (docs/FRONTEND_AUDIT.md §3.2).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const dismiss = useCallback((id: string) => {
    setMessages((current) => current.filter((m) => m.id !== id));
  }, []);

  const toast = useCallback((message: Omit<ToastMessage, 'id'>) => {
    sequence += 1;
    const id = `toast-${String(sequence)}`;
    setMessages((current) => [...current, { ...message, id }]);
    return id;
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      <RadixToast.Provider swipeDirection="right" duration={6000}>
        {children}

        {messages.map((message) => (
          <RadixToast.Root
            key={message.id}
            onOpenChange={(open) => {
              if (!open) dismiss(message.id);
            }}
            className={cn(
              'flex items-start gap-3 rounded border border-border bg-surface-raised p-3 shadow-lg',
              'animate-slide-up',
            )}
          >
            <div className="flex flex-col gap-1">
              <RadixToast.Title className="flex items-center gap-2 text-sm font-medium text-text">
                <StatusPill status={message.status}>{humanizeEnum(message.status)}</StatusPill>
                {message.title}
              </RadixToast.Title>
              {message.description !== undefined && (
                <RadixToast.Description className="text-xs text-text-muted">
                  {message.description}
                </RadixToast.Description>
              )}
            </div>
            <RadixToast.Close
              aria-label="Dismiss notification"
              className="ml-auto rounded-sm p-0.5 text-text-subtle transition-colors duration-base hover:text-text"
            >
              <X aria-hidden className="size-3.5" />
            </RadixToast.Close>
          </RadixToast.Root>
        ))}

        <RadixToast.Viewport className="fixed bottom-0 right-0 z-toast flex w-[min(24rem,100vw)] flex-col gap-2 p-4" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}
