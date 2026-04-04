// Load Prisma env.
import '../env';
import { PrismaClient } from '@prisma/client';

// Create Prisma client.
const prisma = new PrismaClient();

export default prisma;
