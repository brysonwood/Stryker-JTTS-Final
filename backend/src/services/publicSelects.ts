// User fields safe to include in API responses - no password.
export const publicUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
  disabled: true,
  createdAt: true,
};
