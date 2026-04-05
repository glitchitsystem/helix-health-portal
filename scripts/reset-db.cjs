const fs = require('fs');
const path = require('path');

const dbPath = path.resolve(__dirname, '..', 'db', 'helix.db');

if (fs.existsSync(dbPath)) {
  fs.rmSync(dbPath, { force: true });
  console.log(`Deleted ${dbPath}`);
} else {
  console.log(`No database file to delete at ${dbPath}`);
}
