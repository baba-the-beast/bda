import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { server } from './server';

/**
 * jsdom implements neither the Pointer Capture API nor scrollIntoView, both of
 * which Radix primitives call during normal interaction. Without these the
 * components work but emit unhandled errors that Vitest surfaces as failures.
 */
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = () => undefined;
Element.prototype.releasePointerCapture = () => undefined;
Element.prototype.scrollIntoView = () => undefined;

// Fail a test if it hits an endpoint no handler covers, rather than letting it
// fall through to a real network call.
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
