#!/usr/bin/env node
/**
 * Find and download public-domain images for a reel, logging where each came from.
 *
 *   node scripts/source.mjs <project>/media --from met --q "lace" --medium Textiles --n 6
 *   node scripts/source.mjs <project>/media --from aic --q "porcelain plate" --n 6
 *   node scripts/source.mjs <project>/media --from nasa --q "earth limb" --n 6
 *   node scripts/source.mjs <project>/media --from commons --q "Zea mays stem cross section" --n 6
 *
 * Only public domain and CC0 files are kept. --allow-by also accepts CC BY and
 * CC BY-SA from Wikimedia Commons, which then need the credit line printed by
 * render.mjs wherever the video is posted.
 *
 * Every file lands as <source>-<id>.jpg next to credits.json, which records the
 * title, creator, licence, object page and the query that found it. render.mjs
 * reads that file to write the credits for the shots a film actually uses.
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const UA = 'horizon-reel/0.1 (+https://github.com/misbahsy/claude-horizon-animation)';

function parseArgs(argv) {
  const out = { n: 6, from: null, q: null, dir: null, allowBy: false, width: 2400, medium: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from') out.from = argv[++i];
    else if (a === '--q') out.q = argv[++i];
    else if (a === '--n') out.n = Number(argv[++i]);
    else if (a === '--width') out.width = Number(argv[++i]);
    else if (a === '--allow-by') out.allowBy = true;
    else if (a === '--medium') out.medium = argv[++i];
    else if (a.startsWith('--')) throw new Error(`unknown flag ${a}`);
    else out.dir = a;
  }
  if (!out.dir || !out.from || !out.q) {
    throw new Error('usage: source.mjs <media-dir> --from met|aic|nasa|commons --q "query" [--n 6] [--allow-by]');
  }
  return out;
}

async function json(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`${r.status} from ${url}`);
  return r.json();
}

// Downloads go through curl, which every museum CDN here accepts. The Art
// Institute's image server also wants its own AIC-User-Agent header and answers
// 403 without it.
async function download(url, path) {
  let type;
  try {
    type = execFileSync('curl', ['-sSL', '--fail', '-m', '60', '-A', UA, '-H', `AIC-User-Agent: ${UA}`, '-o', path, '-w', '%{content_type}', url]).toString();
  } catch (e) {
    throw new Error(`download failed for ${url}: ${(e.stderr || e.message).toString().trim()}`);
  }
  if (!/image\/(jpeg|png|webp)/.test(type)) throw new Error(`not an image (${type}) at ${url}`);
}

const strip = (s = '') => String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/* The Met: Open Access objects are CC0 and flagged isPublicDomain. */
async function* met(q, medium) {
  // --medium narrows the search to one Met classification (Ceramics, Textiles,
  // Glass, Minerals...), which keeps a query like "plate" off the furniture.
  const m = medium ? `&medium=${encodeURIComponent(medium)}` : '';
  const s = await json(`https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true${m}&q=${encodeURIComponent(q)}`);
  for (const id of s.objectIDs || []) {
    let o;
    try { o = await json(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`); } catch { continue; }
    if (!o.isPublicDomain || !o.primaryImage) continue;
    yield {
      id: String(id), image: o.primaryImage, title: o.title, creator: o.artistDisplayName || o.culture || '',
      date: o.objectDate, license: 'CC0 (The Met Open Access)', page: o.objectURL,
    };
  }
}

/* Art Institute of Chicago: public-domain works are CC0; images come through IIIF. */
async function* aic(q, width) {
  const url = `https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(q)}&limit=60`
    + '&query[term][is_public_domain]=true&fields=id,title,image_id,artist_display,date_display';
  const s = await json(url);
  for (const a of s.data || []) {
    if (!a.image_id) continue;
    // AIC serves up to 843px openly and larger sizes for most public-domain works.
    yield {
      id: String(a.id),
      image: `https://www.artic.edu/iiif/2/${a.image_id}/full/${Math.min(width, 1686)},/0/default.jpg`,
      fallback: `https://www.artic.edu/iiif/2/${a.image_id}/full/843,/0/default.jpg`,
      title: a.title, creator: a.artist_display || '', date: a.date_display,
      license: 'CC0 (Art Institute of Chicago)', page: `https://www.artic.edu/artworks/${a.id}`,
    };
  }
}

