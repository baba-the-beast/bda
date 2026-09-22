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
  import('../pages/DatasetsPage').then((m) => ({ default: m.DatasetsPage })),
);
const DataEngineScreen = lazy(() =>
  import('../pages/stitch/DataEngineScreen').then((m) => ({ default: m.DataEngineScreen })),
);
const JobsPage = lazy(() => import('../pages/JobsPage').then((m) => ({ default: m.JobsPage })));
const LoadProfileScreen = lazy(() =>
  import('../pages/stitch/LoadProfileScreen').then((m) => ({ default: m.LoadProfileScreen })),
);
const SubMeterScreen = lazy(() =>
  import('../pages/stitch/SubMeterScreen').then((m) => ({ default: m.SubMeterScreen })),
);
const VoltagePage = lazy(() =>
  import('../features/voltage/VoltagePage').then((m) => ({ default: m.VoltagePage })),
);
const QueryLabPage = lazy(() =>
  import('../pages/QueryLabPage').then((m) => ({ default: m.QueryLabPage })),
);
const StreamPage = lazy(() =>
  import('../features/stream/StreamPage').then((m) => ({ default: m.StreamPage })),
);
const ProjectMetricsPage = lazy(() =>
  import('../pages/ProjectMetricsPage').then((m) => ({ default: m.ProjectMetricsPage })),
);
const AdminPage = lazy(() => import('../pages/AdminPage').then((m) => ({ default: m.AdminPage })));
const VivaDemoPage = lazy(() =>
  import('../pages/VivaDemoPage').then((m) => ({ default: m.VivaDemoPage })),
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
      { path: 'pipelines', element: <DataEngineScreen /> },
      { path: 'jobs', element: <JobsPage /> },
      { path: 'analysis', element: <LoadProfileScreen /> },
      { path: 'sub-meters', element: <SubMeterScreen /> },
      { path: 'voltage', element: <VoltagePage /> },
      { path: 'query', element: <QueryLabPage /> },
      { path: 'stream', element: <StreamPage /> },
      { path: 'platform', element: <ProjectMetricsPage /> },
      {
        path: 'admin',
        element: (
          // Convenience only: the API is what actually enforces this.
          <RequireRole roles={['ADMIN']}>
            <AdminPage />
          </RequireRole>
        ),
      },
      { path: 'demo', element: <VivaDemoPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
