#!/usr/bin/env node
// One-time setup and health check. Safe to re-run.
//   node scripts/setup.mjs
// Installs three, Rapier and playwright-core into this skill, finds or
// downloads Chromium, checks ffmpeg, then bakes the example machine and renders
// one frame of it to prove the whole path works.
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failed = false;
const ok = (m) => console.log(`  ok    ${m}`), fail = (m) => { failed = true; console.log(`  FAIL  ${m}`); }, step = (m) => console.log(`\n${m}`);

step('node');
Number(process.versions.node.split('.')[0]) < 18 ? fail(`node ${process.versions.node}; needs 18 or newer`) : ok(`node ${process.versions.node}`);

step('dependencies');
if (!['three', '@dimforge/rapier3d-compat', 'playwright-core'].every((d) => existsSync(join(ROOT, 'node_modules', d)))) {
  console.log('  installing three, rapier and playwright-core...');
  execSync('npm install --silent --no-audit --no-fund', { cwd: ROOT, stdio: 'inherit' });
}
ok('three, @dimforge/rapier3d-compat, playwright-core');

step('fonts');
for (const f of ['geist-variable.woff2', 'geist-mono-variable.woff2', 'gochi-hand.woff2', 'caveat.woff2']) existsSync(join(ROOT, 'engine/fonts', f)) ? ok(f) : fail(`engine/fonts/${f} is missing`);

step('chromium');
try {
  const { chromium } = await import('playwright-core');
  let b;
  try { b = await chromium.launch(); } catch {
    console.log('  downloading the matching Chromium build (about 95MB, once)...');
    execFileSync('node', [join(ROOT, 'node_modules/playwright-core/cli.js'), 'install', 'chromium'], { stdio: 'inherit' });
    b = await chromium.launch();
  }
  await b.close(); ok('chromium launches');
} catch (e) { fail(`chromium will not launch: ${e.message}`); }

step('ffmpeg');
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); ok('ffmpeg'); } catch { fail('ffmpeg not found; needed to encode video (brew install ffmpeg)'); }

step('smoke test');
if (!failed) {
  const ex = join(ROOT, 'examples/rube-goldberg/machine.js');
  try {
    const out = execFileSync('node', [join(ROOT, 'scripts/tune.mjs'), ex, 'gap=0.04'], { encoding: 'utf8' });
    /steps 6\/6/.test(out) ? ok('example machine: all six stages fire') : fail(`example machine did not complete:\n${out}`);
    const dir = mkdtempSync(join(tmpdir(), 'sim-')), png = join(dir, 'frame.png');
    execFileSync('node', [join(ROOT, 'scripts/capture.mjs'), ex, png, '--at', '30', '--dpr', '1'], { stdio: 'pipe' });
    statSync(png).size > 50000 ? ok('rendered a frame') : fail('rendered frame is empty');
    rmSync(dir, { recursive: true, force: true });
  } catch (e) { fail(`smoke test failed: ${(e.stderr || e.stdout || e.message).toString().trim().split('\n').slice(-3).join(' | ')}`); }
}
console.log(failed ? '\nsetup incomplete' : '\nready');
process.exit(failed ? 1 : 0);
