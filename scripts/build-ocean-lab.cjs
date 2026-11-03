// Build this standalone study without requiring the legacy Elm compiler.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
for (const relative of ['ocean-lab/index.html', 'ocean-lab/lab.js', 'assets/ocean-tiling-geometry.js', 'assets/ocean-tessellation.js']) {
  const destination = path.join(root, 'docs', relative);
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  fs.copyFileSync(path.join(root, 'src', relative), destination);
}
console.log('Built ocean study in docs/ocean-lab.');
