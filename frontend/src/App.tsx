import React, { useEffect, useState } from 'react';
import Hero from './components/Hero';
import AdminDashboard from './components/AdminDashboard';
import TechnicianDashboard from './components/TechnicianDashboard';
import UserManagement from './components/UserManagement';
import JobDetail from './components/JobDetail';
import JobList from './components/JobList';
import LoginPanel from './components/LoginPanel';
import UserProfile from './components/UserProfile';
import { ApiError, fetchJob, fetchJobs, login, logout, refreshAccessToken } from './lib/api';
import { clearStoredSession, loadStoredSession, persistSession } from './lib/auth';
import { formatUserDisplayName } from './lib/userDisplay';
import './styles/theme.css';
import type { AuthSession, JobDetailRecord, JobSummary } from './types';

type AppTab = 'jobs' | 'dashboard' | 'users' | 'profile';
type JobsView = 'board' | 'detail';
type ThemeMode = 'dark' | 'light';

const THEME_STORAGE_KEY = 'stryker-theme';

function parseAppLocation(isAdmin: boolean, currentUserId?: number) {
  // Keep deep-link behavior centralized so refresh/back preserves selected app context.
  const params = new URLSearchParams(window.location.search);
  const jobParam = Number(params.get('job'));
  const profileParam = Number(params.get('profile'));
  const tabParam = params.get('tab');

  if (Number.isInteger(jobParam) && jobParam > 0) {
    return {
      activeTab: 'jobs' as AppTab,
      jobsView: 'detail' as JobsView,
      selectedJobId: jobParam,
      selectedProfileUserId: null,
    };
  }

  if (Number.isInteger(profileParam) && profileParam > 0) {
    return {
      activeTab: 'profile' as AppTab,
      jobsView: 'board' as JobsView,
      selectedJobId: null,
      selectedProfileUserId: profileParam,
    };
  }

  if (tabParam === 'users' && isAdmin) {
    return { activeTab: 'users' as AppTab, jobsView: 'board' as JobsView, selectedJobId: null, selectedProfileUserId: null };
  }

  if (tabParam === 'dashboard') {
    return { activeTab: 'dashboard' as AppTab, jobsView: 'board' as JobsView, selectedJobId: null, selectedProfileUserId: null };
  }

  if (tabParam === 'profile') {
    return {
      activeTab: 'profile' as AppTab,
      jobsView: 'board' as JobsView,
      selectedJobId: null,
      selectedProfileUserId: currentUserId || null,
    };
  }

  return {
    activeTab: isAdmin ? 'jobs' as AppTab : 'dashboard' as AppTab,
    jobsView: 'board' as JobsView,
    selectedJobId: null,
    selectedProfileUserId: null,
  };
}

