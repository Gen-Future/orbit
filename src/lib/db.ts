import { PrismaClient } from '@prisma/client';
const globalDb = globalThis as unknown as { orbitDb?: PrismaClient };
export const db = globalDb.orbitDb ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalDb.orbitDb = db;
