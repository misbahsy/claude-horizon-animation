#!/usr/bin/env node
/**
 * One-time setup and health check. Safe to re-run; it only does what is missing.
 *
 *   node scripts/setup.mjs
 *
 * Installs playwright-core into this skill (never into the host project), finds
 * or downloads a matching Chromium, checks ffmpeg and curl, and renders the
 * two-second smoke film in examples/smoke to prove the whole path works.
 */
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ok = (m) => console.log(`  ok    ${m}`);
const warn = (m) => console.log(`  warn  ${m}`);
let failed = false;
const fail = (m) => { failed = true; console.log(`  FAIL  ${m}`); };
const step = (m) => console.log(`\n${m}`);

step('node');
const major = Number(process.versions.node.split('.')[0]);
major < 18 ? fail(`node ${process.versions.node}; needs 18 or newer`) : ok(`node ${process.versions.node}`);

step('dependencies');
if (!existsSync(join(ROOT, 'node_modules', 'playwright-core'))) {
  console.log('  installing playwright-core...');
  execSync('npm install --silent --no-audit --no-fund', { cwd: ROOT, stdio: 'inherit' });
}
ok('playwright-core');

step('fonts');
for (const f of ['source-serif-4-variable.woff2', 'newsreader-variable.woff2', 'geist-variable.woff2']) {
  existsSync(join(ROOT, 'assets/fonts', f)) ? ok(f) : fail(`assets/fonts/${f} is missing; see assets/fonts/README.md`);
}

step('chromium');
try {
  const { chromium } = await import('playwright-core');
  let browser;
  try { browser = await chromium.launch(); } catch {
    console.log('  downloading the matching Chromium build (about 95MB, once)...');
    execFileSync('node', [join(ROOT, 'node_modules/playwright-core/cli.js'), 'install', 'chromium'], { stdio: 'inherit' });
    browser = await chromium.launch();
  }
  await browser.close();
  ok('chromium launches');
} catch (e) { fail(`chromium will not launch: ${e.message}`); }

step('tools');
for (const [bin, why] of [['ffmpeg', 'encoding MP4 and GIF (brew install ffmpeg)'], ['curl', 'downloading source images']]) {
  try { execFileSync(bin, [bin === 'ffmpeg' ? '-version' : '--version'], { stdio: 'ignore' }); ok(bin); }
  catch { fail(`${bin} not found; needed for ${why}`); }
}

step('smoke test');
if (!failed) {
  const dir = mkdtempSync(join(tmpdir(), 'horizon-reel-'));
  try {
    const out = join(dir, 'smoke.mp4');
    execFileSync('node', [join(ROOT, 'scripts/render.mjs'), join(ROOT, 'examples/smoke/film.json'), out], { stdio: 'pipe' });
    statSync(out).size > 10000 ? ok('rendered a 2s smoke film') : fail('smoke film is empty');
  } catch (e) {
    fail(`smoke render failed: ${(e.stderr || e.message).toString().trim().split('\n').pop()}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
} else warn('skipped; fix the failures above first');

console.log(failed ? '\nsetup incomplete' : '\nready');
process.exit(failed ? 1 : 0);
