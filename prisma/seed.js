import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@ibero.mx';
const password = process.env.SEED_ADMIN_PASSWORD ?? 'password123';
const fullName = process.env.SEED_ADMIN_NAME ?? 'Admin Ibero';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`[seed] El sysadmin ${email} ya existe, no se toca.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  await prisma.user.create({
    data: { email, passwordHash, fullName, isSysadmin: true },
  });
  console.log(`[seed] Sysadmin creado: ${email}`);
}

main()
  .catch((error) => {
    console.error('[seed] Falló el seed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
