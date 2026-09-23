import type { ReactNode } from 'react';

import { ErrorState, SkeletonText } from '../../components/ui/States';
import { ApiError } from '../../lib/api/errors';

export interface PanelStateProps {
  isLoading: boolean;
  error: unknown;
  /** True once data has arrived but is empty. */
  isEmpty?: boolean;
  empty?: ReactNode;
  onRetry?: () => void;
  /** Tighter loading and error states, for a fixed-size dashboard card. */
  compact?: boolean;
  children: ReactNode;
}

/**
 * The four states every data panel owes the reader: loading, error, empty and
 * loaded. Centralised so no panel can quietly render an empty frame and let it
 * read as "zero".
 */
export function PanelState({
  isLoading,
  error,
  isEmpty = false,
  empty,
  onRetry,
  compact = false,
  children,
}: PanelStateProps) {
  if (isLoading) {
    return <SkeletonText lines={compact ? 3 : 4} />;
  }

  if (error !== null && error !== undefined) {
    return (
      <ErrorState
        message={
          error instanceof Error ? error.message : 'Something went wrong loading this panel.'
        }
        correlationId={error instanceof ApiError ? error.correlationId : null}
        {...(onRetry === undefined ? {} : { onRetry })}
        {...(compact ? { className: 'gap-1 px-2 py-2' } : {})}
      />
    );
  }

  if (isEmpty) {
    return <>{empty}</>;
  }

  return <>{children}</>;
}
