import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { Panel, PanelBody } from '../components/ui';
import { ErrorState, Skeleton } from '../components/ui/States';

import { useAuth } from './AuthProvider';

/**
 * Requires a signed-in user.
 *
 * Remembers where the visitor was heading so the sign-in page can return them
 * there — the point of having real URLs.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'checking') {
    return (
      <div className="p-4">
        <Skeleton className="h-32 w-full" label="Restoring your session" />
      </div>
    );
  }

  if (status === 'anonymous') {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />;
  }

  return <>{children}</>;
}

/**
 * Requires one of the given roles.
 *
 * This is a convenience, not a security control: the API enforces authorisation
 * on every request. Hiding a route only stops a user wandering into a page that
 * will fail; it does not protect the data (docs/SECURITY.md).
 */
export function RequireRole({
  roles,
  children,
}: {
  roles: readonly string[];
  children: ReactNode;
}) {
  const { user, status } = useAuth();

  if (status === 'checking') {
    return (
      <div className="p-4">
        <Skeleton className="h-32 w-full" label="Checking permissions" />
      </div>
    );
  }

  if (user === null || !roles.includes(user.role)) {
    return (
      <Panel className="m-4">
        <PanelBody>
          <ErrorState
            title="You do not have access to this section"
            message={`This area is restricted to ${roles.join(' or ')}. Your role is ${
              user?.role ?? 'unknown'
            }.`}
          />
        </PanelBody>
      </Panel>
    );
  }

  return <>{children}</>;
}
