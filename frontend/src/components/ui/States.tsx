import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

import { Button } from './Button';

export interface SkeletonProps {
  className?: string;
  /** Announced to screen readers while content is pending. */
  label?: string;
}

export function Skeleton({ className, label = 'Loading' }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn('relative overflow-hidden rounded bg-surface-raised', className)}
    >
      <span className="sr-only">{label}</span>
      <span
        aria-hidden
        className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent"
      />
    </div>
  );
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          label={i === 0 ? 'Loading' : ''}
          className={cn('h-3', i === lines - 1 && 'w-2/3')}
        />
      ))}
    </div>
  );
}

export interface EmptyStateProps {
  title: string;
  description?: string | undefined;
  action?: ReactNode | undefined;
  icon?: ReactNode | undefined;
  className?: string | undefined;
}

/** Nothing to show, and that is a correct outcome rather than a failure. */
export function EmptyState({ title, description, action, icon, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-4 py-8 text-center', className)}>
      {icon ?? <Inbox aria-hidden className="size-6 text-text-subtle" />}
      <p className="text-sm font-medium text-text">{title}</p>
      {description !== undefined && (
        <p className="max-w-sm text-xs text-text-muted">{description}</p>
      )}
      {action}
    </div>
  );
}

export interface ErrorStateProps {
  title?: string | undefined;
  message: string;
  /** Surfaced so a user can quote it and the line can be found in the logs. */
  correlationId?: string | null;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = 'Could not load this panel',
  message,
  correlationId,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center gap-2 px-4 py-8 text-center', className)}
    >
      <AlertTriangle aria-hidden className="size-6 text-critical" />
      <p className="text-sm font-medium text-text">{title}</p>
      <p className="max-w-md text-xs text-text-muted">{message}</p>
      {correlationId !== undefined && correlationId !== null && (
        <p className="font-mono text-2xs text-text-subtle">
          Reference: <span data-numeric>{correlationId}</span>
        </p>
      )}
      {onRetry !== undefined && (
        <Button size="sm" onClick={onRetry} icon={<RefreshCw aria-hidden className="size-3" />}>
          Retry
        </Button>
      )}
    </div>
  );
}
