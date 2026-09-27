import { useEffect, useRef } from 'react';

import { cn } from '../../lib/cn';

import { CODE_RAIN, createCodeRain } from './codeRain';

/** Frames are glyph-heavy; 30 a second reads as smooth for a flicker. */
const FRAME_MS = 1000 / 30;

/**
 * Above this average cost per frame the backdrop is taking time the sign-in
 * form needs (typing, focus, the on-screen keyboard), so it steps down: first
 * to one device pixel per CSS pixel, then half the frame rate, then a still.
 */
const BUDGET_MS = 8;
const QUALITY_STEPS = [
  { maxDpr: 2, frameMs: FRAME_MS },
  { maxDpr: 1, frameMs: FRAME_MS },
  { maxDpr: 1, frameMs: FRAME_MS * 2 },
] as const;

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
    // Phones start one step down: a tall canvas at 2x is four times the pixels.
    let step = window.matchMedia('(pointer: coarse)').matches ? 1 : 0;
    let cost = 0;
    let measured = 0;
    let still = false;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < (QUALITY_STEPS[step] ?? QUALITY_STEPS[0]).frameMs) return;
      last = now;
      const began = performance.now();
      renderer.frame(now);
      cost = cost * 0.8 + (performance.now() - began) * 0.2;
      measured += 1;
      // Judge only once the average has settled past the first, colder frames.
      if (measured >= 10 && cost > BUDGET_MS) {
        measured = 0;
        cost = 0;
        if (step < QUALITY_STEPS.length - 1) {
          step += 1;
          fit();
        } else {
          still = true;
          start();
        }
      }
    };

    const start = () => {
      cancelAnimationFrame(raf);
      if (motion.matches || document.hidden || still) {
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
      renderer.resize(
        width,
        height,
        Math.min(window.devicePixelRatio || 1, (QUALITY_STEPS[step] ?? QUALITY_STEPS[0]).maxDpr),
      );
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
