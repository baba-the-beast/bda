import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

export interface PageHeaderProps {
  title: string;
  /**
   * One sentence saying what a reader can do here, in their words rather than
   * the service's. Every route carries one: a bare title over a stack of
   * panels tells a newcomer nothing about what the screen is for.
   */
  lede: string;
  /** The route's primary control — a filter, or the one action it offers. */
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, lede, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-3', className)}>
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-text">{title}</h1>
        <p className="mt-1 max-w-[58ch] text-sm text-text-muted">{lede}</p>
      </div>
      {actions !== undefined && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
