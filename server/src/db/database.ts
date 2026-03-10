/**
 * SQLite database singleton using better-sqlite3.
 * Initialises the schema on first connection and provides a single shared
 * Database instance throughout the server process.
 *
 * Migrations are applied in numeric order from db/migrations/ on startup.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH        = path.resolve(__dirname, '../../../db/helix.db');
const SCHEMA_PATH    = path.resolve(__dirname, '../../../db/schema.sql');
const MIGRATIONS_DIR = path.resolve(__dirname, '../../../db/migrations');

let _db: Database.Database | null = null;

/**
 * Applies all SQL migration files from db/migrations/ in ascending filename
 * order.  Each file is executed exactly once; re-runs are safe because every
 * statement uses IF NOT EXISTS / ON CONFLICT guards.
 */
function applyMigrations(db: Database.Database): void {
  if (!fs.existsSync(MIGRATIONS_DIR)) return;

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    try {
      db.exec(sql);
    } catch (err) {
      console.error(`[DB] Migration failed: ${file}`, err);
      throw err;
    }
  }
}

/**
 * Returns the singleton Database instance, creating and initialising it on
 * the first call.
 */
export function getDb(): Database.Database {
  if (_db) return _db;

  // Ensure the db directory exists
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  _db = new Database(DB_PATH);

  // Enable WAL mode and foreign keys for every connection
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  // Apply base schema (idempotent — uses IF NOT EXISTS everywhere)
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  _db.exec(schema);

  // Apply migrations in order
  applyMigrations(_db);

  return _db;
}

/**
 * Closes the database connection. Useful in test teardown.
 */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