function updateUrl(params: Record<string, string | null>, replace = false) {
  const url = new URL(window.location.href);
  url.search = '';
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });

  const method = replace ? 'replaceState' : 'pushState';
  window.history[method](null, '', `${url.pathname}${url.search}`);
}

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return storedTheme === 'light' ? 'light' : 'dark';
  });
  const [session, setSession] = useState<AuthSession | null>(() => loadStoredSession());
  const [activeTab, setActiveTab] = useState<AppTab>('jobs');
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [selectedProfileUserId, setSelectedProfileUserId] = useState<number | null>(null);
  const [jobsView, setJobsView] = useState<JobsView>('board');
  const [job, setJob] = useState<JobDetailRecord | null>(null);
  const [jobLoading, setJobLoading] = useState(false);
  const [jobError, setJobError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (session) {
      persistSession(session);
      return;
    }
    clearStoredSession();
  }, [session]);

  async function runAuthed<T>(operation: (token: string) => Promise<T>) {
    if (!session) {
      throw new Error('Authentication required');
    }

    try {
      return await operation(session.accessToken);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && session.refreshToken) {
        const refreshed = await refreshAccessToken(session.refreshToken);
        const nextSession = { ...session, accessToken: refreshed.accessToken, user: refreshed.user || session.user };
        setSession(nextSession);
        persistSession(nextSession);
        return operation(nextSession.accessToken);
      }

      if (error instanceof ApiError && error.status === 401) {
        setSession(null);
      }

      throw error;
    }
  }

  async function loadJobs() {
    if (!session) {
      return;
    }
    setJobsLoading(true);
    setJobsError(null);
    try {
      const response = await runAuthed((token) => fetchJobs(token));
      setJobs(response.jobs);
      setSelectedJobId((current) => {
        if (!response.jobs.length) {
          return null;
        }
        return current && response.jobs.some((item) => item.id === current)
          ? current
          : response.jobs[0].id;
      });
    } catch (error) {
      setJobs([]);
      setJobsError(error instanceof Error ? error.message : 'Failed to load jobs');
    } finally {
      setJobsLoading(false);
    }
  }

  async function loadSelectedJob(jobId: number) {
    setJobLoading(true);
    setJobError(null);
    try {
      const response = await runAuthed((token) => fetchJob(token, jobId));
      setJob(response.job);
    } catch (error) {
      setJob(null);
      setJobError(error instanceof Error ? error.message : 'Failed to load job');
    } finally {
      setJobLoading(false);
    }
  }

  useEffect(() => {
    if (!session) {
      setJobs([]);
      setJob(null);
      setSelectedJobId(null);
      setJobsView('board');
      return;
    }
    loadJobs().catch(() => undefined);
  }, [session?.accessToken]);

  useEffect(() => {
    if (!session) return;
    const applyLocation = () => {
      const next = parseAppLocation(session.user.role === 'admin', session.user.id);
      setActiveTab(next.activeTab);
      setJobsView(next.jobsView);
      if (next.selectedJobId !== null) {
        setSelectedJobId(next.selectedJobId);
      }
      setSelectedProfileUserId(next.selectedProfileUserId);
    };
    applyLocation();
    window.addEventListener('popstate', applyLocation);
    return () => window.removeEventListener('popstate', applyLocation);
  }, [session]);

  useEffect(() => {
    if (!session || selectedJobId === null) {
      setJob(null);
      return;
    }
    loadSelectedJob(selectedJobId).catch(() => undefined);
  }, [selectedJobId, session?.accessToken]);

  useEffect(() => {
    if (!session) {
      setActiveTab('jobs');
    }
  }, [session]);

  // Authenticate user with email/password; on success, set session and load jobs.
  async function handleLogin(email: string, password: string) {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const nextSession = await login(email, password);
      setSession(nextSession);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Sign in failed');
    } finally {
      setAuthLoading(false);
    }
  }

  // Sign out user: call logout endpoint, clear all state, and reset URL.
  async function handleLogout() {
    if (session) {
      try {
        await logout(session.accessToken);
      } catch {
        // Ignore logout failures (tokens may be expired); still clear local session.
      }
    }
    // Clear all app state on logout.
    setSession(null);
    setJobs([]);
    setJob(null);
    setSelectedJobId(null);
    setSelectedProfileUserId(null);
    setJobsView('board');
    updateUrl({}, true);
  }

  async function refreshCurrentJob() {
    if (selectedJobId !== null) {
      await loadSelectedJob(selectedJobId);
    }
  }

  async function refreshJobsAndCurrentJob() {
    await loadJobs();
    if (selectedJobId !== null) {
      await loadSelectedJob(selectedJobId);
    }
  }

  // Navigate to job detail view; update URL with ?job=123 and scroll to top.
  function openJobDetail(jobId: number) {
    setSelectedJobId(jobId);
    setActiveTab('jobs');
    setJobsView('detail');
    updateUrl({ job: String(jobId) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Return to job board view from detail; clear job-specific URL params.
  function openDispatchBoard() {
    setJobsView('board');
    updateUrl({ tab: 'jobs' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Open user profile; update URL with ?tab=profile&profile=123 for deep-linking.
  function openUserProfile(userId: number) {
    setSelectedProfileUserId(userId);
    setActiveTab('profile');
    setJobsView('board');
    updateUrl({ tab: 'profile', profile: String(userId) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Update current session user (called when user edits their own profile).
  function handleSessionUserUpdated(nextUser: AuthSession['user']) {
    setSession((current) => {
      if (!current) return current;
      return { ...current, user: nextUser };
    });
  }

  function openJobFromDashboard(jobId: number) {
    openJobDetail(jobId);
  }

  const isAdmin = session?.user.role === 'admin';

  function ThemeIcon() {
    return theme === 'dark' ? (
      <svg aria-hidden="true" className="theme-toggle__icon" viewBox="0 0 24 24">
        <path d="M21 12.8A9 9 0 0 1 11.2 3a1 1 0 0 0-1.3 1.2A7.5 7.5 0 1 0 19.8 14a1 1 0 0 0 1.2-1.2Z" fill="currentColor" />
      </svg>
    ) : (
      <svg aria-hidden="true" className="theme-toggle__icon" viewBox="0 0 24 24">
        <circle cx="12" cy="12" fill="currentColor" r="4.5" />
        <g stroke="currentColor" strokeLinecap="round" strokeWidth="1.8">
          <path d="M12 2.5v2.2" />
          <path d="M12 19.3v2.2" />
          <path d="M21.5 12h-2.2" />
          <path d="M4.7 12H2.5" />
          <path d="m18.7 5.3-1.6 1.6" />
          <path d="m6.9 17.1-1.6 1.6" />
          <path d="m18.7 18.7-1.6-1.6" />
          <path d="M6.9 6.9 5.3 5.3" />
        </g>
      </svg>
    );
  }

  return (
    <div className="app-root">
      <header className="site-header">
        <div className="logo-wrap">
          <img src="/src/images/stryker.avif" alt="Stryker" className="site-logo" />
          <div>
            <div className="site-title">Stryker JTTS</div>
            <div className="site-subtitle">Job &amp; Time Tracking</div>
          </div>
        </div>

        {session && (
          <nav aria-label="Application sections" className="nav-tabs">
            <button
              className={`nav-tab ${activeTab === 'dashboard' ? 'nav-tab--active' : ''}`}
              onClick={() => {
                setActiveTab('dashboard');
                setJobsView('board');
                updateUrl({ tab: 'dashboard' });
              }}
              type="button"
            >
              {isAdmin ? 'Dashboard' : 'My Work'}
            </button>
            <button
              className={`nav-tab ${activeTab === 'jobs' ? 'nav-tab--active' : ''}`}
              onClick={() => {
                setActiveTab('jobs');
                setJobsView('board');
                updateUrl({ tab: 'jobs' });
              }}
              type="button"
            >
              Jobs
            </button>
            <button
              className={`nav-tab ${activeTab === 'profile' ? 'nav-tab--active' : ''}`}
              onClick={() => {
                const selfId = session.user.id;
                setActiveTab('profile');
                setSelectedProfileUserId(selfId);
                updateUrl({ tab: 'profile', profile: String(selfId) });
              }}
              type="button"
            >
              Profile
            </button>
            {isAdmin && (
              <button
                className={`nav-tab ${activeTab === 'users' ? 'nav-tab--active' : ''}`}
                onClick={() => {
                  setActiveTab('users');
                  updateUrl({ tab: 'users' });
                }}
                type="button"
              >
                Users
              </button>
            )}
          </nav>
        )}

        <div className="site-actions">
          <button
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="theme-toggle"
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            type="button"
          >
            <ThemeIcon />
          </button>
          {session ? (
            <>
              <button className="user-pill" onClick={() => openUserProfile(session.user.id)} type="button">
                <span className="user-pill__email">{formatUserDisplayName(session.user, 'Unknown User', 'compact')}</span>
                {isAdmin && <span className="user-pill__role">admin</span>}
              </button>
              <button className="btn btn-ghost" onClick={handleLogout} type="button">
                Sign out
              </button>
            </>
          ) : null}
        </div>
      </header>

      {!session && <Hero />}

      <main className={session ? 'container authenticated' : 'container workspace-shell'}>
        {!session ? (
          <div className="welcome-grid">
            <LoginPanel error={authError} loading={authLoading} onSubmit={handleLogin} />
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && isAdmin && (
              <AdminDashboard onOpenJob={openJobFromDashboard} onOpenProfile={openUserProfile} token={session.accessToken} />
            )}
            {activeTab === 'dashboard' && !isAdmin && session && (
              <TechnicianDashboard
                error={jobsError}
                jobs={jobs}
                loading={jobsLoading}
                onOpenJob={openJobFromDashboard}
                onRefresh={loadJobs}
                token={session.accessToken}
                user={session.user}
              />
            )}
            {activeTab === 'users' && isAdmin && (
              <UserManagement onOpenProfile={openUserProfile} token={session.accessToken} />
            )}
            {activeTab === 'profile' && selectedProfileUserId !== null && (
              <UserProfile
                currentUser={session.user}
                isAdmin={isAdmin}
                onCurrentUserUpdated={handleSessionUserUpdated}
                onOpenJob={openJobFromDashboard}
                onOpenProfile={openUserProfile}
                token={session.accessToken}
                userId={selectedProfileUserId}
              />
            )}
            {activeTab === 'jobs' && (
              jobsView === 'board' ? (
                <div className="workspace-grid workspace-grid--board">
                  <JobList
                    currentUser={session.user}
                    error={jobsError}
                    isAdmin={isAdmin}
                    jobs={jobs}
                    loading={jobsLoading}
                    onRefresh={loadJobs}
                    onOpenProfile={openUserProfile}
                    onSelect={openJobDetail}
                    selectedJobId={selectedJobId}
                    token={session.accessToken}
                  />
                </div>
              ) : (
                <section className="jobs-route">
                  <div className="jobs-route__header">
                    <button className="btn btn-ghost" onClick={openDispatchBoard} type="button">
                      Back to dispatch board
                    </button>
                  </div>

                  <JobDetail
                    error={jobError}
                    job={job}
                    loading={jobLoading}
                    onBackToBoard={openDispatchBoard}
                    onOpenProfile={openUserProfile}
                    onRefresh={refreshJobsAndCurrentJob}
                    token={session.accessToken}
                    currentUser={session.user}
                    isAdmin={isAdmin}
                  />
                </section>
              )
            )}
          </>
        )}
      </main>
    </div>
  );
}
