// Build the ocean study and its homepage host without the legacy Elm compiler.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
for (const relative of ['index.html', 'ocean-lab/index.html', 'ocean-lab/lab.js', 'assets/ocean-tiling-geometry.js', 'assets/ocean-tessellation.js', 'assets/ocean-hero.js']) {
  const destination = path.join(root, 'docs', relative);
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  fs.copyFileSync(path.join(root, 'src', relative), destination);
}
console.log('Built ocean tiles, homepage, and study in docs.');
