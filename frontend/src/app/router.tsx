import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

import { AppLayout } from './AppLayout';
import { RequireAuth, RequireRole } from './guards';
import { NotFoundPage } from './NotFoundPage';

/**
 * Route modules are lazy so each section is its own chunk and the landing
 * route does not pay for the whole app.
 *
 * These still point at the pre-overhaul page components. Phase 5 replaces them
 * one domain at a time; the URLs and guards are already their final shape.
 */
const OverviewPage = lazy(() =>
  import('../features/overview/OverviewPage').then((m) => ({ default: m.OverviewPage })),
);
const DatasetsPage = lazy(() =>
  import('../features/datasets/DatasetsPage').then((m) => ({ default: m.DatasetsPage })),
);
const JobsPage = lazy(() =>
  import('../features/jobs/JobsPage').then((m) => ({ default: m.JobsPage })),
);
const AnalysisPage = lazy(() =>
  import('../features/analysis/AnalysisPage').then((m) => ({ default: m.AnalysisPage })),
);
const VoltagePage = lazy(() =>
  import('../features/voltage/VoltagePage').then((m) => ({ default: m.VoltagePage })),
);
const QueryPage = lazy(() =>
  import('../features/query/QueryPage').then((m) => ({ default: m.QueryPage })),
);
const StreamPage = lazy(() =>
  import('../features/stream/StreamPage').then((m) => ({ default: m.StreamPage })),
);
const PlatformPage = lazy(() =>
  import('../features/platform/PlatformPage').then((m) => ({ default: m.PlatformPage })),
);
const AdminPage = lazy(() =>
  import('../features/admin/AdminPage').then((m) => ({ default: m.AdminPage })),
);
const DemoPage = lazy(() =>
  import('../features/demo/DemoPage').then((m) => ({ default: m.DemoPage })),
);
const SignInPage = lazy(() =>
  import('../features/auth/SignInPage').then((m) => ({ default: m.SignInPage })),
);

export const router = createBrowserRouter([
  { path: '/sign-in', element: <SignInPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/overview" replace /> },
      { path: 'overview', element: <OverviewPage /> },
      { path: 'datasets', element: <DatasetsPage /> },
      { path: 'jobs', element: <JobsPage /> },
      { path: 'analysis', element: <AnalysisPage /> },
      { path: 'voltage', element: <VoltagePage /> },
      { path: 'query', element: <QueryPage /> },
      { path: 'stream', element: <StreamPage /> },
      { path: 'platform', element: <PlatformPage /> },
      {
        path: 'admin',
        element: (
          // Convenience only: the API is what actually enforces this.
          <RequireRole roles={['ADMIN']}>
            <AdminPage />
          </RequireRole>
        ),
      },
      { path: 'demo', element: <DemoPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
