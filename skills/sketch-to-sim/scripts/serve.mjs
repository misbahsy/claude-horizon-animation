#!/usr/bin/env node
// Open a machine live in a browser: the tour in real time and a working sandbox.
//   node scripts/serve.mjs <project>/machine.js [--port 5178]
import { resolve, dirname, basename } from 'node:path';
import { serve } from './lib/server.mjs';
const file = process.argv[2]; const pi = process.argv.indexOf('--port');
if (!file) { console.error('usage: serve.mjs <machine.js> [--port 5178]'); process.exit(1); }
const srv = await serve(dirname(resolve(file)), pi > 0 ? Number(process.argv[pi + 1]) : 5178);
console.log(`http://127.0.0.1:${srv.address().port}/engine/index.html?machine=/project/${basename(file)}`);
