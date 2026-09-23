// A throwaway static server: /engine/* is this skill's engine (and its
// node_modules), /project/* is the folder holding the machine file.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, join } from 'node:path';
import { SKILL } from './load.mjs';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg' };
export function serve(projectDir, port = 0) {
  return new Promise((ok) => {
    const srv = createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      let root = null, rest = null;
      if (url.startsWith('/engine/node_modules/')) { root = join(SKILL, 'node_modules'); rest = url.slice('/engine/node_modules/'.length); }
      else if (url.startsWith('/engine/')) { root = join(SKILL, 'engine'); rest = url.slice('/engine/'.length); }
      else if (url.startsWith('/project/')) { root = projectDir; rest = url.slice('/project/'.length); }
      else if (url === '/' || url === '') { res.writeHead(302, { Location: '/engine/index.html' }); res.end(); return; }
      const p = root && resolve(root, rest);
      if (!p || !p.startsWith(root) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(readFileSync(p));
    }).listen(port, '127.0.0.1', () => ok(srv));
  });
}
