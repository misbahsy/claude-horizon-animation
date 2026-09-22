#!/usr/bin/env node
/**
 * Render a horizon reel.
 *
 *   node scripts/render.mjs <project>/film.json out/reel.mp4            full film
 *   node scripts/render.mjs <project>/film.json out/sheet.png --stills  one frame per shot, tiled
 *   node scripts/render.mjs <project>/film.json out/f.png --at 4200     a single frame at 4.2s
 *
 * Options: --fps 30, --gif (adds a GIF beside the MP4, denoised and sized for
 * GitHub's 10MB limit), --audio track.m4a (muxed, trimmed to the film and
 * faded out over its last 0.6s), --audio-start 9.7 (seconds into the track to begin),
 * --crf 20 (lower is larger and cleaner; film grain makes every step count),
 * --cols 6 for --stills.
 *
 * Frames are captured by seeking, never by recording in real time, so every
 * render of the same film is identical. The page is served over a throwaway
 * localhost server because canvas pixel reads (the colour treatments and the
 * object cut-outs) are blocked on file:// pages.
 *
 * Beside every MP4 it writes <name>.credits.md listing the source and licence
 * of each photograph the film actually uses, from media/credits.json.
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve, extname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

function parseArgs(argv) {
  const o = { fps: null, stills: false, at: null, gif: false, audio: null, audioStart: 0, cols: 6, crf: 20 };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fps') o.fps = Number(argv[++i]);
    else if (a === '--stills') o.stills = true;
    else if (a === '--at') o.at = Number(argv[++i]);
    else if (a === '--gif') o.gif = true;
    else if (a === '--audio') o.audio = argv[++i];
    else if (a === '--audio-start') o.audioStart = Number(argv[++i]);
    else if (a === '--cols') o.cols = Number(argv[++i]);
    else if (a === '--crf') o.crf = Number(argv[++i]);
    else if (a.startsWith('--')) throw new Error(`unknown flag ${a}`);
    else pos.push(a);
  }
  [o.film, o.out] = pos;
  if (!o.film || !o.out) throw new Error('usage: render.mjs <film.json> <out.mp4|out.png> [--stills] [--at ms] [--gif] [--audio f]');
  return o;
}

// /skill/* serves this skill, /project/* serves the folder holding film.json.
function serve(projectDir) {
  return new Promise((res) => {
    const srv = createServer((req, rsp) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const [, mount, ...rest] = url.split('/');
      const root = mount === 'skill' ? SKILL : mount === 'project' ? projectDir : null;
      const path = root && resolve(root, rest.join('/'));
      if (!path || !path.startsWith(root) || !existsSync(path) || statSync(path).isDirectory()) { rsp.writeHead(404); rsp.end(); return; }
      rsp.writeHead(200, { 'Content-Type': TYPES[extname(path).toLowerCase()] || 'application/octet-stream' });
      rsp.end(readFileSync(path));
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

function writeCredits(filmPath, outPath) {
  const film = JSON.parse(readFileSync(filmPath, 'utf8'));
  const used = [...new Set(film.shots.filter((s) => s.src).map((s) => basename(s.src)))];
  if (!used.length) return null;
  const creditsPath = join(dirname(filmPath), 'media', 'credits.json');
  const all = existsSync(creditsPath) ? JSON.parse(readFileSync(creditsPath, 'utf8')) : [];
  const by = Object.fromEntries(all.map((c) => [c.file, c]));
  const lines = ['# Image credits', '', `For ${basename(outPath)}. Every photograph below is public domain or CC0 unless marked otherwise.`, ''];
  const missing = [];
  for (const f of used) {
    const c = by[f];
    if (!c) { missing.push(f); lines.push(`- \`${f}\`: NO RECORD. Find its source before posting.`); continue; }
    const who = c.creator ? `, ${c.creator.replace(/\s*\n\s*/g, '; ')}` : '';
    const when = c.date ? ` (${c.date})` : '';
    lines.push(`- ${c.title}${who}${when}. ${c.license}. ${c.page}${c.attribution_required ? '  **Attribution required.**' : ''}`);
  }
  const out = outPath.replace(/\.\w+$/, '.credits.md');
  writeFileSync(out, lines.join('\n') + '\n');
  return { out, missing };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const filmPath = resolve(o.film), outPath = resolve(o.out);
  const projectDir = dirname(filmPath);
  mkdirSync(dirname(outPath), { recursive: true });

  const srv = await serve(projectDir);
  const port = srv.address().port;
  const film = JSON.parse(readFileSync(filmPath, 'utf8'));
  const [W, H] = film.size || [1920, 1080];
  const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--force-color-profile=srgb'] });
  const problems = [];
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => problems.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
    const rel = relative(projectDir, filmPath).split('\\').join('/');
    await page.goto(`http://127.0.0.1:${port}/skill/assets/reel.html?film=/project/${rel}`);
    await page.waitForFunction(() => window.reelReady || window.reelError, null, { timeout: 180000 });
    const err = await page.evaluate(() => window.reelError);
    if (err) throw new Error(err);
    const info = await page.evaluate(() => window.reelInfo);
    const pageErrors = await page.evaluate(() => window.reelErrors);
    problems.push(...pageErrors);
    const fps = o.fps || info.fps;
    const canvas = page.locator('#reel');
    const grab = async (ms, type = 'png') => { await page.evaluate((t) => window.seek(t), ms); return canvas.screenshot(type === 'png' ? { type } : { type, quality: 95 }); };

    if (o.at != null) {
      writeFileSync(outPath, await grab(o.at));
      console.log(`${basename(outPath)}  frame at ${o.at}ms`);
    } else if (o.stills) {
      const dir = mkdtempSync(join(tmpdir(), 'reel-stills-'));
      for (const s of info.shots) {
        writeFileSync(join(dir, `s${String(s.index).padStart(3, '0')}.png`), await grab(s.start + s.dur * 0.6));
      }
      const rows = Math.ceil(info.shots.length / o.cols);
      execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', '1', '-i', join(dir, 's%03d.png'),
        '-vf', `scale=${Math.round(1920 / o.cols)}:-2,tile=${o.cols}x${rows}:padding=4:color=black`, '-frames:v', '1', outPath]);
      rmSync(dir, { recursive: true, force: true });
      console.log(`${basename(outPath)}  ${info.shots.length} shots, ${(info.duration / 1000).toFixed(2)}s`);
    } else {
      const frames = Math.round((info.duration / 1000) * fps);
      // Frames travel as high-quality JPEG: several times faster to capture than PNG
      // and invisible under the grain once encoded.
      const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', '-'];
      if (o.audio) args.push('-ss', String(o.audioStart), '-i', resolve(o.audio));
      args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', String(o.crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
      if (o.audio) {
        const end = info.duration / 1000;
        args.push('-af', `afade=t=out:st=${Math.max(0, end - 0.6).toFixed(3)}:d=0.6`, '-c:a', 'aac', '-b:a', '192k', '-t', end.toFixed(3));
      }
      args.push(outPath);
      const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
      const done = new Promise((res, rej) => ff.on('close', (c) => (c ? rej(new Error(`ffmpeg exited ${c}`)) : res())));
      process.stdout.write(`  ${frames} frames at ${fps}fps `);
      for (let i = 0; i < frames; i++) {
        const buf = await grab((i * 1000) / fps, 'jpeg');
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
        if (i % Math.ceil(frames / 20) === 0) process.stdout.write('.');
      }
      ff.stdin.end();
      await done;
      process.stdout.write(' done\n');
      console.log(`${basename(outPath)}  ${W}x${H}  ${(info.duration / 1000).toFixed(2)}s @${fps}fps  ${(statSync(outPath).size / 1024).toFixed(0)}KB`);
      if (o.gif) {
        const gif = outPath.replace(/\.\w+$/, '.gif');
        const pal = join(tmpdir(), `reel-pal-${process.pid}.png`);
        execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', outPath, '-vf', 'fps=12,scale=720:-2:flags=lanczos,hqdn3d=6:4:8:6,palettegen=max_colors=160:stats_mode=diff', pal]);
        execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', outPath, '-i', pal, '-lavfi', 'fps=12,scale=720:-2:flags=lanczos,hqdn3d=6:4:8:6[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle', gif]);
        rmSync(pal, { force: true });
        console.log(`${basename(gif)}  ${(statSync(gif).size / 1024).toFixed(0)}KB`);
      }
      const cr = writeCredits(filmPath, outPath);
      if (cr) {
        console.log(`${basename(cr.out)}`);
        if (cr.missing.length) problems.push(`no credit record for: ${cr.missing.join(', ')}`);
      }
    }
  } finally {
    await browser.close();
    srv.close();
  }
  if (problems.length) {
    console.error('\n  problems:');
    for (const p of [...new Set(problems)]) console.error(`    - ${p}`);
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(`render failed: ${e.message}`); process.exit(1); });
