import type { SessionUser, UserRecord } from '../types';

type DisplayUser = Pick<SessionUser, 'firstName' | 'lastName' | 'email'> | Pick<UserRecord, 'firstName' | 'lastName' | 'email'> | null | undefined;

type DisplayMode = 'full' | 'compact';

export function formatUserDisplayName(user: DisplayUser, fallback = 'Unknown User', mode: DisplayMode = 'full') {
  // Format user name.
  if (!user) return fallback;
  const firstName = user.firstName?.trim();
  const lastName = user.lastName?.trim();
  if (firstName && lastName) {
    return mode === 'compact'
      ? `${firstName} ${lastName.charAt(0).toUpperCase()}.`
      : `${firstName} ${lastName}`;
  }

  if (firstName) {
    return firstName;
  }

  if (user.email) {
    const [localPart] = user.email.split('@');
    const parts = localPart.split(/[._-]+/).filter(Boolean);
    const normalizedFirst = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase() : null;
    const normalizedLastFull = parts[1] ? parts[1].charAt(0).toUpperCase() + parts[1].slice(1).toLowerCase() : null;
    if (normalizedFirst && normalizedLastFull) {
      return mode === 'compact'
        ? `${normalizedFirst} ${normalizedLastFull.charAt(0).toUpperCase()}.`
        : `${normalizedFirst} ${normalizedLastFull}`;
    }
    if (normalizedFirst) {
      return normalizedFirst;
    }
  }

  return user.email || fallback;
}