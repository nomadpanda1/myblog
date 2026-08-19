import { copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');

function copyDirectory(source, target) {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source)) {
    const sourcePath = resolve(source, entry);
    const targetPath = resolve(target, entry);
    if (statSync(sourcePath).isDirectory()) copyDirectory(sourcePath, targetPath);
    else copyFileSync(sourcePath, targetPath);
  }
}

// The page still loads a few ordered, global scripts at runtime. Keep them
// as static assets while the Three.js entry remains bundled by Vite.
for (const directory of ['js', 'img', 'font']) {
  copyDirectory(resolve(root, directory), resolve(dist, directory));
}
copyFileSync(resolve(root, 'setting.json'), resolve(dist, 'setting.json'));

console.log('Copied legacy runtime assets and local media.');
