import { PrismaClient } from '../generated/prisma'

// Prisma client'ı oluştur
// Development'ta global olarak cache'le (hot reload sorunlarını önlemek için)
const globalForPrisma = globalThis

export const prisma = globalForPrisma.prisma || new PrismaClient()

// Production'da global'e ekleme
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma