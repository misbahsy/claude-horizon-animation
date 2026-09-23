#!/usr/bin/env node
// Bake runs of a machine headlessly and report what happened: when each
// trigger fired, how long the run took, and the speed of chosen bodies at
// chosen moments. Use it to tune a story's outcomes before rendering anything.
//
//   node scripts/tune.mjs <project>/machine.js                     default parameters
//   node scripts/tune.mjs <project>/machine.js gap=0.04 push=0.5    one variant
//   node scripts/tune.mjs <project>/machine.js --scan gap=0.03:0.08:0.005
//   node scripts/tune.mjs <project>/machine.js --speed ball@dominoes --speed ball2@seesaw
import { loadRapier, loadEngine, loadMachine } from './lib/load.mjs';

const args = process.argv.slice(2);
const file = args.shift();
if (!file) { console.error('usage: tune.mjs <machine.js> [k=v ...] [--scan k=a:b:step] [--speed body@trigger]'); process.exit(1); }
const fixed = {}, speeds = []; let scan = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--scan') { const [k, r] = args[++i].split('='); const [a, b, s] = r.split(':').map(Number); scan = { k, a, b, s }; }
  else if (args[i] === '--speed') speeds.push(args[++i].split('@'));
  else { const [k, v] = args[i].split('='); fixed[k] = Number(v); }
}
const R = await loadRapier();
const { bake, speedAt } = await loadEngine('physics.js');
const machine = await loadMachine(file);
const order = (machine.triggers || []).map((t) => t.id);
const report = (params) => {
  const t0 = performance.now();
  const b = bake(R, machine, params, [0, 0, 0]);
  const steps = order.filter((id) => b.triggers[id] != null);
  const line = order.map((id) => (b.triggers[id] != null ? `${id}@${b.triggers[id].toFixed(2)}` : `${id}:-`)).join('  ');
  const sp = speeds.map(([id, tr]) => (b.triggers[tr] != null ? `${id}@${tr}=${speedAt(b, id, b.triggers[tr] - 0.01).toFixed(2)}m/s` : `${id}@${tr}=n/a`)).join('  ');
  console.log(`${JSON.stringify(b.params)}  steps ${steps.length}/${order.length}  ran ${b.duration.toFixed(2)}s  (${(performance.now() - t0).toFixed(0)}ms)\n    ${line}${sp ? '\n    ' + sp : ''}`);
};
if (scan) for (let v = scan.a; v <= scan.b + 1e-9; v += scan.s) report({ ...fixed, [scan.k]: +v.toFixed(6) });
else report(fixed);
