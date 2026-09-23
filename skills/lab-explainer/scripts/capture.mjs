#!/usr/bin/env node
// Render a film frame by frame.
//   node scripts/capture.mjs <project>/film.js <out>.png --stills 1,9,20 [--cols 3]   tiled stills (seconds)
//   node scripts/capture.mjs <project>/film.js <out>.png --at 17.2                     one full-size frame
//   node scripts/capture.mjs <project>/film.js <out>.mp4 --video [--fps 60] [--from s --to s] [--crf 17]
// Add --coc to see the blur-size pass instead of the picture (white = more blur).
// Frames are seeked, never recorded in real time, so every render is identical.
import { chromium } from 'playwright-core';
import { writeFileSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { serve } from './lib/server.mjs';

const a = process.argv.slice(2), opt = { fps: 60, from: 0, to: null, crf: 17, cols: 3 };
const pos = [];
for (let i = 0; i < a.length; i++) {
  const k = a[i];
  if (k === '--stills') opt.stills = a[++i].split(',').map(Number);
  else if (k === '--at') opt.at = Number(a[++i]);
  else if (k === '--video') opt.video = true;
  else if (k === '--coc') opt.coc = true;
  else if (['--fps', '--from', '--to', '--crf', '--cols'].includes(k)) opt[k.slice(2)] = Number(a[++i]);
  else pos.push(k);
}
const [filmFile, outArg] = pos;
if (!filmFile || !outArg) { console.error('usage: capture.mjs <film.js> <out> [--stills s,s | --at s | --video] [--fps 60]'); process.exit(1); }
const out = resolve(outArg), project = dirname(resolve(filmFile));
const srv = await serve(project);
const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--font-render-hinting=none', '--force-color-profile=srgb'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const problems = [];
page.on('pageerror', (e) => problems.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); else if (m.type() === 'log') console.log('  page:', m.text()); });
await page.goto(`http://127.0.0.1:${srv.address().port}/engine/index.html?capture=1&film=/project/${basename(filmFile)}${opt.coc ? '&coc=1' : ''}`);
await page.waitForFunction(() => window.tourReady || window.__failed, null, { timeout: 180000 }).catch((e) => problems.push(String(e)));
const failed = await page.evaluate(() => window.__failed);
const info = await page.evaluate(() => window.tourInfo);
if (!info || failed) { console.error('page did not start:\n  ' + [failed, ...problems].filter(Boolean).join('\n  ')); await browser.close(); srv.close(); process.exit(1); }
const shot = async (s, type = 'png') => { await page.evaluate((ms) => window.seek(ms), s * 1000); return page.screenshot(type === 'png' ? { type } : { type, quality: 95 }); };
try {
  if (opt.at != null) { writeFileSync(out, await shot(opt.at)); console.log(out); }
  else if (opt.stills) {
    const dir = mkdtempSync(join(tmpdir(), 'lab-'));
    for (const [i, s] of opt.stills.entries()) writeFileSync(join(dir, `s${String(i).padStart(3, '0')}.png`), await shot(s));
    const cols = Math.min(opt.cols, opt.stills.length), rows = Math.ceil(opt.stills.length / cols);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '1', '-i', join(dir, 's%03d.png'), '-vf', `scale=${cols > 2 ? 853 : 1280}:-2,tile=${cols}x${rows}:padding=3`, '-frames:v', '1', out]);
    rmSync(dir, { recursive: true, force: true });
    console.log(`${out}  at ${opt.stills.join(' ')}  (film ${info.duration}s; shots ${info.shots.map(([n, s]) => `${n}@${s}`).join(' ')})`);
  } else if (opt.video) {
    const to = opt.to ?? info.duration, n = Math.round((to - opt.from) * opt.fps);
    const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(opt.fps), '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', String(opt.crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((r, j) => ff.on('close', (c) => (c ? j(new Error('ffmpeg ' + c)) : r())));
    const t0 = Date.now();
    for (let i = 0; i < n; i++) {
      const buf = await shot(opt.from + i / opt.fps, 'jpeg');
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      if (i % Math.ceil(n / (process.stdout.isTTY ? 25 : 5)) === 0) process.stdout.write(`${process.stdout.isTTY ? '\r' : ''}  ${i}/${n} frames  ${((Date.now() - t0) / 1000).toFixed(0)}s${process.stdout.isTTY ? '' : '\n'}`);
    }
    ff.stdin.end(); await done;
    console.log(`\n${out}  ${n} frames @${opt.fps}  ${(statSync(out).size / 1e6).toFixed(1)}MB`);
  }
} finally { await browser.close(); srv.close(); }
if (problems.length) { console.error('problems:\n  ' + [...new Set(problems)].slice(0, 20).join('\n  ')); process.exitCode = 1; }
