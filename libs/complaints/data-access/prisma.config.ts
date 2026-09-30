import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 reads the connection URL here rather than from the schema. `DATABASE_URL` is
 * optional on purpose: `prisma generate` needs no database, so a clean clone (and CI without
 * Docker) can generate the client and build. Commands that do need one (`migrate deploy`)
 * fail with Prisma's own message when it is unset. Nx loads the root `.env` into its tasks.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env['DATABASE_URL'] },
});
