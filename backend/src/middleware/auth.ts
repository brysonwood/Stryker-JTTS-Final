import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me';

// Only allow through users with one of the given roles.
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(user.role)) return res.status(403).json({ error: 'Insufficient permissions' });
    return next();
  };
}

// Verify the Bearer token and attach user info to req.user.
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization || '';
  const match = auth.match(/^Bearer (.+)$/);
  if (!match) return res.status(401).json({ error: 'Authorization header required' });
  const token = match[1];
  try {
    const payload: any = jwt.verify(token, JWT_SECRET);
    // Attach user info for downstream handlers.
    (req as any).user = { id: payload.userId, role: payload.role, email: payload.email, firstName: payload.firstName, lastName: payload.lastName };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export default requireAuth;
