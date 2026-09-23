#!/usr/bin/env node
// The soundtrack for a machine's film, synthesised from the same events the
// picture uses: pencil and paper for READ and LIFT, a sound per contact chosen
// by the materials that touched, a rewind, slowed sounds in the replay, the
// sandbox session, UI clicks, chapter plucks and a soft pad underneath.
//   node scripts/sound.mjs <project>/machine.js out/film.wav
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { serve } from './lib/server.mjs';

const [file, outArg] = process.argv.slice(2);
if (!file || !outArg) { console.error('usage: sound.mjs <machine.js> <out.wav>'); process.exit(1); }
const srv = await serve(dirname(resolve(file)));
const b = await chromium.launch({ args: ['--use-angle=metal'] });
const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
await pg.goto(`http://127.0.0.1:${srv.address().port}/engine/index.html?capture=1&dpr=1&machine=/project/${basename(file)}`);
await pg.waitForFunction(() => window.tourReady, null, { timeout: 180000 });
const D = await pg.evaluate(() => window.soundData);
await b.close(); srv.close();

// ---------------------------------------------------------------- events
const { T0, TOUR_LEN, BUILD_AT } = D, LEN = D.VIDEO_LEN, LEAD = 0.6;
const E = [];
const add = (t, type, o = {}) => E.push({ t, type, ...o });
const ch = (name) => D.chapters.find((c) => c.chapter === name);
add(2.8, 'click'); if (D.session) add(T0 + TOUR_LEN + 0.65, 'click');
const read = ch('READ');
if (read) {
  D.read.forEach((s) => { add(T0 + read.start + s + 0.1, 'pencil', { dur: 0.5, gain: 0.9 }); add(T0 + read.start + s + 0.9, 'pencil', { dur: 0.6, gain: 0.45 }); });
  const dimsAt = D.read.length ? D.read[D.read.length - 1] + 1.8 : 1;
  for (let i = 0; i < D.dims; i++) add(T0 + read.start + dimsAt + i * 0.35, 'pencil', { dur: 0.55, gain: 0.5 });
}
const lift = ch('LIFT');
if (lift) {
  for (let k = 0; k < 12; k++) add(T0 + lift.start + 0.5 + k * 0.17, 'flick', { gain: 0.5 });
  add(T0 + lift.start + 0.3, 'whoosh', { dur: 1.8, gain: 0.55 }); add(T0 + lift.start + 2.6, 'whoosh', { dur: 1.5, gain: 0.35 });
  for (let k = 0; k < D.groups; k++) add(T0 + lift.start + 4.7 + k * 0.32, 'tick', { gain: 0.5 });
}
// a contact's sound comes from what touched: a bell rings, metal on wood knocks,
// wood on wood clacks, anything landing on the paper thuds
const METAL = new Set(['steel', 'iron', 'brass', 'copper']);
function kind(e) {
  if (e.sa === 'bell' || e.sb === 'bell') return 'bell';
  if (e.a === 'ground' || e.b === 'ground') return 'thud';
  const ma = METAL.has(e.ma), mb = METAL.has(e.mb);
  return ma && mb ? 'clink' : ma || mb ? 'knock' : 'clack';
}
// Contacts arrive every physics step while two things press together, so a
// sound fires only at an onset: the first event after the pair was apart, or
// a sudden jump in force (a re-strike). Resting contacts stay silent.
function onsets(events, { gap = 0.07 } = {}) {
  const st = new Map(), out = [];
  for (const e of events) {
    if (e.type !== 'contact') continue;
    const key = [e.ra || e.a, e.rb || e.b].sort().join('|'), s = st.get(key);
    const fresh = !s || e.t - s.t > 0.03, jump = s && e.force > s.level * 2.5 && e.force > 2 && e.t - s.fired > gap;
    if ((fresh && (!s || e.t - s.fired > gap)) || jump) { out.push(e); st.set(key, { t: e.t, level: e.force, fired: e.t }); }
    else st.set(key, { t: e.t, level: Math.max(e.force, (s?.level || 0) * 0.95), fired: s?.fired ?? -1 });
  }
  return out;
}
function contacts(events, at, { from = -1, to = 1e9, slow = false, gap = 0.07 } = {}) {
  for (const e of onsets(events, { gap })) if (e.t >= from && e.t <= to) add(at(e.t), kind(e), { force: e.force, slow });
}
for (const c of D.chapters) {
  const s = T0 + c.start;
  if (c.run) { add(s + LEAD, 'start'); contacts(D.runs[c.name].events, (t) => s + LEAD + t); }
  if (c.chapter === 'TWEAK') add(s + 0.1, 'rewind', { dur: 1.3 });
  if (c.chapter === 'REPLAY') { add(s, 'whoosh', { dur: 1.2, gain: 0.5, low: true }); const sp = c.speed ?? 0.25; contacts(D.runs[c.of].events, (t) => s + (t - c.from) / sp, { from: c.from, to: c.from + (c.dur - 0.8) * sp, slow: true, gap: 0.3 }); }
  add(s, 'pluck', { f: [392, 440, 523.25, 587.33, 659.25, 523.25, 440, 392][D.chapters.indexOf(c) % 8] });
}
if (D.session) {
  const B = T0 + BUILD_AT;
  add(B + 0.1, 'pluck', { f: 440 });
  for (const e of D.session.events) if (e.type === 'start') add(B + e.t, 'start');
  for (const e of onsets(D.session.events.map((e) => ({ ...e, t: e.t })), { gap: 0.07 })) add(B + e.t, kind(e), { force: e.force, slow: e.slow });
  for (const s of D.session.script) if (['run', 'reset', 'slowmo', 'trails', 'view'].includes(s.do)) add(B + s.t, 'click');
}

