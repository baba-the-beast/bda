import { FileQuestion } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/States';

export function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <EmptyState
        icon={<FileQuestion aria-hidden className="size-6 text-text-subtle" />}
        title="Page not found"
        description="That address does not match any section of the platform."
        action={
          <Button asChild variant="primary" size="sm">
            <Link to="/overview">Go to overview</Link>
          </Button>
        }
      />
    </main>
  );
}
