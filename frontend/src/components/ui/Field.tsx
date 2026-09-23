import { AlertCircle } from 'lucide-react';
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';

import { cn } from '../../lib/cn';

const CONTROL = cn(
  'w-full rounded bg-surface-sunken text-text placeholder:text-text-subtle',
  'border border-border transition-colors duration-base',
  'hover:border-border-strong focus:border-accent',
  'disabled:cursor-not-allowed disabled:opacity-60',
);

export interface FieldProps {
  label: string;
  /** Guidance shown under the control and wired up via aria-describedby. */
  hint?: string | undefined;
  error?: string | undefined;
  required?: boolean | undefined;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/**
 * Pairs a label with a control and owns the id wiring, so a field cannot ship
 * without an accessible name — the failure found on the sign-in form
 * (docs/FRONTEND_AUDIT.md §9).
 */
export function Field({ label, hint, error, required, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-text-muted">
        {label}
        {required === true && (
          <span aria-hidden className="ml-1 text-critical">
            *
          </span>
        )}
        {required === true && <span className="sr-only"> (required)</span>}
      </label>

      {children({ id, describedBy: describedBy || undefined, invalid: Boolean(error) })}

      {hint !== undefined && (
        <p id={hintId} className="text-2xs text-text-subtle">
          {hint}
        </p>
      )}
      {error !== undefined && (
        <p id={errorId} role="alert" className="flex items-center gap-1 text-2xs text-critical">
          <AlertCircle aria-hidden className="size-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

export type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid === true ? true : undefined}
      className={cn(CONTROL, 'h-9 px-2 text-sm', invalid === true && 'border-critical', className)}
      {...props}
    />
  );
});