/* NASA Image and Video Library: NASA media is generally not copyrighted in the US.
   Items credited to a non-NASA party are skipped. */
async function* nasa(q) {
  const s = await json(`https://images-api.nasa.gov/search?q=${encodeURIComponent(q)}&media_type=image`);
  for (const item of s.collection?.items || []) {
    const d = item.data?.[0];
    if (!d) continue;
    const credit = `${d.photographer || ''} ${d.secondary_creator || ''} ${d.description || ''}`;
    if (/©|copyright|courtesy of (?!nasa)/i.test(credit)) continue;
    let files;
    try { files = await json(item.href); } catch { continue; }
    const pick = files.find((f) => /~large\.jpg$/i.test(f)) || files.find((f) => /~orig\.jpg$/i.test(f)) || files.find((f) => /~medium\.jpg$/i.test(f));
    if (!pick) continue;
    yield {
      id: d.nasa_id, image: pick.replace(/^http:/, 'https:'), title: d.title, creator: d.center ? `NASA ${d.center}` : 'NASA',
      date: d.date_created?.slice(0, 10), license: 'Public domain (NASA media usage guidelines)',
      page: `https://images.nasa.gov/details/${encodeURIComponent(d.nasa_id)}`,
    };
  }
}

/* Wikimedia Commons: filtered on the licence in each file's own metadata. */
async function* commons(q, width, allowBy) {
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search'
    + `&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=40`
    + `&prop=imageinfo&iiprop=url|extmetadata|mime|size&iiurlwidth=${width}`;
  const s = await json(url);
  const pages = Object.values(s.query?.pages || {}).sort((a, b) => a.index - b.index);
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii || !/image\/(jpeg|png)/.test(ii.mime)) continue;
    const m = ii.extmetadata || {};
    const lic = strip(m.LicenseShortName?.value);
    const pd = /public domain|^pd|cc0/i.test(lic);
    const by = /^cc[ -]by/i.test(lic);
    if (!pd && !(allowBy && by)) continue;
    yield {
      id: String(p.pageid), image: (ii.thumburl || ii.url).split("?")[0], title: p.title.replace(/^File:/, ''),
      creator: strip(m.Artist?.value), date: strip(m.DateTimeOriginal?.value).slice(0, 10),
      license: lic, attribution_required: !pd, page: ii.descriptionurl,
    };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = resolve(args.dir);
  mkdirSync(dir, { recursive: true });
  const creditsPath = join(dir, 'credits.json');
  const credits = existsSync(creditsPath) ? JSON.parse(readFileSync(creditsPath, 'utf8')) : [];
  const have = new Set(credits.map((c) => c.file));

  const gen = { met: () => met(args.q, args.medium), aic: () => aic(args.q, args.width), nasa: () => nasa(args.q), commons: () => commons(args.q, args.width, args.allowBy) }[args.from];
  if (!gen) throw new Error(`--from must be met, aic, nasa or commons`);

  let got = 0;
  for await (const c of gen()) {
    if (got >= args.n) break;
    const file = `${args.from}-${c.id.replace(/[^\w.-]+/g, '_')}.jpg`;
    if (have.has(file)) continue;
    try {
      await download(c.image, join(dir, file));
    } catch (e) {
      if (!c.fallback) { console.warn(`  skip ${file}: ${e.message}`); continue; }
      try { await download(c.fallback, join(dir, file)); } catch (e2) { console.warn(`  skip ${file}: ${e2.message}`); continue; }
    }
    const { fallback, ...rest } = c;
    credits.push({ file, source: args.from, query: args.q, ...rest });
    have.add(file);
    got++;
    console.log(`  ${file}  ${strip(c.title).slice(0, 70)}  [${c.license}]`);
  }
  writeFileSync(creditsPath, JSON.stringify(credits, null, 2));
  console.log(`${got} new from ${args.from} for "${args.q}"; ${credits.length} in ${creditsPath}`);
}

main().catch((e) => { console.error(`source failed: ${e.message}`); process.exit(1); });
