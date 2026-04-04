import type { AuthSession } from '../types';

const SESSION_STORAGE_KEY = 'stryker.session';

export function loadStoredSession() {
  // Read stored session.
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

export function persistSession(session: AuthSession) {
  // Write stored session.
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession() {
  // Clear stored session.
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}