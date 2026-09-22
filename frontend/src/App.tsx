import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar, PageId } from './components/Sidebar';
import { LoadProfileScreen } from './pages/stitch/LoadProfileScreen';
import { LiveTelemetryScreen } from './pages/stitch/LiveTelemetryScreen';
import { SubMeterScreen } from './pages/stitch/SubMeterScreen';
import { DataEngineScreen } from './pages/stitch/DataEngineScreen';
import { SubstationScreen } from './pages/stitch/SubstationScreen';
import { DatasetsPage } from './pages/DatasetsPage';
import { JobsPage } from './pages/JobsPage';
import { QueryLabPage } from './pages/QueryLabPage';
import { ProjectMetricsPage } from './pages/ProjectMetricsPage';
import { AdminPage } from './pages/AdminPage';
import { VivaDemoPage } from './pages/VivaDemoPage';
import { api } from './api';
import { User } from './types';

export const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState<PageId>('load-profile');
  const [email, setEmail] = useState<string>('admin@bda-energy.internal');
  const [password, setPassword] = useState<string>('AdminPass123!');
  const [loginError, setLoginError] = useState<string>('');
  const [authChecking, setAuthChecking] = useState<boolean>(true);

  useEffect(() => {
    checkCurrentUser();
    const handleUnauthorized = () => setUser(null);
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  const checkCurrentUser = async () => {
    try {
      if (api.getToken()) {
        const u = await api.getProfile();
        setUser(u);
      }
    } catch {
      api.setToken(null);
      setUser(null);
    } finally {
      setAuthChecking(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      await api.login(email, password);
      const u = await api.getProfile();
      setUser(u);
    } catch (err: any) {
      setLoginError(err.message || 'Login failed');
    }
  };

  const handleLogout = async () => {
    await api.logout();
    setUser(null);
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-background text-on-surface font-mono text-xs flex items-center justify-center">
        INITIALIZING GRIDPULSE TELEMETRY CONSOLE...
      </div>
    );
  }

  // Industrial Slate Login Screen
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4 font-sans text-on-surface">
        <div className="w-full max-w-md p-space-xl bg-surface-container-low border border-outline-variant shadow-2xl space-y-space-lg">
          <div className="text-center space-y-2">
            <img src="/logo.svg" alt="GridPulse" className="w-12 h-12 mx-auto object-contain" />
            <h1 className="font-mono text-2xl font-bold tracking-wider text-on-surface uppercase">
              GRIDPULSE
            </h1>
            <p className="font-mono text-xs text-outline">
              Industrial Energy Telemetry & Big Data Analytics Console
            </p>
          </div>

          {loginError && (
            <div className="p-3 bg-error/20 border border-error text-error font-mono text-xs">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4 font-mono text-xs">
            <div>
              <label
                htmlFor="login-email"
                className="block text-outline uppercase tracking-wider mb-1"
              >
                OPERATOR IDENTIFIER (EMAIL)
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-surface-container-lowest border border-outline-variant px-3 py-2 text-on-surface outline-none focus:border-primary"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-outline uppercase tracking-wider mb-1"
              >
                ACCESS CIPHER (PASSWORD)
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-surface-container-lowest border border-outline-variant px-3 py-2 text-on-surface outline-none focus:border-primary"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-primary hover:bg-primary-fixed-dim text-on-primary font-bold text-xs uppercase tracking-wider transition"
            >
              AUTHENTICATE CONSOLE SESSION
            </button>
          </form>

          {/* Quick Preset Credentials */}
          <div className="pt-space-md border-t border-outline-variant space-y-2 font-mono text-xs">
            <span className="text-outline block text-center uppercase text-[11px]">
              Demonstration Credentials
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setEmail('admin@bda-energy.internal');
                  setPassword('AdminPass123!');
                }}
                className="flex-1 py-1.5 bg-surface-container hover:bg-surface-container-high border border-outline-variant text-on-surface transition text-[11px]"
              >
                Admin (Full Access)
              </button>
              <button
                type="button"
                onClick={() => {
                  setEmail('analyst@bda-energy.internal');
                  setPassword('AnalystPass123!');
                }}
                className="flex-1 py-1.5 bg-surface-container hover:bg-surface-container-high border border-outline-variant text-on-surface transition text-[11px]"
              >
                Analyst
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-on-surface flex flex-col font-sans">
      <Navbar user={user} onLogout={handleLogout} isDark={true} onToggleTheme={() => {}} />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar currentPage={currentPage} onSelectPage={setCurrentPage} userRole={user.role} />

        <main className="flex-1 p-space-md lg:p-space-lg overflow-y-auto max-w-full">
          {currentPage === 'live-telemetry' && (
            <LiveTelemetryScreen onNavigate={(p: any) => setCurrentPage(p)} />
          )}
          {currentPage === 'load-profile' && (
            <LoadProfileScreen onNavigate={(p: any) => setCurrentPage(p)} />
          )}
          {currentPage === 'sub-meters' && <SubMeterScreen />}
          {currentPage === 'data-engine' && (
            <DataEngineScreen onNavigate={(p: any) => setCurrentPage(p)} />
          )}
          {currentPage === 'substation' && <SubstationScreen />}
          {currentPage === 'query-lab' && <QueryLabPage />}
          {currentPage === 'metrics' && <ProjectMetricsPage />}
          {currentPage === 'datasets' && <DatasetsPage />}
          {currentPage === 'jobs' && <JobsPage />}
          {currentPage === 'admin' && <AdminPage />}
          {currentPage === 'viva-demo' && <VivaDemoPage />}
        </main>
      </div>
    </div>
  );
};
