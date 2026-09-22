/*
 * horizon-reel engine.
 *
 * A film is a list of shots, each a few hundred milliseconds long. Almost every
 * shot is a horizon: the top of a very large circle ("the dome") sitting across
 * the lower half of the frame, filled with a photograph, an object cut from its
 * museum background, or a procedural drawing. A serif word rides the curve.
 *
 * Every frame is a pure function of its timestamp: window.seek(ms) draws it.
 * Randomness is seeded per shot, and hand-drawn shots re-seed on twos (12 Hz)
 * so their lines boil the way a redrawn cel does, identically on every render.
 *
 * The film JSON contract is documented in references/film-spec.md.
 */
(function () {
  'use strict';

  const Reel = (window.Reel = {});
  let film, base, W, H, fps, ctx, canvas, total = 0;
  let grain = [];
  const errors = (window.reelErrors = []);

  /* ---------------------------------------------------------------- utils */

  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash1(i, seed) {
    let h = (i * 374761393 + seed * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function noise1(x, seed) {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return lerp(hash1(i, seed), hash1(i + 1, seed), u);
  }
  function fbm(x, seed, oct = 4) {
    let v = 0, amp = 0.5, fr = 1, norm = 0;
    for (let o = 0; o < oct; o++) { v += amp * noise1(x * fr, seed + o * 131); norm += amp; amp *= 0.5; fr *= 2.03; }
    return v / norm;
  }
  function hex(c) {
    if (Array.isArray(c)) return c;
    const s = c.replace('#', '');
    const n = parseInt(s.length === 3 ? s.split('').map((x) => x + x).join('') : s, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgba = (c, a = 1) => { const [r, g, b] = hex(c); return `rgba(${r},${g},${b},${a})`; };
  const lum = (c) => { const [r, g, b] = hex(c); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };

  function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  function loadImage(url) {
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error(`image failed to load: ${url}`));
      im.src = url;
    });
  }

  /* ------------------------------------------------------------- geometry */

  // The dome for a shot: its top edge sits at `top` (fraction of H) and its
  // radius is `curve` frame-widths. Bigger curve = flatter horizon.
  function geo(s, topOverride) {
    const top = (topOverride ?? s.top ?? film.top ?? 0.6) * H;
    const R = (s.curve ?? film.curve ?? 1.25) * W;
    return { top, R, cx: W / 2 + (s.cx ?? 0) * W, cy: top + R };
  }

  // Radial displacement of the dome edge at arc-length x, for the edge styles.
  function edgeAt(edge, x, seed, amp) {
    switch (edge) {
      case 'rough': return (fbm(x / 34, seed) - 0.5) * 2 * (amp ?? 7);
      case 'torn': return ((fbm(x / 14, seed) - 0.5) * 2 + (noise1(x / 3, seed + 7) - 0.5) * 0.6) * (amp ?? 10);
      case 'scallop': { const p = amp ? amp * 4 : 52; return Math.abs(Math.sin((x / p) * Math.PI)) * (amp ?? 13) - (amp ?? 13) * 0.5; }
      case 'ridge': return (fbm(x / 120, seed, 5) - 0.5) * 2 * (amp ?? 34);
      default: return 0;
    }
  }

  function domePath(c, g, s, grow = 0) {
    const span = Math.min(Math.PI * 0.9, Math.asin(Math.min(1, (W * 0.8) / g.R)) + 0.08);
    const n = 900;
    c.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = -span + (2 * span * i) / n;
      const r = g.R + grow + edgeAt(s.edge, a * g.R, s.seed, s.edgeAmp);
      const x = g.cx + r * Math.sin(a), y = g.cy - r * Math.cos(a);
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.lineTo(W * 3, H * 4); c.lineTo(-W * 2, H * 4); c.closePath();
  }

  function arcPoints(g, r, a0, a1, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); pts.push([g.cx + r * Math.sin(a), g.cy - r * Math.cos(a)]); }
    return pts;
  }
  const visibleSpan = (g) => Math.asin(Math.min(1, (W * 0.62) / g.R)) + 0.04;

  /* ------------------------------------------------------------ treatment */

  // Colour treatment for photographs: a posterised gradient map (the false
  // colour of a risograph or a thermal print), or plain contrast/saturation.
  function makeTreat(tr) {
    if (!tr) return null;
    const map = tr.map ? tr.map.map(hex) : null;
    const steps = tr.steps || 0, con = tr.contrast ?? 1, bri = tr.brightness ?? 0, sat = tr.sat ?? 1, gam = tr.gamma ?? 1;
    const inv = !!tr.invert;
    return function (d) {
      for (let i = 0; i < d.length; i += 4) {
        let r = d[i], g = d[i + 1], b = d[i + 2];
        if (map) {
          let l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
          if (inv) l = 1 - l;
          l = clamp((l - 0.5) * con + 0.5 + bri);
          if (gam !== 1) l = Math.pow(l, gam);
          if (steps > 1) l = Math.round(l * (steps - 1)) / (steps - 1);
          const f = l * (map.length - 1), k = Math.min(map.length - 2, Math.floor(f)), u = f - k;
          const A = map[k], B = map[k + 1];
          d[i] = A[0] + (B[0] - A[0]) * u; d[i + 1] = A[1] + (B[1] - A[1]) * u; d[i + 2] = A[2] + (B[2] - A[2]) * u;
        } else {
          const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
          r = (r / 255 - 0.5) * con + 0.5 + bri; g = (g / 255 - 0.5) * con + 0.5 + bri; b = (b / 255 - 0.5) * con + 0.5 + bri;
          if (steps > 1) { const q = steps - 1; r = Math.round(clamp(r) * q) / q; g = Math.round(clamp(g) * q) / q; b = Math.round(clamp(b) * q) / q; }
          d[i] = clamp(r) * 255; d[i + 1] = clamp(g) * 255; d[i + 2] = clamp(b) * 255;
        }
      }
    };
  }

  function treatCanvas(c, tr) {
    const f = makeTreat(tr);
    if (!f) return;
    const x = c.getContext('2d', { willReadFrequently: true });
    const im = x.getImageData(0, 0, c.width, c.height);
    f(im.data);
    x.putImageData(im, 0, 0);
  }

  // The source image flipped and rotated as the shot asks, capped in size.
  function orient(img, s) {
    const cap = 2600;
    const k = Math.min(1, cap / Math.max(img.naturalWidth, img.naturalHeight));
    const iw = Math.round(img.naturalWidth * k), ih = Math.round(img.naturalHeight * k);
    const deg = s.rotate || 0, rad = (deg * Math.PI) / 180;
    const cw = Math.round(Math.abs(iw * Math.cos(rad)) + Math.abs(ih * Math.sin(rad)));
    const ch = Math.round(Math.abs(iw * Math.sin(rad)) + Math.abs(ih * Math.cos(rad)));
    const c = mk(cw, ch), x = c.getContext('2d');
    x.translate(cw / 2, ch / 2);
    x.rotate(rad);
    x.scale(s.flip === 'h' || s.flip === 'hv' ? -1 : 1, s.flip === 'v' || s.flip === 'hv' ? -1 : 1);
    x.drawImage(img, -iw / 2, -ih / 2, iw, ih);
    return c;
  }

  // Separate an object from its studio backdrop. Museum backdrops are rarely one
  // colour: they fade from grey to white, or carry a soft shadow. So the fill
  // walks in from the border one pixel at a time and keeps going while each step
  // is a small change (a smooth gradient) and the colour stays within reach of
  // the border's typical colour. The object's outline is a sharp step, so the
  // fill stops there, and pale interiors that match the backdrop (white
  // porcelain) are never reached.
  function cutout(src, s) {
    const thr = s.threshold ?? 36, tol = s.edgeTol ?? 6;
    const dw = Math.min(900, src.width), k = dw / src.width, dh = Math.round(src.height * k);
    const small = mk(dw, dh), sx = small.getContext('2d', { willReadFrequently: true });
    sx.drawImage(src, 0, 0, dw, dh);
    const d = sx.getImageData(0, 0, dw, dh).data;
    const edge = [];
    for (let x = 0; x < dw; x++) edge.push(x, (dh - 1) * dw + x);
    for (let y = 1; y < dh - 1; y++) edge.push(y * dw, y * dw + dw - 1);
    const opaque = edge.filter((i) => d[i * 4 + 3] > 10);
    const med = [0, 1, 2].map((c) => { const v = opaque.map((i) => d[i * 4 + c]).sort((a, b) => a - b); return v[v.length >> 1] || 0; });
    const dist = (i, c) => Math.hypot(d[i * 4] - c[0], d[i * 4 + 1] - c[1], d[i * 4 + 2] - c[2]);
    const step = (i, j) => Math.hypot(d[i * 4] - d[j * 4], d[i * 4 + 1] - d[j * 4 + 1], d[i * 4 + 2] - d[j * 4 + 2]);
    const reach = s.reach ?? 200;
    const bg = new Uint8Array(dw * dh), q = [];
    for (const i of edge) if (!bg[i] && (d[i * 4 + 3] < 10 || dist(i, med) < reach)) { bg[i] = 1; q.push(i); }
    while (q.length) {
      const i = q.pop(), x = i % dw, y = (i / dw) | 0;
      const nb = [x > 0 ? i - 1 : -1, x < dw - 1 ? i + 1 : -1, y > 0 ? i - dw : -1, y < dh - 1 ? i + dw : -1];
      for (const j of nb) {
        if (j < 0 || bg[j]) continue;
        if (d[j * 4 + 3] < 10 || (step(i, j) < tol && dist(j, med) < reach)) { bg[j] = 1; q.push(j); }
      }
    }
    // JPEG noise in a shadow leaves specks the fill could not step onto. Drop
    // any object pixel with few object neighbours, twice, to clear them.
    for (let pass = 0; pass < (s.despeckle ?? 2); pass++) {
      const flip = [];
      for (let y = 1; y < dh - 1; y++) for (let x = 1; x < dw - 1; x++) {
        const i = y * dw + x;
        if (bg[i]) continue;
        let n = 0;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) n += !bg[i + a * dw + b];
        if (n < 5) flip.push(i);
      }
      for (const i of flip) bg[i] = 1;
    }
    // Bounding box of what is left, ignoring specks and thin strays.
    let top = dh, bottom = 0, left = dw, right = 0;
    const rowMin = Math.max(3, dw * 0.03), colMin = Math.max(3, dh * 0.03);
    for (let y = 0; y < dh; y++) { let n = 0; for (let x = 0; x < dw; x++) n += !bg[y * dw + x]; if (n > rowMin) { top = Math.min(top, y); bottom = Math.max(bottom, y); } }
    for (let x = 0; x < dw; x++) { let n = 0; for (let y = 0; y < dh; y++) n += !bg[y * dw + x]; if (n > colMin) { left = Math.min(left, x); right = Math.max(right, x); } }
    if (s.box) [left, top, right, bottom] = [s.box[0] * dw, s.box[1] * dh, s.box[2] * dw, s.box[3] * dh];
    const m = mk(dw, dh), mx = m.getContext('2d');
    if (s.shape === 'ellipse') {
      // Round objects: a clean ellipse in the box beats a pixel mask.
      mx.fillStyle = '#fff'; mx.beginPath();
      mx.ellipse((left + right) / 2, (top + bottom) / 2, (right - left) / 2, (bottom - top) / 2, 0, 0, Math.PI * 2); mx.fill();
    } else {
      const md = mx.createImageData(dw, dh);
      for (let i = 0; i < dw * dh; i++) { md.data[i * 4] = md.data[i * 4 + 1] = md.data[i * 4 + 2] = 255; md.data[i * 4 + 3] = bg[i] ? 0 : 255; }
      mx.putImageData(md, 0, 0);
    }
    // Backdrop colour just above the object, for keepBackdrop fills.
    const ty = Math.max(0, Math.round(top) - 4), tx = Math.round((left + right) / 2);
    const above = [d[(ty * dw + tx) * 4], d[(ty * dw + tx) * 4 + 1], d[(ty * dw + tx) * 4 + 2]];
    return { mask: m, bg: above, box: { top: top / k, bottom: bottom / k, left: left / k, right: right / k } };
  }

  /* --------------------------------------------------------------- photos */

  async function prepPhoto(s) {
    const img = await loadImage(new URL(s.src, base).href);
    const src = orient(img, s);
    const layer = mk(W, H), lx = layer.getContext('2d');

    if (s.fit === 'object') {
      const cut = cutout(src, s);
      const b = cut.box, bw = b.right - b.left;
      s._debug = { box: b, bg: cut.bg, src: [src.width, src.height] };
      const scale = ((s.width ?? 1.3) * W) / bw;
      // The word follows the object's own rim, so the dome radius comes from the
      // object's size unless the shot sets one.
      if (s.curve == null) s.curve = (s.width ?? 1.3) / 2;
      const g = geo(s);
      const ox = W / 2 + (s.dx ?? 0) * W - ((b.left + b.right) / 2) * scale;
      const oy = g.top - b.top * scale + (s.dy ?? 0) * H;
      const obj = mk(W, H), ox2 = obj.getContext('2d', { willReadFrequently: true });
      ox2.imageSmoothingQuality = 'high';
      ox2.drawImage(src, ox, oy, src.width * scale, src.height * scale);
      treatCanvas(obj, s.treat);
      if (s.keepBackdrop) {
        // Keep the photo's own backdrop, extended past the image edges in the
        // treated backdrop colour so the frame has no seams.
        const px = new Uint8ClampedArray([...cut.bg, 255]);
        const f = makeTreat(s.treat); if (f) f(px);
        lx.fillStyle = `rgb(${px[0]},${px[1]},${px[2]})`; lx.fillRect(0, 0, W, H);
        lx.drawImage(obj, 0, 0);
      } else {
        ox2.globalCompositeOperation = 'destination-in';
        ox2.filter = 'blur(1px)';
        ox2.drawImage(cut.mask, ox, oy, src.width * scale, src.height * scale);
        lx.fillStyle = s.sky || '#111'; lx.fillRect(0, 0, W, H);
        lx.drawImage(obj, 0, 0);
      }
      s._layer = layer;
      return;
    }

    // cover: the image fills the frame around a focus point, then the dome clips it.
    const zoom = s.zoom ?? 1;
    const k = Math.max(W / src.width, H / src.height) * zoom;
    const [fx, fy] = s.focus || [0.5, 0.5];
    let x = W / 2 - fx * src.width * k, y = H / 2 - fy * src.height * k;
    x = Math.min(0, Math.max(W - src.width * k, x)); y = Math.min(0, Math.max(H - src.height * k, y));
    const lx2 = layer.getContext('2d', { willReadFrequently: true });
    lx2.imageSmoothingQuality = 'high';
    lx2.drawImage(src, x, y, src.width * k, src.height * k);
    treatCanvas(layer, s.treat);
    s._layer = layer;
  }

  /* ------------------------------------------------------ shot renderers */

  const DRAW = {};

  DRAW.photo = function (s, t, p, g) {
    if (s.fit === 'object' || s.dome === false) { ctx.drawImage(s._layer, 0, 0); return; }
    ctx.fillStyle = s.sky || '#000'; ctx.fillRect(0, 0, W, H);
    ctx.save(); domePath(ctx, g, s); ctx.clip(); ctx.drawImage(s._layer, 0, 0); ctx.restore();
    if (s.rim) { ctx.save(); domePath(ctx, g, s); ctx.strokeStyle = s.rim.color || '#000'; ctx.lineWidth = s.rim.width || 4; ctx.stroke(); ctx.restore(); }
  };

  DRAW.flat = function (s, t, p, g) {
    ctx.fillStyle = s.sky || '#111'; ctx.fillRect(0, 0, W, H);
    domePath(ctx, g, s); ctx.fillStyle = s.fill || '#444'; ctx.fill();
  };

  // A planet limb: dark body, thin bright rim, atmospheric halo above it.
  function limb(g, o = {}) {
    const sky = o.sky || '#0d0f13';
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    const span = Math.asin(Math.min(1, (W * 0.9) / g.R)) + 0.1;
    const ring = (dr, w, col, blur, alpha = 1) => {
      ctx.save(); ctx.filter = blur ? `blur(${blur}px)` : 'none'; ctx.globalAlpha = alpha;
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
      ctx.arc(g.cx, g.cy, g.R + dr, -Math.PI / 2 - span, -Math.PI / 2 + span); ctx.stroke(); ctx.restore();
    };
    const halo = o.halo || ['#1f3148', '#5f84ad', '#cfe0ee'];
    ring(150, 300, halo[0], 70, 0.9);
    ring(46, 90, halo[1], 28, 0.8);
    ring(10, 16, halo[2], 7, 0.95);
    if (o.warm) { ring(4, 10, '#ffb36b', 4, 0.95); ring(1, 5, '#ff5a1a', 2, 1); }
    ctx.save();
    ctx.beginPath(); ctx.arc(g.cx, g.cy, g.R, 0, Math.PI * 2); ctx.clip();
    const body = o.body || ['#2d4a6e', '#0a1420', '#050709'];
    const gr = ctx.createRadialGradient(g.cx, g.cy, g.R - 520, g.cx, g.cy, g.R);
    gr.addColorStop(0, body[2]); gr.addColorStop(0.72, body[1]); gr.addColorStop(1, body[0]);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    ctx.restore();
    ring(0, 2.5, o.line || '#eef4fa', 1.2, 0.95);
  }

  DRAW.limb = function (s, t, p, g) { limb(g, s); };

  // Lockup presets. A film can also pass its own object:
  // { "text": "Acme", "mark": "\u2728" or "markSrc": "media/logo.png", "family": "Geist", "weight": 500 }
  const LOCKUPS = { litellm: { mark: '\u{1F685}', text: 'LiteLLM', family: 'Geist', weight: 500, tracking: -0.03 } };
  function lockupOf(l) {
    const o = typeof l === 'string' ? LOCKUPS[l] || { text: l } : l;
    return { family: 'Geist', weight: 500, tracking: -0.03, ...o };
  }

  DRAW.card = function (s, t, p) {
    ctx.fillStyle = s.bg || '#0e1014'; ctx.fillRect(0, 0, W, H);
    if (s.limb) {
      const L = s.limb, e = easeInOut(clamp(p / (L.span ?? 1)));
      const g2 = geo({ curve: L.curve ?? 1.1 }, lerp(L.from ?? 0.94, L.to ?? L.from ?? 0.94, e));
      limb(g2, { ...L, sky: s.bg || '#0e1014' });
    }
    const yy = Array.isArray(s.y) ? lerp(s.y[0], s.y[1], easeInOut(clamp(p / (s.ySpan ?? 1)))) : (s.y ?? 0.5);
    const alpha = s.fadeIn ? smooth(0, s.fadeIn, t) : 1;
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = s.ink || '#f3f0ea';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (s.lockup) {
      // A brand lockup: a mark (an emoji or an image) beside a wordmark.
      const L = lockupOf(s.lockup), size = s.size ?? 58;
      ctx.font = `${L.weight} ${size}px "${L.family}"`; ctx.letterSpacing = `${L.tracking * size}px`;
      const ww = ctx.measureText(L.text).width, gap = size * 0.28;
      let mw = 0, mh = size * (L.markScale ?? 1.1);
      if (L._img) mw = mh * (L._img.naturalWidth / L._img.naturalHeight);
      else if (L.mark) { ctx.font = `${size * 0.92}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji"`; mw = ctx.measureText(L.mark).width; }
      const x0 = W / 2 - (mw + (mw ? gap : 0) + ww) / 2;
      ctx.textAlign = 'left';
      if (L._img) ctx.drawImage(L._img, x0, yy * H - mh / 2, mw, mh);
      else if (L.mark) ctx.fillText(L.mark, x0, yy * H + size * 0.02);
      ctx.font = `${L.weight} ${size}px "${L.family}"`; ctx.letterSpacing = `${L.tracking * size}px`;
      ctx.fillText(L.text, x0 + mw + (mw ? gap : 0), yy * H);
    } else {
      const ty = type();
      ctx.font = `${s.weight ?? ty.weight} ${s.size ?? 56}px "${s.family || ty.family}"`;
      ctx.letterSpacing = `${(s.tracking ?? -0.01) * (s.size ?? 56)}px`;
      ctx.fillText(s.text || '', W / 2, yy * H);
    }
    ctx.restore();
  };

  /* hand-drawn media ---------------------------------------------------- */

  const boil = (s, t) => s.seed + (s.hold ? 0 : Math.floor(t / (1000 / (s.boil ?? 12))) * 977);

  function paper(col, seed, amt = 0.07) {
    ctx.fillStyle = col; ctx.fillRect(0, 0, W, H);
    const r = rng(seed);
    ctx.save(); ctx.globalAlpha = amt;
    for (let i = 0; i < 90; i++) {
      const x = r() * W, y = r() * H, rad = 80 + r() * 380;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const dark = r() < 0.5;
      gr.addColorStop(0, dark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    ctx.restore();
  }

  // Chalk and crayon: many thin, broken, jittered passes along the same path.
  function dryStroke(pts, o, r) {
    const passes = o.passes ?? 5, w = o.width ?? 4;
    ctx.save(); ctx.strokeStyle = o.color; ctx.lineCap = 'round';
    for (let k = 0; k < passes; k++) {
      ctx.globalAlpha = (o.alpha ?? 0.5) * (0.5 + r() * 0.6);
      ctx.lineWidth = w * (0.25 + r() * 0.5);
      ctx.setLineDash([4 + r() * (o.dash ?? 40), 1 + r() * (o.gap ?? 6)]);
      ctx.lineDashOffset = r() * 100;
      const jx = (r() - 0.5) * w, jy = (r() - 0.5) * w;
      ctx.beginPath();
      pts.forEach(([x, y], i) => { const wob = (r() - 0.5) * (o.wobble ?? 1.2); i ? ctx.lineTo(x + jx + wob, y + jy + wob) : ctx.moveTo(x + jx, y + jy); });
      ctx.stroke();
    }
    ctx.restore();
  }
  const line = (x1, y1, x2, y2, n = 24) => Array.from({ length: n + 1 }, (_, i) => [lerp(x1, x2, i / n), lerp(y1, y2, i / n)]);

  DRAW.chalk = function (s, t, p, g) {
    paper(s.sky || '#3f6d9c', s.seed, 0.09);
    const r = rng(boil(s, t)), c = s.ink2 || '#f4f6f8', sp = visibleSpan(g);
    for (const dr of [0, -26, -190]) dryStroke(arcPoints(g, g.R + dr, -sp, sp, 160), { color: c, width: 6, passes: 6, alpha: 0.55 }, r);
    const lay = rng(s.seed);
    for (let i = 0; i < 16; i++) {
      const a = lerp(-sp * 0.9, sp * 0.9, lay());
      const p1 = [g.cx + (g.R - 240) * Math.sin(a), g.cy - (g.R - 240) * Math.cos(a)];
      const p2 = [g.cx + (g.R + 30) * Math.sin(a), g.cy - (g.R + 30) * Math.cos(a)];
      dryStroke(line(p1[0], p1[1], p2[0], p2[1]), { color: c, width: 4, passes: 4, alpha: 0.5 }, r);
    }
    for (let i = 0; i < 9; i++) {
      const x = lay() * W * 0.7, y = lay() * g.top * 0.9, ang = -0.4 - lay() * 0.9, len = 300 + lay() * 700;
      dryStroke(line(x, y, x + Math.cos(ang) * len, y - Math.sin(ang) * len), { color: c, width: 4, passes: 3, alpha: 0.45 }, r);
      if (lay() < 0.5) dryStroke(line(x + 12, y + 8, x + 12 + Math.cos(ang) * len * 0.8, y + 8 - Math.sin(ang) * len * 0.8), { color: c, width: 3, passes: 3, alpha: 0.4 }, r);
    }
  };

  DRAW.crayon = function (s, t, p, g) {
    paper(s.sky || '#a8c6ee', s.seed, 0.08);
    const r = rng(boil(s, t)), c = s.ink2 || '#2c5ed6', sp = visibleSpan(g);
    for (const [dr, w] of [[0, 22], [-70, 16], [-150, 10]]) {
      const pts = arcPoints(g, g.R + dr, -sp, sp, 120).map(([x, y], i) => [x, y + Math.sin(i * 0.19 + dr) * 6]);
      dryStroke(pts, { color: c, width: w, passes: 16, alpha: 0.42, dash: 26, gap: 5, wobble: 3 }, r);
    }
  };

  DRAW.compass = function (s, t, p, g) {
    paper(s.sky || '#f2ede2', s.seed, 0.05);
    const r = rng(boil(s, t)), lay = rng(s.seed), sp = visibleSpan(g);
    const cols = s.inks || ['#1d1d1f', '#c8372d', '#2f67d6', '#7d7a74'];
    const ink = (pts, c, w = 1.6) => dryStroke(pts, { color: c, width: w, passes: 2, alpha: 0.85, dash: 400, gap: 1, wobble: 0.6 }, r);
    ink(arcPoints(g, g.R, -sp, sp, 200), cols[0], 2.4);
    ink(arcPoints(g, g.R - 14, -sp, sp, 200), cols[3], 1.4);
    const apex = [g.cx, g.top + H * 0.55];
    for (let i = 0; i < 14; i++) {
      const a = lerp(-sp, sp, i / 13);
      const q = [g.cx + g.R * Math.sin(a), g.cy - g.R * Math.cos(a)];
      ink(line(apex[0], apex[1], q[0], q[1]), cols[i % 3 === 0 ? 1 : i % 3 === 1 ? 2 : 3], 1.5);
    }
    for (let i = 0; i < 6; i++) {
      const a1 = lerp(-sp, sp, lay()), a2 = lerp(-sp, sp, lay());
      const p1 = [g.cx + g.R * Math.sin(a1), g.cy - g.R * Math.cos(a1)], p2 = [g.cx + g.R * Math.sin(a2), g.cy - g.R * Math.cos(a2)];
      ink(line(p1[0], p1[1], (p1[0] + p2[0]) / 2, H * 1.05), cols[1 + (i % 2)], 1.4);
    }
  };

  // Pen scribble: drawn over the word, the way the reference lets marks cross it.
  DRAW.scribble = function (s, t, p, g) {
    paper(s.sky || '#e6d9bd', s.seed, 0.1);
    const r = rng(boil(s, t)), sp = visibleSpan(g);
    dryStroke(arcPoints(g, g.R, -sp, sp, 200), { color: '#1c1813', width: 3, passes: 2, alpha: 0.9, dash: 300, gap: 2 }, r);
  };
  DRAW.scribble.over = function (s, t, p, g) {
    const r = rng(boil(s, t)), lay = rng(s.seed);
    ctx.save(); ctx.strokeStyle = s.ink2 || '#1c1813'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let k = 0; k < (s.density ?? 80); k++) {
      let x = lay() * W, y = g.top + 30 + lay() * (H - g.top);
      const a = Math.asin(clamp((x - g.cx) / g.R, -1, 1));
      y = Math.max(y, g.cy - g.R * Math.cos(a) + 6);
      ctx.lineWidth = 1 + lay() * 2.4; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(x, y);
      const tall = lay() < 0.6;
      for (let i = 0; i < 14; i++) {
        const nx = x + (r() - 0.5) * (tall ? 30 : 140), ny = y + (tall ? -(r() * 110) : (r() - 0.5) * 90);
        ctx.quadraticCurveTo(x + (r() - 0.5) * 80, y + (r() - 0.5) * 80, nx, ny);
        // Marks may cross the word a little, as ink does in the reference, but
        // not climb far above the rim.
        const rim = g.cy - Math.sqrt(Math.max(0, g.R * g.R - (nx - g.cx) ** 2));
        x = nx; y = Math.min(H + 40, Math.max(rim - (s.climb ?? 45), ny));
      }
      ctx.stroke();
    }
    ctx.restore();
  };

  DRAW.cutout = function (s, t, p, g) {
    paper(s.sky || '#efe9dd', s.seed, 0.05);
    ctx.save(); domePath(ctx, g, { ...s, edge: s.edge || 'torn' }); ctx.clip();
    ctx.fillStyle = s.fill || '#27488a'; ctx.fillRect(0, 0, W, H);
    const lay = rng(s.seed), cols = s.inks || ['#e9c341', '#c8342b', '#3c9a55', '#eaa3c7', '#ece5d3', '#1b1b1b', '#e36a2a', '#7cc3e6'];
    for (let i = 0; i < 26; i++) {
      const cx = lay() * W, cy = g.top - 40 + lay() * (H - g.top + 60), sz = 60 + lay() * 220;
      ctx.fillStyle = cols[(lay() * cols.length) | 0];
      ctx.beginPath();
      if (lay() < 0.3) ctx.ellipse(cx, cy, sz * 0.5, sz * (0.35 + lay() * 0.3), lay() * 3, 0, Math.PI * 2);
      else { const n = 3 + ((lay() * 3) | 0), rot = lay() * 6; for (let k = 0; k < n; k++) { const a = rot + (k / n) * Math.PI * 2, rr = sz * (0.4 + lay() * 0.5); k ? ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * (1 + lay())) : ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  };

  // Plant-stem cross-section under a microscope, for when no slide photo fits.
  DRAW.cells = function (s, t, p, g) {
    ctx.fillStyle = s.sky || '#ede7da'; ctx.fillRect(0, 0, W, H);
    if (!s._cells) {
      const lay = rng(s.seed), pts = [], cell = 22, grid = new Map();
      const key = (x, y) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
      for (let i = 0; i < 26000 && pts.length < 2400; i++) {
        const x = lay() * W, y = g.top - 10 + lay() * (H - g.top + 60);
        const depth = y - (g.cy - Math.sqrt(Math.max(0, g.R * g.R - (x - g.cx) ** 2)));
        if (depth < 4) continue;
        const md = 16 + Math.min(34, depth * 0.07) * (0.7 + lay() * 0.6);
        let ok = true;
        const gx = Math.floor(x / cell), gy = Math.floor(y / cell), reach = Math.ceil(md / cell);
        for (let a = -reach; a <= reach && ok; a++) for (let b = -reach; b <= reach && ok; b++) {
          const l = grid.get(`${gx + a},${gy + b}`); if (l) for (const q of l) if ((q[0] - x) ** 2 + (q[1] - y) ** 2 < (Math.max(md, q[2]) * 0.9) ** 2) { ok = false; break; }
        }
        if (!ok) continue;
        const pnt = [x, y, md]; pts.push(pnt);
        const k = key(x, y); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(pnt);
      }
      s._cells = { pts, bundles: Array.from({ length: 11 }, () => [lay(), lay()]) };
    }
    ctx.save(); domePath(ctx, g, { ...s, edge: s.edge || 'rough', edgeAmp: 4 }); ctx.clip();
    ctx.fillStyle = s.fill || '#f6f2e8'; ctx.fillRect(0, 0, W, H);
    const wall = s.ink2 || '#2f8f8c';
    for (const [x, y, md] of s._cells.pts) {
      ctx.beginPath(); ctx.arc(x, y, md * 0.46, 0, Math.PI * 2);
      ctx.fillStyle = '#fbf8f1'; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = wall; ctx.stroke();
    }
    for (const [u, v] of s._cells.bundles) {
      const x = u * W, y = g.top + 70 + v * (H - g.top) * 0.8;
      ctx.beginPath(); ctx.arc(x, y, 34, 0, Math.PI * 2); ctx.fillStyle = s.ink3 || '#16585d'; ctx.fill();
      for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(x + Math.cos(k * 1.3) * 14, y + Math.sin(k * 1.3) * 14, 7, 0, Math.PI * 2); ctx.fillStyle = '#86d6c9'; ctx.fill(); }
    }
    ctx.restore();
    ctx.save(); domePath(ctx, g, { ...s, edge: s.edge || 'rough', edgeAmp: 4 }); ctx.lineWidth = 7; ctx.strokeStyle = s.ink3 || '#16585d'; ctx.stroke(); ctx.restore();
  };

  /* ------------------------------------------------------------------ type */

  function type() {
    return { family: 'Source Serif 4', weight: 500, size: 70, step: 0.2, grow: 0.22, gap: 0.16, tracking: -0.012, ...(film.type || {}) };
  }

  // Word runs: consecutive shots carrying the same word share one line of copy
  // that grows a little on every cut. Each new word starts a size step up.
  function planWords() {
    const ty = type();
    let run = null, runIndex = -1;
    const runs = [];
    for (const s of film.shots) {
      if (!s.word) { run = null; continue; }
      if (!run || run.word !== s.word) { run = { word: s.word, shots: [] }; runs.push(run); runIndex++; run.i = runIndex; }
      run.shots.push(s);
    }
    for (const r of runs) {
      const base = ty.size * (1 + ty.step * r.i), n = r.shots.length;
      r.shots.forEach((s, k) => { s._w0 = base * (1 + ty.grow * (k / n)); s._w1 = base * (1 + ty.grow * ((k + 1) / n)); });
    }
  }

  function autoInk(s) {
    if (s.ink) return s.ink;
    const sky = s.sky || (s.kind === 'chalk' ? '#3f6d9c' : s.kind === 'crayon' ? '#a8c6ee' : s.kind === 'compass' ? '#f2ede2' : s.kind === 'scribble' ? '#e6d9bd' : s.kind === 'cutout' ? '#efe9dd' : s.kind === 'cells' ? '#ede7da' : '#111');
    return lum(sky) > 0.55 ? '#16140f' : '#f6f2ea';
  }

  function drawWord(s, p, g) {
    const ty = type();
    const size = s.wordSize ?? lerp(s._w0, s._w1, p);
    ctx.save();
    ctx.font = `${s.weight ?? ty.weight} ${size}px "${ty.family}"`;
    ctx.letterSpacing = `${ty.tracking * size}px`;
    ctx.fillStyle = autoInk(s);
    ctx.globalAlpha = s.inkAlpha ?? 1;
    ctx.textBaseline = 'alphabetic';
    const word = s.word;
    const r = g.R + (s.wordGap ?? ty.gap) * size + Math.max(0, (s.edgeAmp ?? (s.edge ? 8 : 0)) * 0.6) + (s.wordLift ?? 0);
    const total = ctx.measureText(word).width;
    const start = -total / 2 / r;
    let acc = 0;
    for (let i = 0; i < word.length; i++) {
      const upto = ctx.measureText(word.slice(0, i + 1)).width;
      const w = upto - acc;
      const a = start + (acc + w / 2) / r;
      ctx.save();
      ctx.translate(g.cx + r * Math.sin(a), g.cy - r * Math.cos(a));
      ctx.rotate(a);
      ctx.fillText(word[i], -w / 2, 0);
      ctx.restore();
      acc = upto;
    }
    ctx.restore();
  }

  /* ----------------------------------------------------------------- film */

  function makeGrain() {
    const gw = Math.ceil(W / 2) + 64, gh = Math.ceil(H / 2) + 64;
    for (let k = 0; k < 4; k++) {
      const c = mk(gw, gh), x = c.getContext('2d'), im = x.createImageData(gw, gh), r = rng(9001 + k);
      for (let i = 0; i < gw * gh; i++) { const v = 128 + (r() + r() + r() - 1.5) * 150; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
      x.putImageData(im, 0, 0); grain.push(c);
    }
  }

  function finish(frame) {
    const amt = film.grain ?? 0.16;
    if (amt > 0) {
      const r = rng(frame * 31 + 7), tile = grain[frame % grain.length];
      ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = amt;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(tile, -r() * 128, -r() * 128, tile.width * 2, tile.height * 2);
      ctx.restore();
      // Exposure flicker: a percent or two, like a projector lamp.
      const f = (r() - 0.5) * (film.flicker ?? 0.035);
      ctx.save(); ctx.globalAlpha = Math.abs(f); ctx.fillStyle = f > 0 ? '#fff' : '#000'; ctx.fillRect(0, 0, W, H); ctx.restore();
    }
    const vig = film.vignette ?? 0.32;
    if (vig > 0) {
      const gr = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${vig})`);
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }
  }

  function shotAt(ms) {
    const sh = film.shots;
    for (let i = sh.length - 1; i >= 0; i--) if (ms >= sh[i].start) return sh[i];
    return sh[0];
  }

  function seek(ms) {
    ms = clamp(ms, 0, total - 0.001);
    const s = shotAt(ms), t = ms - s.start, p = t / s.dur;
    const frame = Math.round((ms * fps) / 1000);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
    const g = geo(s);
    const push = 1 + (s.push ?? film.push ?? 0.04) * p;
    const draw = DRAW[s.kind];
    if (!draw) throw new Error(`unknown shot kind "${s.kind}"`);
    ctx.save();
    ctx.translate(W / 2, g.top); ctx.scale(push, push); ctx.translate(-W / 2, -g.top);
    draw(s, t, p, g);
    ctx.restore();
    if (s.word) drawWord(s, p, g);
    if (draw.over && s.over !== false) {
      ctx.save(); ctx.translate(W / 2, g.top); ctx.scale(push, push); ctx.translate(-W / 2, -g.top);
      draw.over(s, t, p, g); ctx.restore();
    }
    finish(frame);
  }

  Reel.boot = async function (url) {
    base = new URL(url, location.href);
    film = await (await fetch(base.href)).json();
    [W, H] = film.size || [1920, 1080];
    fps = film.fps || 30;
    canvas = document.getElementById('reel');
    canvas.width = W; canvas.height = H;
    ctx = canvas.getContext('2d', { willReadFrequently: false });

    const ty = type();
    await Promise.all([
      document.fonts.load(`${ty.weight} 64px "${ty.family}"`),
      document.fonts.load('500 64px "Geist"'),
      ...film.shots.filter((s) => s.kind === 'card' && s.family).map((s) => document.fonts.load(`${s.weight ?? ty.weight} 64px "${s.family}"`)),
    ]);

    let t = 0;
    film.shots.forEach((s, i) => { s.index = i; s.start = t; t += s.dur; s.seed = s.seed ?? (i + 1) * 7919; });
    total = t;
    planWords();
    for (const s of film.shots) {
      if (s.kind === 'card' && s.lockup && typeof s.lockup === 'object' && s.lockup.markSrc) {
        try { s.lockup._img = await loadImage(new URL(s.lockup.markSrc, base).href); } catch (e) { errors.push(`shot ${s.index} lockup: ${e.message}`); }
      }
      if (s.kind === 'card' && s.lockup && typeof s.lockup === 'object' && s.lockup.family) await document.fonts.load(`${s.lockup.weight ?? 500} 64px "${s.lockup.family}"`);
    }
    for (const s of film.shots) {
      if (s.kind !== 'photo') continue;
      try { await prepPhoto(s); } catch (e) { errors.push(`shot ${s.index} (${s.src}): ${e.message}`); s.kind = 'flat'; s.sky = '#300'; s.fill = '#f0f'; }
    }
    makeGrain();
    window.seek = seek;
    window.reelInfo = { duration: total, fps, width: W, height: H, shots: film.shots.map((s) => ({ index: s.index, start: s.start, dur: s.dur, kind: s.kind, src: s.src || null, word: s.word || null, debug: s._debug || null })) };
    seek(0);
    window.reelReady = true;
  };
})();
