#!/usr/bin/env node
// The live page: node scripts/serve.mjs <project>/film.js [port]. Space pauses, ?t=12 starts at a time.
import { resolve, dirname, basename } from 'node:path';
import { serve } from './lib/server.mjs';
const [file, port] = process.argv.slice(2);
if (!file) { console.error('usage: serve.mjs <film.js> [port]'); process.exit(1); }
const srv = await serve(dirname(resolve(file)), Number(port || 5181));
console.log(`http://127.0.0.1:${srv.address().port}/engine/index.html?film=/project/${basename(file)}`);
