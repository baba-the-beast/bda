/**
 * Tailwind reads the design tokens rather than defining a parallel palette.
 * Every colour, space, radius and z-index below resolves to a custom property
 * declared in src/styles/tokens.css.
 *
 * @type {import('tailwindcss').Config}
 */

/** Colour tokens are RGB channel triplets, so opacity modifiers keep working. */
const rgb = (token) => `rgb(var(${token}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: rgb('--color-canvas'),
        surface: {
          DEFAULT: rgb('--color-surface'),
          raised: rgb('--color-surface-raised'),
          sunken: rgb('--color-surface-sunken'),
        },
        overlay: rgb('--color-overlay'),
        text: {
          DEFAULT: rgb('--color-text'),
          muted: rgb('--color-text-muted'),
          subtle: rgb('--color-text-subtle'),
        },
        border: {
          DEFAULT: rgb('--color-border'),
          strong: rgb('--color-border-strong'),
        },
        accent: {
          DEFAULT: rgb('--color-accent'),
          hover: rgb('--color-accent-hover'),
          contrast: rgb('--color-accent-contrast'),
        },
        ok: { DEFAULT: rgb('--color-ok'), bg: rgb('--color-ok-bg') },
        warning: { DEFAULT: rgb('--color-warning'), bg: rgb('--color-warning-bg') },
        critical: { DEFAULT: rgb('--color-critical'), bg: rgb('--color-critical-bg') },
        info: { DEFAULT: rgb('--color-info'), bg: rgb('--color-info-bg') },
        neutral: { DEFAULT: rgb('--color-neutral'), bg: rgb('--color-neutral-bg') },

        /**
         * Compatibility aliases for the pre-overhaul Material-derived palette.
         *
         * They map the old names onto the new tokens so the legacy screens keep
         * rendering while Phases 3-5 replace them. Do not use these in new code.
         * Delete this block once src/pages/** is rewritten (Phase 5); nothing
         * should reference them by then.
         */
        background: rgb('--color-canvas'),
        'surface-bright': rgb('--color-surface-raised'),
        'surface-container-lowest': rgb('--color-canvas'),
        'surface-container-low': rgb('--color-surface'),
        'surface-container': rgb('--color-surface-raised'),
        'surface-container-high': rgb('--color-surface-raised'),
        'on-surface': rgb('--color-text'),
        'on-surface-variant': rgb('--color-text-muted'),
        outline: rgb('--color-text-subtle'),
        'outline-variant': rgb('--color-border'),
        primary: rgb('--color-accent'),
        'primary-container': rgb('--color-accent'),
        'primary-fixed-dim': rgb('--color-accent-hover'),
        'on-primary': rgb('--color-accent-contrast'),
        'on-primary-container': rgb('--color-accent-contrast'),
        secondary: rgb('--color-info'),
        'on-secondary': rgb('--color-accent-contrast'),
        tertiary: rgb('--color-neutral'),
        error: rgb('--color-critical'),
        'error-container': rgb('--color-critical-bg'),
        'on-error': rgb('--color-critical'),
        'on-error-container': rgb('--color-critical'),
      },
      spacing: {
        1: 'var(--space-1)',
        2: 'var(--space-2)',
        3: 'var(--space-3)',
        4: 'var(--space-4)',
        5: 'var(--space-5)',
        6: 'var(--space-6)',
        7: 'var(--space-7)',
        8: 'var(--space-8)',

        /* Compatibility aliases for the pre-overhaul spacing ramp. Removed with
           src/pages/** in Phase 5; do not use in new code. */
        margin: 'var(--space-3)',
        gutter: 'var(--space-2)',
        'space-xs': 'var(--space-1)',
        'space-sm': 'var(--space-2)',
        'space-md': 'var(--space-2)',
        'space-lg': 'var(--space-3)',
        'space-xl': 'var(--space-4)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius-md)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        full: 'var(--radius-full)',
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
      },
      fontSize: {
        '2xs': 'var(--text-2xs)',
        xs: 'var(--text-xs)',
        sm: 'var(--text-sm)',
        base: 'var(--text-base)',
        lg: 'var(--text-lg)',
        xl: 'var(--text-xl)',
        '2xl': 'var(--text-2xl)',
        metric: 'var(--text-metric)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-md)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      zIndex: {
        base: 'var(--z-base)',
        sticky: 'var(--z-sticky)',
        header: 'var(--z-header)',
        dropdown: 'var(--z-dropdown)',
        overlay: 'var(--z-overlay)',
        dialog: 'var(--z-dialog)',
        toast: 'var(--z-toast)',
      },
      transitionDuration: {
        fast: 'var(--duration-fast)',
        DEFAULT: 'var(--duration-base)',
        base: 'var(--duration-base)',
        slow: 'var(--duration-slow)',
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in var(--duration-base) var(--ease-out)',
        'slide-up': 'slide-up var(--duration-base) var(--ease-out)',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};
