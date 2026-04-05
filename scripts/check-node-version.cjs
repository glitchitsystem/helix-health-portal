const [majorString] = process.versions.node.split('.');
const major = Number(majorString);
const supportedMajors = new Set([18, 20]);

if (supportedMajors.has(major)) {
  process.exit(0);
}

console.error('');
console.error('Unsupported Node.js version for helix-health-portal.');
console.error(`Detected: ${process.versions.node}`);
console.error('Supported majors: 18.x or 20.x');
console.error('');
console.error(
  'This project uses better-sqlite3, which can fail to install on Windows under newer Node versions unless native build tools are installed.'
);
console.error('Use Node 20 LTS for the smoothest setup in this repo.');
console.error('');
console.error('Examples:');
console.error('  nvm use 20');
console.error('  nvm install 20');
console.error('');
process.exit(1);
