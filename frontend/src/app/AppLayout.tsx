import { Suspense } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { Navbar } from '../components/Navbar';
import { ROUTE_FOR_PAGE, Sidebar, type PageId } from '../components/Sidebar';
import { SkeletonText } from '../components/ui/States';

import { useAuth } from './AuthProvider';
import { ErrorBoundary } from './ErrorBoundary';

/** Chrome shared by every signed-in route. */
export function AppLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const currentPage =
    (Object.entries(ROUTE_FOR_PAGE).find(([, path]) => location.pathname.startsWith(path))?.[0] as
      PageId | undefined) ?? 'overview';

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar
        user={user}
        onLogout={() => {
          void signOut().then(() => {
            void navigate('/sign-in', { replace: true });
          });
        }}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          currentPage={currentPage}
          onSelectPage={(page) => {
            void navigate(ROUTE_FOR_PAGE[page] + location.search);
          }}
          userRole={user?.role}
        />

        <main id="main" className="flex-1 overflow-y-auto p-4">
          {/* A failure in one route must not blank the shell around it. */}
          <ErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<SkeletonText lines={6} className="max-w-2xl" />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
