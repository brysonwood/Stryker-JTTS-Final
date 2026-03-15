import type { AuthSession } from '../types';

const SESSION_STORAGE_KEY = 'stryker.session';

export function loadStoredSession() {
  // Load session from localStorage - returns null if nothing is stored.
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

export function persistSession(session: AuthSession) {
  // Save session to localStorage.
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession() {
  // Clear the stored session on logout.
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}