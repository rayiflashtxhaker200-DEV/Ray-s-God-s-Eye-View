import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const nodeModulesDir = path.join(root, 'node_modules');

if (fs.existsSync(nodeModulesDir)) {
  const removeTargets = [
    path.join(nodeModulesDir, 'cesium', 'Build', 'CesiumUnminified'),
    path.join(nodeModulesDir, 'hls.js', 'dist', 'hls-demo.js'),
    path.join(nodeModulesDir, '.vite'),
  ];

  for (const target of removeTargets) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
    } catch {}
  }

  const STRIP_SUFFIXES = ['.map', '.d.ts', '.d.mts', '.tsbuildinfo'];
  const stack = [nodeModulesDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (
        entry.isFile() &&
        STRIP_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))
      ) {
        try {
          fs.unlinkSync(full);
        } catch {}
      }
    }
  }
}
