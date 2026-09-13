import { defineConfig } from 'drizzle-kit';

// Generation is offline; migrations use the explicitly credentialed config below.
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'turso',
});
