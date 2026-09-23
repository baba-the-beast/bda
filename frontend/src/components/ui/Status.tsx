import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Info,
  type LucideIcon,
  XCircle,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

export type Status = 'ok' | 'warning' | 'critical' | 'info' | 'neutral';

interface StatusStyle {
  className: string;
  Icon: LucideIcon;
  /** Read by screen readers so status is never carried by colour alone. */
  label: string;
}

const STATUS: Record<Status, StatusStyle> = {
  ok: { className: 'bg-ok-bg text-ok border-ok/30', Icon: CheckCircle2, label: 'OK' },
  warning: {
    className: 'bg-warning-bg text-warning border-warning/30',
    Icon: AlertTriangle,
    label: 'Warning',
  },
  critical: {
    className: 'bg-critical-bg text-critical border-critical/30',
    Icon: XCircle,
    label: 'Critical',
  },
  info: { className: 'bg-info-bg text-info border-info/30', Icon: Info, label: 'Info' },
  neutral: {
    className: 'bg-neutral-bg text-neutral border-neutral/30',
    Icon: CircleDashed,
    label: 'Neutral',
  },
};

export interface BadgeProps {
  children: ReactNode;
  className?: string;
}

/** A plain label chip with no status meaning attached. */
export function Badge({ children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm border border-border bg-surface-raised',
        'px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide text-text-muted',
        className,
      )}
    >
      {children}
    </span>
  );
}

export interface StatusPillProps {
  status: Status;
  children: ReactNode;
  /** Hide the icon only where the same status is already iconified nearby. */
  showIcon?: boolean;
  className?: string;
}

/**
 * Status is always carried by an icon and text as well as colour, which is
 * both a WCAG 1.4.1 requirement and the only way this reads correctly for the
 * ~8% of men with a colour vision deficiency.
 */
export function StatusPill({ status, children, showIcon = true, className }: StatusPillProps) {
  const { className: statusClass, Icon, label } = STATUS[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5',
        'text-2xs font-medium uppercase tracking-wide',
        statusClass,
        className,
      )}
    >
      {showIcon && <Icon aria-hidden className="size-3 shrink-0" />}
      <span className="sr-only">{label}: </span>
      {children}
    </span>
  );
}
