import assert from 'node:assert/strict';
import { databaseConfig } from '../src/lib/database-config.ts';

assert.throws(() => databaseConfig({}), /required/);
assert.throws(() => databaseConfig({ TURSO_DATABASE_URL: 'file:test.db', VERCEL: '1' }), /restricted/);
assert.throws(() => databaseConfig({ TURSO_DATABASE_URL: 'file:test.db', NODE_ENV: 'production' }), /restricted/);
assert.throws(() => databaseConfig({ TURSO_DATABASE_URL: 'http://example.invalid', TURSO_AUTH_TOKEN: 'test-only' }), /secure/);
assert.throws(() => databaseConfig({ TURSO_DATABASE_URL: 'libsql://example.invalid' }), /TOKEN/);
assert.deepEqual(databaseConfig({ TURSO_DATABASE_URL: 'file:test.db' }), { url: 'file:test.db' });
assert.deepEqual(databaseConfig({ TURSO_DATABASE_URL: 'libsql://example.invalid', TURSO_AUTH_TOKEN: 'test-only' }), {
  url: 'libsql://example.invalid', authToken: 'test-only',
});
console.log('PASS: database configuration guards (no network or database writes).');