// ------------------------------------------------------------- synthesis
const SR = 48000, N = Math.ceil(LEN * SR);
const L = new Float32Array(N), R = new Float32Array(N);
let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const db = (d) => Math.pow(10, d / 20);
function biquad(type, f, q) {
  const w = (2 * Math.PI * f) / SR, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'bp') { b0 = a; b1 = 0; b2 = -a; } else if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; } else { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
  a0 = 1 + a; a1 = -2 * c; a2 = 1 - a;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => { const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
}
function put(t, buf, gain, pan = 0) {
  const i0 = Math.round(t * SR), gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  for (let i = 0; i < buf.length; i++) { const j = i0 + i; if (j < 0 || j >= N) continue; L[j] += buf[i] * gl; R[j] += buf[i] * gr; }
}
const env = (n, a, d) => (i) => (i < a ? i / a : Math.exp(-(i - a) / d));
function modes(freqs, decay, dur, noise = 0.2, pitch = 1) {
  const n = Math.round(dur * SR), out = new Float32Array(n), bp = biquad('bp', 2500 * pitch, 0.7);
  for (let i = 0; i < n; i++) {
    let v = 0; for (const [f, a] of freqs) v += a * Math.sin((2 * Math.PI * f * pitch * i) / SR);
    const e = Math.exp(-i / (decay * SR));
    out[i] = v * e + noise * bp(rnd() * 2 - 1) * Math.exp(-i / (0.006 * SR));
  }
  return out;
}
const SYN = {
  click: () => modes([[3100, 0.6], [5200, 0.3]], 0.006, 0.03, 0.4),
  tick: () => modes([[1300 * (0.95 + rnd() * 0.1), 0.7], [2900, 0.3]], 0.03, 0.12, 0.3),
  pluck: (e) => { const n = Math.round(2.6 * SR), o = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / SR; o[i] = (Math.sin(2 * Math.PI * e.f * t) + 0.35 * Math.sin(4 * Math.PI * e.f * t) + 0.12 * Math.sin(6 * Math.PI * e.f * t)) * Math.exp(-t / 0.7) * Math.min(1, t / 0.004); } return o; },
  pencil: (e) => {
    const n = Math.round(e.dur * SR), o = new Float32Array(n), bp = biquad('bp', 3800, 0.9), hp = biquad('hp', 1500, 0.7);
    let stroke = 0, next = 0, amp = 0;
    for (let i = 0; i < n; i++) { if (i >= next) { stroke = 0.4 + rnd() * 0.6; next = i + Math.round((0.03 + rnd() * 0.07) * SR); } amp += (stroke * (0.6 + 0.4 * Math.sin(i / 90)) - amp) * 0.02; o[i] = hp(bp(rnd() * 2 - 1)) * amp * Math.min(1, i / 400, (n - i) / 800); }
    return o;
  },
  flick: () => { const n = Math.round(0.14 * SR), o = new Float32Array(n), bp = biquad('bp', 1400 + rnd() * 600, 1.1), e = env(n, 180, 0.03 * SR); for (let i = 0; i < n; i++) o[i] = bp(rnd() * 2 - 1) * e(i); return o; },
  whoosh: (e) => { const n = Math.round(e.dur * SR), o = new Float32Array(n); let lp = 0; for (let i = 0; i < n; i++) { const u = i / n, f = e.low ? 0.01 + 0.03 * Math.sin(Math.PI * u) : 0.02 + 0.08 * Math.sin(Math.PI * u); lp += ((rnd() * 2 - 1) - lp) * f; o[i] = lp * Math.sin(Math.PI * u) ** 1.5; } return o; },
  creak: (e) => { const n = Math.round(e.dur * SR), o = new Float32Array(n), bp = biquad('bp', 700, 3); let ph = 0; for (let i = 0; i < n; i++) { const u = i / n, f = 45 + 25 * Math.sin(u * 9) + rnd() * 12; ph += f / SR; const saw = (ph % 1) * 2 - 1; const grit = rnd() < 0.08 ? 1 : 0.35; o[i] = bp(saw * grit) * Math.sin(Math.PI * u) ** 0.7; } return o; },
  start: () => modes([[900, 0.4], [1800, 0.2]], 0.02, 0.1, 0.5),
  rewind: (e) => { const n = Math.round(e.dur * SR), o = new Float32Array(n); let lp = 0, ph = 0; for (let i = 0; i < n; i++) { const u = i / n; ph += (900 - 700 * u) / SR; lp += ((rnd() * 2 - 1) - lp) * 0.05; o[i] = (lp * 0.6 + 0.25 * Math.sin(2 * Math.PI * ph)) * Math.sin(Math.PI * u); } return o; },
  bell: (e) => { const p = e.slow ? 0.6 : 1, n = Math.round((e.slow ? 3.2 : 2.2) * SR), o = new Float32Array(n); const parts = [[1, 1], [2.76, 0.5], [5.4, 0.25], [8.93, 0.12]]; for (let i = 0; i < n; i++) { const t = i / SR; let v = 0; for (const [m, a] of parts) v += a * Math.sin(2 * Math.PI * 1480 * p * m * t) * Math.exp(-t / ((e.slow ? 1.4 : 0.9) / m ** 0.5)); o[i] = v * Math.min(1, t / 0.002); } return o; },
  clink: (e) => modes([[2600, 0.6], [4100, 0.4], [6300, 0.2]], e.slow ? 0.2 : 0.06, e.slow ? 0.8 : 0.3, 0.6, e.slow ? 0.55 : 1),
  release: (e) => modes([[170, 0.8], [410, 0.4], [930, 0.2]], e.slow ? 0.35 : 0.12, e.slow ? 1.2 : 0.4, 0.9, e.slow ? 0.55 : 1),
  knock: (e) => modes([[240, 0.7], [610, 0.45], [1450, 0.2]], e.slow ? 0.3 : 0.09, e.slow ? 1.0 : 0.35, 0.6, e.slow ? 0.55 : 1),
  thud: (e) => modes([[95, 0.9], [210, 0.3]], e.slow ? 0.35 : 0.12, e.slow ? 1.0 : 0.4, 0.5, e.slow ? 0.55 : 1),
  hit: (e) => modes([[520, 0.6], [1250, 0.5], [2600, 0.3]], e.slow ? 0.25 : 0.07, e.slow ? 0.9 : 0.3, 0.9, e.slow ? 0.55 : 1),
  clack: (e) => { const j = 0.9 + rnd() * 0.2; return modes([[1050 * j, 0.6], [2350 * j, 0.45], [3700 * j, 0.25]], e.slow ? 0.18 : 0.05, e.slow ? 0.7 : 0.22, 0.7, e.slow ? 0.55 : 1); },
};
const GAIN = { start: -32, rewind: -26, bell: -12, clink: -18, click: -30, tick: -30, pluck: -27, pencil: -24, flick: -29, whoosh: -26, creak: -29, release: -14, knock: -17, thud: -16, hit: -13, clack: -18 };
for (const e of E) {
  const buf = SYN[e.type](e);
  let g = db(GAIN[e.type]) * (e.gain ?? 1);
  if (e.force != null) g *= Math.min(1.6, 0.35 + Math.log10(1 + e.force) * 0.45);
  const pan = e.type === 'pluck' ? 0 : Math.max(-0.6, Math.min(0.6, (rnd() - 0.5) * 0.5 + (e.type === 'clack' || e.type === 'hit' ? 0.25 : e.type === 'release' || e.type === 'knock' ? -0.25 : 0)));
  put(e.t, buf, g, pan);
}
// the bed: a slow, soft chord pad and a little room tone, under everything
const chord = [87.31, 130.81, 174.61, 220.0, 261.63, 329.63];
const lpN = biquad('lp', 900, 0.5);
for (let i = 0; i < N; i++) {
  const t = i / SR, swell = 0.55 + 0.45 * Math.sin(t * 0.21) * Math.sin(t * 0.13 + 1);
  let v = 0; chord.forEach((f, k) => { v += Math.sin(2 * Math.PI * f * t + k) * (1 / (k + 1.5)) * (0.7 + 0.3 * Math.sin(t * (0.3 + k * 0.07))); });
  const fadeIn = Math.min(1, t / 2), fadeOut = Math.min(1, (LEN - t) / 2.5);
  const bed = (v * db(-33) * swell + lpN(rnd() * 2 - 1) * db(-50)) * fadeIn * fadeOut;
  L[i] += bed; R[i] += bed * 0.97 + (i > 240 ? L[i - 240] * 0 : 0);
}
// soft limit and normalise to -1 dBFS
let peak = 0; for (let i = 0; i < N; i++) { L[i] = Math.tanh(L[i] * 1.2) / 1.2; R[i] = Math.tanh(R[i] * 1.2) / 1.2; peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
const k = db(-1) / peak;
const pcm = Buffer.alloc(44 + N * 4);
pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + N * 4, 4); pcm.write('WAVE', 8); pcm.write('fmt ', 12); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22);
pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * k)) * 32767), 44 + i * 4); pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * k)) * 32767), 46 + i * 4); }
const out = resolve(outArg);
writeFileSync(out, pcm);
const counts = E.reduce((m, e) => ((m[e.type] = (m[e.type] || 0) + 1), m), {});
console.log(out, `${LEN.toFixed(1)}s`, JSON.stringify(counts));
