import * as RadixSelect from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';

import { cn } from '../../lib/cn';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  value: string | undefined;
  onValueChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  'aria-describedby'?: string;
  /** Required when no visible <label> points at this control. */
  'aria-label'?: string;
  className?: string;
}

/**
 * Select built on Radix, so keyboard navigation, typeahead, focus management
 * and the listbox roles are handled by the primitive rather than by us.
 */
export function Select({
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  disabled,
  className,
  ...aria
}: SelectProps) {
  return (
    <RadixSelect.Root
      {...(value === undefined ? {} : { value })}
      {...(disabled === undefined ? {} : { disabled })}
      onValueChange={onValueChange}
    >
      <RadixSelect.Trigger
        {...aria}
        className={cn(
          'inline-flex h-9 w-full items-center justify-between gap-2 rounded px-2',
          'border border-border bg-surface-sunken text-sm text-text',
          'transition-colors duration-base hover:border-border-strong',
          'data-[placeholder]:text-text-subtle',
          'disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
      >
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon>
          <ChevronDown aria-hidden className="size-3.5 text-text-subtle" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={4}
          className={cn(
            'z-dropdown max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden',
            'rounded border border-border bg-surface-raised shadow-lg',
            'animate-fade-in',
          )}
        >
          <RadixSelect.Viewport className="p-1">
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled ?? false}
                className={cn(
                  'relative flex cursor-pointer select-none items-center gap-2 rounded-sm',
                  'py-1.5 pl-6 pr-2 text-sm text-text outline-none',
                  'data-[highlighted]:bg-accent/15 data-[highlighted]:text-text',
                  'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
                )}
              >
                <RadixSelect.ItemIndicator className="absolute left-1.5">
                  <Check aria-hidden className="size-3 text-accent" />
                </RadixSelect.ItemIndicator>
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
