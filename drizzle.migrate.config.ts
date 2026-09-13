import { defineConfig } from 'drizzle-kit';
import { databaseConfig } from './src/lib/database-config';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'turso',
  dbCredentials: databaseConfig(),
});
