// The sheet of paper for any machine: its parts drawn once as a pencil sketch,
// then the READ chapter's layers (orange highlights and labels, the ink pass,
// dimension lines) drawn over it as the story asks.

import * as THREE from 'three';
import { outline } from './spec.js';
import { rng, paperBase, graphitePattern } from './textures.js';

export const PPM = 3600;          // canvas pixels per metre of paper
const ORANGE = [240, 164, 48];

function circlePts([c, r], n = 64) { return Array.from({ length: n + 1 }, (_, i) => [c[0] + r * Math.cos((i / n) * 6.2832), c[1] + r * Math.sin((i / n) * 6.2832)]); }
const len = (pl) => pl.reduce((s, q, i) => (i ? s + Math.hypot(q[0] - pl[i - 1][0], q[1] - pl[i - 1][1]) : 0), 0);

function pencil(x, pl, r, { w = 5.4, alpha = 0.85, passes = 3, jitter = 3.2, over = 14, style } = {}) {
  x.save(); x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = style;
  // polygons are drawn edge by edge so corners overshoot like a hand-drawn box
  const segs = pl.length <= 8 ? pl.slice(1).map((q, i) => [pl[i], q]) : [pl];
  for (const seg of segs) for (let k = 0; k < passes; k++) {
    x.globalAlpha = alpha * (0.55 + r() * 0.45); x.lineWidth = w * (0.7 + r() * 0.6);
    const ox = (r() - 0.5) * jitter, oy = (r() - 0.5) * jitter;
    let pts = seg.map(([a, b]) => [a + ox + (r() - 0.5) * jitter * 0.4, b + oy + (r() - 0.5) * jitter * 0.4]);
    if (seg.length === 2) {
      const [a, b] = pts, dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, o0 = over * (0.2 + r()), o1 = over * (0.2 + r());
      pts = [[a[0] - (dx / l) * o0, a[1] - (dy / l) * o0], [b[0] + (dx / l) * o1, b[1] + (dy / l) * o1]];
    }
    x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke();
  }
  x.restore();
}

function inkReveal(x, pls, p, { w = 5.2, color = '#1c1c1e', alpha = 1 } = {}) {
  if (p <= 0) return;
  x.save(); x.strokeStyle = color; x.lineWidth = w; x.lineCap = 'round'; x.lineJoin = 'round'; x.globalAlpha = alpha;
  for (const pl of pls) { const L = len(pl); x.setLineDash([L * Math.min(1, p), L + 1]); x.beginPath(); pl.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke(); }
  x.restore();
}

function hatch(x, clip, r, style, { gap = 12, angle = -0.9, alpha = 0.4 } = {}) {
  x.save(); x.beginPath(); clip.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); x.clip();
  const xs = clip.map((q) => q[0]), ys = clip.map((q) => q[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, R = Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys);
  x.strokeStyle = style; x.lineWidth = 2.4;
  for (let d = -R; d < R; d += gap * (0.8 + r() * 0.4)) {
    x.globalAlpha = alpha * (0.6 + r() * 0.4); x.beginPath();
    x.moveTo(cx - Math.cos(angle) * R - Math.sin(angle) * d, cy - Math.sin(angle) * R + Math.cos(angle) * d);
    x.lineTo(cx + Math.cos(angle) * R - Math.sin(angle) * d, cy + Math.sin(angle) * R + Math.cos(angle) * d); x.stroke();
  }
  x.restore();
}

export class Paper {
  // machine: the spec; norm: its parts at the parameters the drawing shows
  constructor(machine, norm, fonts = {}) {
    this.m = machine; this.fonts = { hand: 'Gochi Hand', dim: 'Caveat', ...fonts };
    const P = machine.paper;
    this.W = Math.round(P.w * PPM); this.H = Math.round(P.h * PPM);
    const [u0, v0] = P.origin;
    this.pt = ([x, y]) => [(u0 + x) * PPM, (v0 - y) * PPM];
    this.canvas = document.createElement('canvas'); this.canvas.width = this.W; this.canvas.height = this.H;
    this.ctx = this.canvas.getContext('2d');
    this.base = paperBase(this.W, this.H);
    this.orange = graphitePattern(this.ctx, ORANGE);
    this.setParts(norm);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace; this.texture.anisotropy = 16;
    this.last = '';
  }

  // Polylines per READ group, in canvas pixels.
  setParts(norm) {
    const groups = {};
    for (const p of norm.parts) {
      if (!p.sketch) continue;
      const o = outline(p), pl = (o.circle ? circlePts(o.circle) : [...o.poly, o.poly[0]]).map(this.pt);
      (groups[p.group] ||= []).push({ pl, shade: p.shade, circle: !!o.circle, part: p });
    }
    const b = norm.bounds;
    groups.ground = [{ pl: [[b.x0 - 0.08, 0], [b.x1 + 0.08, 0]].map(this.pt) }];
    this.groups = groups;
    this.paths = (this.m.paths || []).map((p) => p.pts.map(this.pt));
    this.pencilLayer = this.drawPencil();
    this.last = '';
  }

