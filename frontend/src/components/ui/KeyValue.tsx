import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

export interface KeyValueItem {
  label: string;
  value: ReactNode;
  /** Renders the value in monospace: hashes, paths, ids. */
  mono?: boolean;
}

export interface KeyValueProps {
  items: readonly KeyValueItem[];
  className?: string;
}

/**
 * Definition list for record metadata — checksums, HDFS paths, versions.
 * A real <dl> so the label/value relationship survives into the a11y tree.
 */
export function KeyValue({ items, className }: KeyValueProps) {
  return (
    <dl className={cn('grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-4 gap-y-2', className)}>
      {items.map((item) => (
        <div key={item.label} className="contents">
          <dt className="text-xs text-text-muted">{item.label}</dt>
          <dd
            className={cn(
              'min-w-0 break-words text-xs text-text',
              item.mono === true && 'font-mono',
            )}
            {...(item.mono === true ? { 'data-numeric': true } : {})}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
