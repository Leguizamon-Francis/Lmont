/**
 * Datos iniciales. Se puede correr varias veces sin duplicar nada.
 *   ADMIN_USUARIO / ADMIN_PASSWORD: usuario para entrar al sistema.
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../src/db.js';

async function main() {
  const usuario = process.env.ADMIN_USUARIO ?? 'lmont';
  const password = process.env.ADMIN_PASSWORD;

  const existe = await prisma.usuario.findUnique({ where: { usuario } });
  if (existe) {
    console.log(`El usuario "${usuario}" ya existe, no se modifica.`);
  } else {
    if (!password || password.length < 8) {
      throw new Error('Definí ADMIN_PASSWORD (mínimo 8 caracteres) para crear el usuario inicial.');
    }
    await prisma.usuario.create({
      data: { usuario, nombre: "L'Mont", passwordHash: await bcrypt.hash(password, 12) },
    });
    console.log(`Usuario "${usuario}" creado.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
