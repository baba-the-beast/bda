import * as RadixTabs from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

export interface TabItem {
  value: string;
  label: string;
  content: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  /** Names the tab list for assistive technology. */
  label: string;
  items: readonly TabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  className?: string;
}

/**
 * Tabs on Radix: arrow-key roving focus and the tab/tabpanel relationship are
 * handled by the primitive.
 */
export function Tabs({ label, items, value, defaultValue, onValueChange, className }: TabsProps) {
  return (
    <RadixTabs.Root
      {...(value === undefined ? {} : { value })}
      {...(onValueChange === undefined ? {} : { onValueChange })}
      {...(() => {
        const fallback = defaultValue ?? items[0]?.value;
        return fallback === undefined ? {} : { defaultValue: fallback };
      })()}
      className={cn('flex flex-col', className)}
    >
      <RadixTabs.List
        aria-label={label}
        className="flex items-center gap-1 border-b border-border px-2"
      >
        {items.map((item) => (
          <RadixTabs.Trigger
            key={item.value}
            value={item.value}
            disabled={item.disabled ?? false}
            className={cn(
              'relative px-3 py-2 text-xs font-medium text-text-muted',
              'transition-colors duration-base hover:text-text',
              'disabled:cursor-not-allowed disabled:opacity-40',
              'data-[state=active]:text-text',
              // The active marker is a bar, not just a colour change.
              'after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-transparent',
              'data-[state=active]:after:bg-accent',
            )}
          >
            {item.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>

      {items.map((item) => (
        <RadixTabs.Content
          key={item.value}
          value={item.value}
          className="outline-none animate-fade-in"
        >
          {item.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
