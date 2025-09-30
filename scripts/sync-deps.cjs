const fs = require('fs');
const path = require('path');

const rootPkg = require('../package.json');
const electronPkgPath = path.join(__dirname, '../electron/package.json');
const electronPkg = require(electronPkgPath);

// Merge dependencies, keeping electron-specific ones
electronPkg.dependencies = {
  ...rootPkg.dependencies,
  ...electronPkg.dependencies
};

// Write back
fs.writeFileSync(electronPkgPath, JSON.stringify(electronPkg, null, 2) + '\n');

console.log('✓ Synced dependencies to electron/package.json');