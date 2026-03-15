// If this import fails, run: cd backend && npx prisma@5 generate
import '../env';
import { PrismaClient } from '@prisma/client';

// If this throws, run: cd backend && npx prisma@5 generate
const prisma = new PrismaClient();

export default prisma;
