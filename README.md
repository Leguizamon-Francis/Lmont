# L'Mont · Sistema de gestión comercial

App web para el local de ropa L'Mont: productos con variantes y códigos de barras, stock, ventas, promociones, cambios y devoluciones, caja y reportes.

| Parte | Tecnología |
|---|---|
| Frontend (`apps/web`) | React + TypeScript + Vite + Material UI |
| Backend (`apps/api`) | Node + Express + Prisma + PostgreSQL |
| Compartido (`packages/shared`) | Esquemas Zod (validación en formulario y servidor), formato de montos |

## Desarrollo local

Requisitos: Node.js 22 o superior y PostgreSQL 18.

```powershell
npm install
copy apps\api\.env.example apps\api\.env   # completar DATABASE_URL, SESSION_SECRET y ADMIN_PASSWORD
npm run db:migrate                           # crea las tablas
npm run db:seed                              # crea el usuario para entrar
npm run dev                                  # API en :3001 y web en http://localhost:5173
```

Para abrirlo desde el celular en la misma red Wi-Fi, usá la dirección "Network" que muestra Vite (por ejemplo `http://192.168.0.10:5173`).

### Tests

Necesitan `apps/api/.env.test` con una base de prueba cuyo nombre contenga `test` (por ejemplo `lmont_test`). **Los tests borran esa base.**

```powershell
npm test
```

## Producción (Render, ~USD 13/mes)

1. Subir el repositorio a GitHub (privado).
2. En Render: **New > Blueprint** y elegir el repositorio. `render.yaml` crea el servicio web (Starter, USD 7) y la base Postgres 18 (Basic 256 MB, USD 6).
3. Cuando termine el primer deploy, abrir la **Shell** del servicio en Render y crear el usuario:
   ```bash
   ADMIN_USUARIO=lmont ADMIN_PASSWORD='una-clave-segura' npx tsx apps/api/prisma/seed.ts
   ```
4. Cada `git push` a la rama principal vuelve a desplegar. Las migraciones se aplican solas antes de cada deploy.

## Copias de seguridad

- **Render**: la base paga incluye copias automáticas administradas por Render.
- **Backblaze B2** (copia externa, cifrada): `.github/workflows/backup.yml` corre todas las noches a las 04:00.
  1. En Backblaze, crear un bucket **privado** y una *Application Key* con acceso solo a ese bucket.
  2. En el bucket, agregar *Lifecycle rules*: prefijo `diarias/` → borrar a los 30 días; prefijo `mensuales/` → borrar a los 365 días.
  3. En GitHub, cargar los secrets que se listan al principio de `backup.yml`.
  4. Probarlo con **Actions > Backup base de datos > Run workflow**.

  > Guardá `BACKUP_PASSPHRASE` en un lugar seguro: sin ella las copias no se pueden restaurar.

### Restaurar una copia

```bash
gpg --decrypt lmont-AAAA-MM-DD.dump.gpg > lmont.dump
pg_restore --clean --if-exists --no-owner -d "URL_DE_LA_BASE" lmont.dump
```
