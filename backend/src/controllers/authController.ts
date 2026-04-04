import { Request, Response } from 'express';
import prisma from '../services/prismaClient';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'change-me-refresh';

// Handle login.
export async function login(req: Request, res: Response) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  if (user.disabled) return res.status(403).json({ error: 'User disabled' });

  const ok = bcrypt.compareSync(password, user.password);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const accessToken = jwt.sign({ userId: user.id, role: user.role, email: user.email, firstName: user.firstName, lastName: user.lastName }, JWT_SECRET, { expiresIn: '8h' });
  const refreshToken = jwt.sign({ userId: user.id }, REFRESH_SECRET, { expiresIn: '7d' });
  return res.json({ accessToken, refreshToken, user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role } });
}

// Handle refresh.
export async function refresh(req: Request, res: Response) {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });
  try {
    const payload: any = jwt.verify(refreshToken, REFRESH_SECRET);
    if (!payload || !payload.userId) return res.status(401).json({ error: 'Invalid refresh token' });
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || user.disabled) return res.status(401).json({ error: 'Invalid user' });
    const accessToken = jwt.sign({ userId: user.id, role: user.role, email: user.email, firstName: user.firstName, lastName: user.lastName }, JWT_SECRET, { expiresIn: '8h' });
    return res.json({ accessToken, user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role } });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
}

// Handle logout.
export async function logout(req: Request, res: Response) {
  return res.status(204).send();
}

export default { login, refresh, logout };
