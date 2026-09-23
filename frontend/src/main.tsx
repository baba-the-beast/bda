import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import { AuthProvider } from './app/AuthProvider';
import { ErrorBoundary } from './app/ErrorBoundary';
import { router } from './app/router';
import { ThemeProvider } from './app/ThemeProvider';
import { ToastProvider } from './components/ui/Toast';
import { ApiError } from './lib/api/errors';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Pausing while the tab is hidden stops background polling burning
      // requests on a dashboard nobody is looking at.
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        // Authentication and authorisation failures will not fix themselves.
        if (error instanceof ApiError && (error.isUnauthorized || error.isForbidden)) {
          return false;
        }
        return failureCount < 3;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root is missing from index.html');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <AuthProvider>
              <RouterProvider router={router} />
            </AuthProvider>
          </ToastProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
