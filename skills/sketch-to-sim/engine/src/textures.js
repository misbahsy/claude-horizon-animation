// Procedural textures, drawn once on canvases at load. Seeded, so every run
// produces the same desk, grain and paper.

import * as THREE from 'three';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function tex(c, { repeat = [1, 1], srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Long-grain wood: streaks that wander a little along the length.
function grain(x, W, H, r, { base, dark, light, lines = 140, wobble = 6, alpha = 0.18 }) {
  x.fillStyle = base; x.fillRect(0, 0, W, H);
  for (let i = 0; i < lines; i++) {
    const y0 = r() * H, amp = wobble * (0.3 + r()), f = 0.5 + r() * 2, ph = r() * 6;
    x.strokeStyle = r() < 0.7 ? dark : light;
    x.globalAlpha = alpha * (0.3 + r());
    x.lineWidth = 0.6 + r() * 2.2;
    x.beginPath();
    for (let s = 0; s <= W; s += 8) {
      const y = y0 + Math.sin((s / W) * Math.PI * 2 * f + ph) * amp + Math.sin((s / W) * 40 + ph) * 0.6;
      s ? x.lineTo(s, y) : x.moveTo(s, y);
    }
    x.stroke();
  }
  x.globalAlpha = 1;
}

// Oak desk planks running left to right.
export function deskTexture() {
  const W = 2048, H = 2048, c = canvas(W, H), x = c.getContext('2d'), r = rng(11);
  const plank = H / 8;
  for (let p = 0; p < 8; p++) {
    const tint = [164 + r() * 24, 116 + r() * 18, 70 + r() * 14];
    const band = canvas(W, plank), bx = band.getContext('2d');
    grain(bx, W, plank, r, { base: `rgb(${tint.map(Math.round)})`, dark: 'rgb(92,56,28)', light: 'rgb(222,178,120)', lines: 90, wobble: 4, alpha: 0.22 });
    // an occasional knot
    if (r() < 0.5) {
      const kx = r() * W, ky = plank * (0.3 + r() * 0.4);
      for (let k = 12; k > 0; k--) { bx.strokeStyle = `rgba(80,45,20,${0.05 + k * 0.012})`; bx.beginPath(); bx.ellipse(kx, ky, k * 5, k * 2, 0, 0, Math.PI * 2); bx.stroke(); }
    }
    x.drawImage(band, (r() - 0.5) * 400, p * plank);
    x.drawImage(band, (r() - 0.5) * 400 + W, p * plank);
    x.fillStyle = 'rgba(40,22,10,0.55)'; x.fillRect(0, p * plank, W, 3);
  }
  return tex(c, { repeat: [1.2, 1.2] });
}

export function pineTexture() {
  const c = canvas(1024, 256), x = c.getContext('2d'), r = rng(23);
  grain(x, 1024, 256, r, { base: 'rgb(222,186,128)', dark: 'rgb(170,120,60)', light: 'rgb(240,214,165)', lines: 70, wobble: 5, alpha: 0.25 });
  return tex(c);
}

export function walnutTexture() {
  const c = canvas(512, 256), x = c.getContext('2d'), r = rng(37);
  grain(x, 512, 256, r, { base: 'rgb(110,74,48)', dark: 'rgb(70,44,26)', light: 'rgb(140,100,66)', lines: 60, wobble: 4, alpha: 0.3 });
  return tex(c);
}

export function oakTexture() {
  const c = canvas(512, 256), x = c.getContext('2d'), r = rng(41);
  grain(x, 512, 256, r, { base: 'rgb(200,160,108)', dark: 'rgb(150,108,62)', light: 'rgb(226,192,140)', lines: 70, wobble: 4, alpha: 0.28 });
  return tex(c);
}

export function basswoodTexture() {
  const c = canvas(512, 512), x = c.getContext('2d'), r = rng(31);
  grain(x, 512, 512, r, { base: 'rgb(236,216,176)', dark: 'rgb(196,166,118)', light: 'rgb(247,234,206)', lines: 60, wobble: 3, alpha: 0.2 });
  return tex(c);
}

// Paper: warm off-white with fibres. Returned as a canvas so the sketch can be
// drawn over a copy of it.
export function paperBase(W, H) {
  const c = canvas(W, H), x = c.getContext('2d'), r = rng(47);
  x.fillStyle = '#f3f1ec'; x.fillRect(0, 0, W, H);
  const img = x.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 7; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  x.putImageData(img, 0, 0);
  x.globalAlpha = 0.05; x.strokeStyle = '#8a8478';
  for (let i = 0; i < 900; i++) { const px = r() * W, py = r() * H, a = r() * 6.28, l = 4 + r() * 16; x.lineWidth = 0.6; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
  x.globalAlpha = 1;
  return c;
}

// Graphite: a grainy stroke pattern, so pencil lines break up like the real thing.
export function graphitePattern(ctx, rgb = [40, 40, 46]) {
  const c = canvas(256, 256), x = c.getContext('2d'), r = rng(59);
  const img = x.createImageData(256, 256), d = img.data;
  for (let i = 0; i < d.length; i += 4) { d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = r() < 0.72 ? 150 + r() * 105 : r() * 60; }
  x.putImageData(img, 0, 0);
  return ctx.createPattern(c, 'repeat');
}

// The window: soft diagonal bars of shade, used as a spotlight cookie.
export function windowCookie() {
  const S = 1024, c = canvas(S, S), x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, S, S);
  // Vertical bars here land as the reference's diagonal bands across the
  // sheet. About 1 px here is 1.7 mm on the desk.
  x.filter = 'blur(17px)';
  x.save(); x.translate(S / 2, S / 2); x.rotate(Math.PI / 2 - 0.06);
  x.fillStyle = 'rgba(0,0,0,0.58)';
  x.fillRect(-S, -72, S * 2, 58);     // the broad mullion across the middle
  x.fillRect(-S, 112, S * 2, 26);     // a thinner glazing bar further out
  x.fillStyle = 'rgba(0,0,0,0.30)';
  x.fillRect(-S, -S, S * 2, S * 0.70); // wall beside the window: a softer, dimmer side
  x.restore();
  // fall-off towards the cookie's edge so the pool of light is not a hard disc
  x.filter = 'none';
  const g = x.createRadialGradient(S / 2, S / 2, S * 0.36, S / 2, S / 2, S * 0.52);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function wallTexture() {
  const c = canvas(512, 512), x = c.getContext('2d'), r = rng(71);
  x.fillStyle = '#d7d3cc'; x.fillRect(0, 0, 512, 512);
  const img = x.getImageData(0, 0, 512, 512), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 6; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  x.putImageData(img, 0, 0);
  return tex(c, { repeat: [4, 2] });
}
