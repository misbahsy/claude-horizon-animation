#!/usr/bin/env node
// Print what the film says, second by second, without rendering anything:
// the shot, every parameter, each stat and the sentence. This is where the
// numbers get checked against the formula before any frame is drawn.
//   node scripts/check.mjs <project>/film.js [--every 1] [--at 3,7.5]
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createTimeline } from '../engine/src/timeline.js';

const a = process.argv.slice(2);
const file = a.find((x) => !x.startsWith('--') && !/^[\d.,]+$/.test(x));
if (!file) { console.error('usage: check.mjs <film.js> [--every 1] [--at 3,7.5]'); process.exit(1); }
const every = Number(a[a.indexOf('--every') + 1]) || 1, at = a.includes('--at') ? a[a.indexOf('--at') + 1].split(',').map(Number) : null;
const film = await import(pathToFileURL(resolve(file)).href);
const tl = createTimeline(film.params, film.story);
const val = (x, s) => (typeof x === 'function' ? x(s) : x);
const strip = (h) => String(h).replace(/<[^>]+>/g, '');
const times = at || Array.from({ length: Math.floor(film.story.duration / every) + 1 }, (_, i) => +(i * every).toFixed(3)).filter((t) => t < film.story.duration);
for (const t of times) {
  const s = tl.stateAt(t); s.d = film.derive ? film.derive(s.p, s) : {};
  const p = Object.entries(s.p).map(([k, v]) => `${k}=${+v.toFixed(3)}`).join(' ');
  const st = (film.ui?.stats || []).map((x) => `${x.label}: ${val(x.value, s)}`).join(' | ');
  console.log(`${t.toFixed(2).padStart(6)}s  ${s.shot.id.padEnd(2)} ${p}\n         ${st}\n         ${film.ui?.explain ? strip(film.ui.explain(s)) : ''}`);
}
