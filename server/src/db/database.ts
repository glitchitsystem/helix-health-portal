/**
 * SQLite database singleton using better-sqlite3.
 * Initialises the schema on first connection and provides a single shared
 * Database instance throughout the server process.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.resolve(__dirname, '../../../db/helix.db');
const SCHEMA_PATH = path.resolve(__dirname, '../../../db/schema.sql');

let _db: Database.Database | null = null;

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

  // Apply schema (idempotent — uses IF NOT EXISTS everywhere)
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  _db.exec(schema);

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
