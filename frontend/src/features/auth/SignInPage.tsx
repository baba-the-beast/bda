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

import { CodeRainBackdrop } from './CodeRainBackdrop';

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

/** Facts about the dataset, not live figures: the page is shown signed out. */
const FACTS = [
  { value: '2,075,259', label: 'one-minute readings' },
  { value: '47 months', label: 'Dec 2006 – Nov 2010' },
  { value: 'Batch + stream', label: 'MapReduce, Hive, Kafka' },
] as const;

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
    // The backdrop is dark in both themes, so the hero uses fixed light colours
    // on a scrim; the sign-in card keeps the theme tokens on its own surface.
    <main className="relative min-h-screen overflow-hidden bg-[#030604]">
      <CodeRainBackdrop className="absolute inset-0" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl items-center gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-8 lg:px-8">
        <section className="max-w-2xl rounded-lg bg-[#020403]/75 p-5 backdrop-blur-sm sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <img src="/logo.svg" alt="" aria-hidden className="size-7" />
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-[#b8f5cf]">
              GridPulse
            </span>
            {DEMO_MODE && <Badge className="ml-1">Demo mode</Badge>}
          </div>
          <h1 className="text-2xl font-semibold leading-tight text-[#f2fff6] sm:text-[2.75rem]">
            Every minute a household draws power, read at scale.
          </h1>
          <p className="mt-3 text-sm text-[#c4d9cc]">
            Household energy analytics on a big-data pipeline: raw meter logs land in HDFS, are
            cleaned, aggregated by MapReduce and Hive, and replayed as a live stream.
          </p>
          <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-[#2c4a38] pt-4 sm:grid-cols-3">
            {FACTS.map((fact) => (
              <div key={fact.value}>
                <dt className="text-2xs text-[#9fbfac]">{fact.label}</dt>
                <dd className="mt-1 font-mono text-base text-[#6dffa8]" data-numeric>
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Stacked on a phone, the hero alone fills the first screen; the form
            comes first there so signing in never starts with a scroll. */}
        <div className="order-first w-full rounded border border-border bg-surface p-6 shadow-lg lg:order-none">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-text">Sign in</h2>
            <p className="text-xs text-text-muted">Use your workspace account.</p>
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
      </div>
    </main>
  );
}
