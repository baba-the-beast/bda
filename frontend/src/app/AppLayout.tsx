import { Suspense, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { Navbar } from '../components/Navbar';
import { ROUTE_FOR_PAGE, Sidebar, type PageId } from '../components/Sidebar';
import { Dialog } from '../components/ui/Dialog';
import { SkeletonText } from '../components/ui/States';

import { useAuth } from './AuthProvider';
import { ErrorBoundary } from './ErrorBoundary';

/** Chrome shared by every signed-in route. */
export function AppLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const currentPage =
    (Object.entries(ROUTE_FOR_PAGE).find(([, path]) => location.pathname.startsWith(path))?.[0] as
      PageId | undefined) ?? 'overview';

  const goTo = (page: PageId) => {
    setMenuOpen(false);
    void navigate(ROUTE_FOR_PAGE[page] + location.search);
  };

  return (
    // A fixed-height shell, so the page scrolls inside <main> and the header
    // and sidebar stay put.
    <div className="flex h-dvh flex-col">
      <Navbar
        user={user}
        onOpenMenu={() => {
          setMenuOpen(true);
        }}
        onLogout={() => {
          void signOut().then(() => {
            void navigate('/sign-in', { replace: true });
          });
        }}
      />

      <div className="flex min-h-0 flex-1">
        {/* Below md the sidebar would leave a phone ~150px for the page; it
            moves into a drawer opened from the header instead. */}
        <Sidebar
          className="hidden md:flex"
          currentPage={currentPage}
          onSelectPage={goTo}
          userRole={user?.role}
        />

        <Dialog
          open={menuOpen}
          onOpenChange={setMenuOpen}
          side="left"
          title="GridPulse"
          description="Go to a section"
        >
          <Sidebar
            className="w-full border-r-0"
            currentPage={currentPage}
            onSelectPage={goTo}
            userRole={user?.role}
          />
        </Dialog>

        <main id="main" className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-5">
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
