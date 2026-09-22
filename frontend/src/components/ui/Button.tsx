import { Slot } from '@radix-ui/react-slot';
import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-contrast hover:bg-accent-hover',
  secondary: 'bg-surface-raised text-text border border-border hover:border-border-strong',
  ghost: 'bg-transparent text-text-muted hover:bg-surface-raised hover:text-text',
  danger: 'bg-critical-bg text-critical border border-critical/40 hover:border-critical',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2 text-xs gap-1',
  md: 'h-9 px-3 text-sm gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks interaction. The button keeps its width. */
  loading?: boolean;
  /** Render as the single child element instead of a <button>, for links. */
  asChild?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'secondary',
    size = 'md',
    loading = false,
    asChild,
    icon,
    children,
    disabled,
    type,
    ...props
  },
  ref,
) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      ref={ref}
      // An unset type inside a form submits it; that has caused enough bugs.
      type={asChild ? undefined : (type ?? 'button')}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded font-medium',
        'transition-colors duration-base ease-out',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {/* Radix Slot accepts a single child, so when rendering as another
          element the icon slot is skipped and the child is forwarded as-is. */}
      {asChild === true ? (
        children
      ) : (
        <>
          {loading ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : icon}
          {children}
        </>
      )}
    </Comp>
  );
});
