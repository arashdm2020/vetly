// Shared by the runtime and Drizzle CLI; never include credential values in errors.
export function databaseConfig(env: NodeJS.ProcessEnv = process.env) {
  // Keep each URL/token pair together; Vercel's integration-prefixed pair wins.
  const useIntegration = Boolean(env.vetly_TURSO_DATABASE_URL);
  const url = useIntegration ? env.vetly_TURSO_DATABASE_URL : env.TURSO_DATABASE_URL;
  const authToken = useIntegration ? env.vetly_TURSO_AUTH_TOKEN : env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error('TURSO_DATABASE_URL is required.');
  if (url.startsWith('file:')) {
    if (env.VERCEL || env.NODE_ENV === 'production') {
      throw new Error('Local SQLite is restricted to local development.');
    }
    return { url };
  }
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('Invalid database URL.'); }
  if (!['libsql:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('A secure Turso database URL is required.');
  }
  if (!authToken) throw new Error('TURSO_AUTH_TOKEN is required for remote databases.');
  return { url, authToken };
}
