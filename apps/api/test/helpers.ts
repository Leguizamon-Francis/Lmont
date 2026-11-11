import bcrypt from 'bcryptjs';
import request from 'supertest';
import { prisma } from '../src/db.js';
import { createApp } from '../src/app.js';

export const USUARIO = 'test';
export const PASSWORD = 'clave-de-prueba';

/** Vacía todas las tablas de la base de prueba. */
export async function limpiarDb() {
  const tablas = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tablas.length) {
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${tablas.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
  }
}

export async function crearUsuario() {
  return prisma.usuario.create({
    data: { usuario: USUARIO, nombre: 'Test', passwordHash: await bcrypt.hash(PASSWORD, 4) },
  });
}

/** Devuelve un agente HTTP con la sesión ya iniciada. */
export async function agenteLogueado() {
  const agent = request.agent(createApp());
  await agent.post('/api/auth/login').send({ usuario: USUARIO, password: PASSWORD }).expect(200);
  return agent;
}