  drawPencil() {
    const c = document.createElement('canvas'); c.width = this.W; c.height = this.H;
    const x = c.getContext('2d'), style = graphitePattern(x);
    Object.entries(this.groups).forEach(([name, items], k) => {
      const r = rng(100 + k);
      for (const it of items) {
        pencil(x, it.pl, r, { style, passes: name === 'ground' ? 1 : 3, alpha: name === 'ground' ? 0.6 : 0.85 });
        if (it.shade) hatch(x, it.pl, r, style, { gap: it.circle ? 9 : 14, angle: it.circle ? -0.8 : 0.9, alpha: 0.45 });
      }
    });
    const r = rng(7);
    // ground scuffs, like the sketcher's pencil resting on the line
    const b = [this.groups.ground[0].pl[0][0], this.groups.ground[0].pl[1][0]];
    for (let i = 0; i < 10; i++) { const gx = b[0] + ((b[1] - b[0]) * (i + r())) / 10, gy = this.groups.ground[0].pl[0][1]; pencil(x, [[gx, gy + 14], [gx + 28, gy + 42]], r, { style, passes: 1, alpha: 0.35, w: 2.8, over: 2 }); }
    // the hand-drawn guesses, in dashes
    for (const hp of this.paths) {
      x.save(); x.strokeStyle = style; x.lineCap = 'round';
      for (let i = 0; i < hp.length - 1; i += 2) { x.globalAlpha = 0.6 + r() * 0.3; x.lineWidth = 4.5 + r() * 1.5; x.beginPath(); x.moveTo(...hp[i]); x.lineTo(...hp[i + 1]); x.stroke(); }
      x.restore();
    }
    return c;
  }

  // state: { pencil, ink: {group: 0..1}, hl: {group: {stroke, label, labelAlpha}}, dims: [0..1], note: {text, at, p} }
  draw(state) {
    const key = JSON.stringify(state);
    if (key === this.last) return false;
    this.last = key;
    const x = this.ctx;
    x.globalAlpha = 1; x.drawImage(this.base, 0, 0);
    x.globalAlpha = state.pencil ?? 1; x.drawImage(this.pencilLayer, 0, 0); x.globalAlpha = 1;
    for (const [g, p] of Object.entries(state.ink || {})) inkReveal(x, (this.groups[g] || []).map((i) => i.pl), p);
    Object.entries(state.hl || {}).forEach(([g, h]) => {
      const k = Object.keys(this.groups).indexOf(g), r = rng(100 + Math.max(0, k));
      if (h.stroke > 0) {
        (this.groups[g] || []).forEach((it) => pencil(x, it.pl, r, { style: this.orange, alpha: 0.95 * h.stroke, w: 7.5, passes: 2 }));
        if (g === 'path') this.paths.forEach((hp) => inkReveal(x, [hp], 1, { w: 7, color: `rgba(${ORANGE},${0.55 * h.stroke})` }));
      }
      const item = (this.m.read || []).find((it) => it.group === g);
      if (h.label > 0 && item) this.writeLabel(item.label ?? g, item.at, h.label, h.labelAlpha ?? 1);
    });
    (this.m.dims || []).forEach((d, i) => { const p = (state.dims || [])[i] || 0; if (p > 0) this.drawDim(d, p); });
    this.texture.needsUpdate = true;
    return true;
  }

  writeLabel(text, at, p, a) {
    const x = this.ctx, size = 66, [px, py] = this.pt(at);
    x.save(); x.font = `${size}px "${this.fonts.hand}"`;
    const w = x.measureText(text).width;
    x.beginPath(); x.rect(px - 4, py - size, (w + 8) * Math.min(1, p), size * 1.4); x.clip();
    x.globalAlpha = a; x.fillStyle = `rgb(${ORANGE})`; x.fillText(text, px, py); x.restore();
  }

  drawDim(d, p) {
    const x = this.ctx, [ax, ay] = this.pt(d.from), [bx, by] = this.pt(d.to);
    const mx = (ax + bx) / 2, my = (ay + by) / 2, q = Math.min(1, p / 0.6);
    x.save(); x.strokeStyle = 'rgba(40,40,46,0.85)'; x.fillStyle = 'rgba(40,40,46,0.9)'; x.lineWidth = 3.2; x.lineCap = 'round';
    x.beginPath(); x.moveTo(mx + (ax - mx) * q, my + (ay - my) * q); x.lineTo(mx + (bx - mx) * q, my + (by - my) * q); x.stroke();
    const ang = Math.atan2(by - ay, bx - ax);
    if (q >= 1) for (const [px, py, s] of [[ax, ay, 1], [bx, by, -1]]) {
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + s * Math.cos(ang - 0.35) * 26, py + s * Math.sin(ang - 0.35) * 26);
      x.moveTo(px, py); x.lineTo(px + s * Math.cos(ang + 0.35) * 26, py + s * Math.sin(ang + 0.35) * 26); x.stroke();
    }
    if (p > 0.6) {
      const tp = Math.min(1, (p - 0.6) / 0.4), size = d.small ? 52 : 64;
      x.font = `500 ${size}px "${this.fonts.dim}"`;
      const tw = x.measureText(d.text).width;
      x.translate(mx, my);
      let rot = ang; if (rot > Math.PI / 2) rot -= Math.PI; if (rot < -Math.PI / 2) rot += Math.PI;
      x.rotate(rot);
      const off = d.side === 'above' ? -20 : 18 + size * 0.7;
      x.beginPath(); x.rect(-tw / 2 - 4, off - size, (tw + 8) * tp, size * 1.4); x.clip();
      x.fillText(d.text, -tw / 2, off);
    }
    x.restore();
  }
}
