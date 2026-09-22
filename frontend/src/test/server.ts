import { setupServer } from 'msw/node';

import { handlers } from './handlers';

/**
 * The single MSW server shared by the unit suite. Mocks live here and in
 * handlers.ts only — never in production code (docs/FRONTEND_AUDIT.md §3.2).
 */
export const server = setupServer(...handlers);
