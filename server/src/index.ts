/**
 * Server entry point.
 * Initialises the database and starts the HTTP listener.
 */

import { createApp } from './app';
import { getDb } from './db/database';

const PORT = Number(process.env.PORT ?? 4000);

// Eagerly initialise DB so schema errors surface immediately on startup
getDb();

const app = createApp();

app.listen(PORT, () => {
  console.log(`\n🏥  Helix Health Portal API`);
  console.log(`   Listening on http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV ?? 'development'}`);
  console.log(`   Press Ctrl+C to stop\n`);
});
