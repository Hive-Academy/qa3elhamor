import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { INTEGRATION_DATABASE_URL } from './database-url.js';

/** Applies the committed migrations to the test database, exactly as a deploy would. */
export default function setup(): void {
  const dataAccessRoot = fileURLToPath(
    new URL('../../../libs/complaints/data-access/', import.meta.url)
  );
  execSync('npx prisma migrate deploy', {
    cwd: dataAccessRoot,
    env: { ...process.env, DATABASE_URL: INTEGRATION_DATABASE_URL },
    stdio: 'inherit',
  });
}
