import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { ensureSchema } from './ddl';

export * from './schema';
export * from './service';
export { ensureSchema };

export type Db = BetterSQLite3Database<typeof schema>;

/**
 * Open a database and make sure the schema exists (CREATE TABLE IF NOT
 * EXISTS). M0 uses boot-time DDL; drizzle-kit generated migrations replace
 * this in M1 — see README note.
 */
export function openDatabase(path = ':memory:'): Db {
  const raw = new Database(path);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  raw.exec(ensureSchema);
  return drizzle(raw, { schema });
}
