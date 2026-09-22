#!/usr/bin/env node
/**
 * Contact sheet of every candidate image in a media folder, labelled with its
 * file name, so you can look at the options before writing a shot list.
 *
 *   node scripts/sheet.mjs <project>/media out/candidates.png [--cols 6] [--match met-]
 *
 * Large folders are split across pages: candidates-1.png, candidates-2.png...
 */
import { chromium } from 'playwright-core';
import { readdirSync, readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const opt = { cols: 6, match: '', per: 36 };
const pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--cols') opt.cols = Number(argv[++i]);
  else if (argv[i] === '--match') opt.match = argv[++i];
  else if (argv[i] === '--per') opt.per = Number(argv[++i]);
  else pos.push(argv[i]);
}
const [dirArg, outArg] = pos;
if (!dirArg || !outArg) { console.error('usage: sheet.mjs <media-dir> <out.png> [--cols 6] [--match prefix]'); process.exit(1); }
const dir = resolve(dirArg);
const credits = existsSync(join(dir, 'credits.json')) ? JSON.parse(readFileSync(join(dir, 'credits.json'), 'utf8')) : [];
const title = Object.fromEntries(credits.map((c) => [c.file, c.title]));
const files = readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f) && f.includes(opt.match)).sort();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1000 } });
for (let p = 0; p * opt.per < files.length; p++) {
  const chunk = files.slice(p * opt.per, (p + 1) * opt.per);
  const cell = Math.floor(1920 / opt.cols);
  const html = `<!doctype html><style>
    body{margin:0;background:#111;font:12px/1.3 ui-monospace,Menlo,monospace;color:#ddd;display:grid;grid-template-columns:repeat(${opt.cols},${cell}px)}
    figure{margin:0;padding:6px;box-sizing:border-box;height:${Math.round(cell * 0.78)}px;display:flex;flex-direction:column}
    img{flex:1;min-height:0;width:100%;object-fit:contain;background:#222}
    figcaption{padding-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    b{color:#fff;font-weight:600}</style>
    ${chunk.map((f) => `<figure><img src="${pathToFileURL(join(dir, f)).href}"><figcaption><b>${f}</b> ${(title[f] || '').replace(/</g, '&lt;')}</figcaption></figure>`).join('')}`;
  // A page built with setContent is about:blank and may not load file:// images,
  // so the sheet is written to disk and opened from there.
  const tmp = mkdtempSync(join(tmpdir(), 'reel-sheet-'));
  writeFileSync(join(tmp, 'sheet.html'), html);
  await page.goto(pathToFileURL(join(tmp, 'sheet.html')).href, { waitUntil: 'load' });
  rmSync(tmp, { recursive: true, force: true });
  const out = files.length > opt.per ? outArg.replace(/\.png$/, `-${p + 1}.png`) : outArg;
  await page.screenshot({ path: out, fullPage: true });
  console.log(`${out}  ${chunk.length} images`);
}
await browser.close();
