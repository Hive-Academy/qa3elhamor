// Dev server for apps/web/ocean-text-preview.html on port 4470.
//
// Why not `nx serve web`: the app's siteTemplate plugin (apps/web/src/site-build.ts) only has a
// <head> recipe for index.html and moderation.html and throws for any other page, so the preview
// is served from an inline config with just the React plugin. Same root and public dir.
//
// Usage (from the repo root): node .ptah/specs/ocean-text/tools/serve-preview.mjs
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '../../../../apps/web');
const server = await createServer({
  configFile: false,
  root,
  cacheDir: resolve(root, '../../node_modules/.vite/ocean-text-preview'),
  plugins: [react()],
  server: { port: 4470, strictPort: true, host: 'localhost' },
});
await server.listen();
server.printUrls();
console.log('preview: http://localhost:4470/ocean-text-preview.html');
