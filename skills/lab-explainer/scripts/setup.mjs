#!/usr/bin/env node
// One-time setup: npm dependencies, fonts, Chromium, ffmpeg, and a smoke test
// (the example's numbers, then one rendered frame).
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SKILL } from './lib/server.mjs';

let failed = false;
const step = (t) => console.log(`\n${t}`), ok = (t) => console.log(`  ok    ${t}`), fail = (t) => { console.log(`  FAIL  ${t}`); failed = true; };
step('node modules');
if (!existsSync(join(SKILL, 'node_modules/three')) || !existsSync(join(SKILL, 'node_modules/playwright-core'))) execSync('npm install --no-audit --no-fund --silent', { cwd: SKILL, stdio: 'inherit' });
existsSync(join(SKILL, 'node_modules/three/build/three.module.js')) ? ok('three') : fail('three missing');
step('fonts');
for (const f of ['outfit.woff2', 'jetbrains-mono.woff2']) { const p = join(SKILL, 'engine/fonts', f); existsSync(p) && statSync(p).size > 1000 ? ok(f) : fail(`${f} missing`); }
step('chromium');
try {
  const { chromium } = await import('playwright-core');
  let b;
  try { b = await chromium.launch(); } catch {
    console.log('  downloading Chromium (about 95MB, once)...');
    execFileSync('node', [join(SKILL, 'node_modules/playwright-core/cli.js'), 'install', 'chromium'], { stdio: 'inherit' });
    b = await chromium.launch();
  }
  await b.close(); ok('chromium launches');
} catch (e) { fail(`chromium will not launch: ${e.message}`); }
step('ffmpeg');
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); ok('ffmpeg'); } catch { fail('ffmpeg not found: install it (brew install ffmpeg, apt install ffmpeg)'); }
step('smoke test');
const ex = join(SKILL, 'examples/refraction/film.js');
try { execFileSync('node', [join(SKILL, 'scripts/check.mjs'), ex, '--at', '4'], { stdio: 'pipe' }); ok('example numbers'); } catch (e) { fail(`check failed: ${e.stderr || e.message}`); }
const dir = mkdtempSync(join(tmpdir(), 'lab-setup-'));
try { execFileSync('node', [join(SKILL, 'scripts/capture.mjs'), ex, join(dir, 'f.png'), '--at', '4'], { stdio: 'pipe', timeout: 240000 }); statSync(join(dir, 'f.png')).size > 50000 ? ok('rendered a frame') : fail('frame is empty'); }
catch (e) { fail(`render failed: ${e.stderr || e.message}`); }
rmSync(dir, { recursive: true, force: true });
console.log(failed ? '\nsetup incomplete' : '\nready');
process.exitCode = failed ? 1 : 0;
