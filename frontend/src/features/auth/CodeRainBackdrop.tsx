import { useEffect, useRef } from 'react';

import { cn } from '../../lib/cn';

import { CODE_RAIN, createCodeRain } from './codeRain';

/** Frames are glyph-heavy; 30 a second reads as smooth for a flicker. */
const FRAME_MS = 1000 / 30;

/**
 * The landing page's animated backdrop. Decorative only: hidden from
 * assistive technology, one still frame under reduced motion, and paused
 * while the tab is in the background.
 */
export function CodeRainBackdrop({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const renderer = createCodeRain(canvas, CODE_RAIN);
    if (renderer === null) return;

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;
    let last = -Infinity;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < FRAME_MS) return;
      last = now;
      renderer.frame(now);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      if (motion.matches || document.hidden) {
        // A fixed time, so the still frame is the same one every visit.
        renderer.frame(1000);
        return;
      }
      last = -Infinity;
      raf = requestAnimationFrame(loop);
    };

    const fit = () => {
      const { width, height } = canvas.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      renderer.resize(width, height, Math.min(window.devicePixelRatio || 1, 2));
      start();
    };

    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    motion.addEventListener('change', start);
    document.addEventListener('visibilitychange', start);
    // The glyphs use the mono webfont; redraw once it is ready.
    let disposed = false;
    void document.fonts.ready.then(() => {
      if (!disposed) fit();
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      motion.removeEventListener('change', start);
      document.removeEventListener('visibilitychange', start);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      data-testid="code-rain"
      className={cn('block h-full w-full bg-[#030604]', className)}
    />
  );
}
