// Format display name.
export function formatCompactUserName(user?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null) {
  if (!user) return null;

  const firstName = user.firstName?.trim();
  const lastName = user.lastName?.trim();
  if (firstName && lastName) {
    return `${firstName} ${lastName}`;
  }

  if (firstName) {
    return firstName;
  }

  if (user.email) {
    const [localPart] = user.email.split('@');
    const parts = localPart.split(/[._-]+/).filter(Boolean);
    const normalizedFirst = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase() : null;
    const normalizedLast = parts[1] ? parts[1].charAt(0).toUpperCase() + parts[1].slice(1).toLowerCase() : null;
    if (normalizedFirst && normalizedLast) {
      return `${normalizedFirst} ${normalizedLast}`;
    }
    if (normalizedFirst) {
      return normalizedFirst;
    }
  }

  return user.email || null;
}