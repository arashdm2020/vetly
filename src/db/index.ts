import 'server-only';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { databaseConfig } from '@/lib/database-config';
import * as schema from './schema';

function connect() {
  const client = createClient(databaseConfig());
  return drizzle(client, { schema, logger: false });
}

let database: ReturnType<typeof connect> | undefined;

// Lazy initialization: builds must not connect to or migrate production databases.
export function getDatabase() {
  database ??= connect();
  return database;
}
