import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation } from 'react-router-dom';
import { z } from 'zod';

import { useAuth } from '../../app/AuthProvider';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { Badge } from '../../components/ui/Status';
import { ApiError } from '../../lib/api/errors';

const schema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

type SignInValues = z.infer<typeof schema>;

/**
 * Demo credentials are compiled in only when VITE_DEMO_MODE is explicitly
 * "true". The previous build shipped the admin password as the form's initial
 * state and offered one-click sign-in for two roles, in every environment
 * (docs/FRONTEND_AUDIT.md §3.3).
 */
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

const DEMO_ACCOUNTS = [
  { label: 'Administrator', email: 'admin@bda-energy.internal', password: 'AdminPass123!' },
  { label: 'Analyst', email: 'analyst@bda-energy.internal', password: 'AnalystPass123!' },
] as const;

export function SignInPage() {
  const { signIn, status } = useAuth();
  const location = useLocation();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  // Where the guard redirected them from, so signing in resumes the journey.
  const destination = (location.state as { from?: string } | null)?.from ?? '/overview';

  if (status === 'authenticated') {
    return <Navigate to={destination} replace />;
  }

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      // The redirect above takes over once status flips to authenticated.
      await signIn(values.email, values.password);
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? error.message
          : 'Could not reach the platform. Check your connection and try again.',
      );
    }
  });

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded border border-border bg-surface p-6">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <img src="/logo.svg" alt="" aria-hidden className="size-8" />
          <h1 className="text-xl font-semibold text-text">GridPulse</h1>
          <p className="text-xs text-text-muted">Household energy analytics platform</p>
          {DEMO_MODE && <Badge className="mt-1">Demo mode</Badge>}
        </div>

        {submitError !== null && (
          <div
            role="alert"
            className="mb-4 rounded border border-critical/40 bg-critical-bg px-3 py-2 text-xs text-critical"
          >
            {submitError}
          </div>
        )}

        <form
          onSubmit={(event) => {
            void onSubmit(event);
          }}
          noValidate
          className="flex flex-col gap-4"
        >
          <Field label="Email" error={errors.email?.message} required>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                type="email"
                autoComplete="username"
                // eslint-disable-next-line jsx-a11y/no-autofocus -- the page exists solely to take this input
                autoFocus
                invalid={invalid}
                {...(describedBy === undefined ? {} : { 'aria-describedby': describedBy })}
                {...register('email')}
              />
            )}
          </Field>

          <Field label="Password" error={errors.password?.message} required>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                type="password"
                autoComplete="current-password"
                invalid={invalid}
                {...(describedBy === undefined ? {} : { 'aria-describedby': describedBy })}
                {...register('password')}
              />
            )}
          </Field>

          <Button type="submit" variant="primary" loading={isSubmitting}>
            Sign in
          </Button>
        </form>

        {DEMO_MODE && (
          <div className="mt-6 border-t border-border pt-4">
            <p className="mb-2 text-xs text-text-subtle">Demo accounts</p>
            <div className="flex gap-2">
              {DEMO_ACCOUNTS.map((account) => (
                <Button
                  key={account.email}
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    setValue('email', account.email);
                    setValue('password', account.password);
                  }}
                >
                  {account.label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
