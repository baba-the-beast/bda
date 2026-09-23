import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge has to be told about scale keys it cannot infer.
 *
 * Without this it reads `text-figure` as a text *colour* rather than a font
 * size, and drops the real colour class next to it as a conflict — so the type
 * silently renders at the wrong size with no error anywhere.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['2xs', 'figure', 'hero'] }],
    },
  },
});

/**
 * Compose class names, letting a caller's utility win over a component's
 * default rather than both landing in the class list and the cascade deciding.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
