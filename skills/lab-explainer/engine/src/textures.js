import * as THREE from 'three';

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const tex = (c, srgb = true) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };

// Painted sky for the backdrop: soft blue gradient and flat-bottomed clouds.
export function skyTexture() {
  const [c, g] = canvas(1024, 840), r = rng(11);
  const gr = g.createLinearGradient(0, 0, 0, 840);
  gr.addColorStop(0, '#4c83d4'); gr.addColorStop(0.5, '#86b6e8'); gr.addColorStop(1, '#d6eaf9');
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 840);
  const cloud = (cx, cy, s) => {
    g.filter = 'blur(5px)';
    for (let i = 0; i < 11; i++) {
      g.fillStyle = `rgba(255,255,255,${0.72 + r() * 0.28})`;
      g.beginPath(); g.ellipse(cx + (r() - 0.5) * s * 2.8, cy - r() * s * 0.5, s * (0.35 + r() * 0.45), s * (0.28 + r() * 0.3), 0, 0, 7); g.fill();
    }
    g.filter = 'blur(3px)'; g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(cx - s * 1.3, cy, s * 2.6, s * 0.18);
  };
  [[170, 150, 55], [520, 90, 42], [820, 190, 60], [330, 330, 38], [700, 380, 44], [110, 460, 34], [930, 470, 36]].forEach(([x, y, s]) => cloud(x, y, s));
  g.filter = 'none';
  return tex(c);
}

// The focus plane: faint glass with a grid and a bright rim.
export function gridTexture() {
  const [c, g] = canvas(1024, 896);
  g.fillStyle = 'rgba(170,220,255,0.11)'; g.fillRect(0, 0, 1024, 896);
  g.strokeStyle = 'rgba(210,236,255,0.34)'; g.lineWidth = 2;
  for (let x = 0; x <= 1024; x += 1024 / 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 896); g.stroke(); }
  for (let y = 0; y <= 896; y += 896 / 14) { g.beginPath(); g.moveTo(0, y); g.lineTo(1024, y); g.stroke(); }
  g.strokeStyle = 'rgba(235,248,255,0.95)'; g.lineWidth = 9; g.strokeRect(4, 4, 1016, 888);
  return tex(c);
}

// Ruler for the front face of the optical rail: one tick per cm.
export function rulerTexture(lengthCm, pxPerCm = 22) {
  const W = Math.round(lengthCm * pxPerCm), H = 64, [c, g] = canvas(W, H);
  g.fillStyle = '#1b1f27'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#c9d1dc'; g.font = '600 20px "JetBrains Mono", monospace'; g.textAlign = 'center';
  for (let i = 0; i <= lengthCm; i++) {
    const x = i * pxPerCm, h = i % 10 === 0 ? 30 : i % 5 === 0 ? 20 : 11;
    g.globalAlpha = i % 10 === 0 ? 0.95 : 0.7; g.fillRect(x - 1, 0, 2, h);
    if (i % 10 === 0 && i > 0 && i < lengthCm) { g.globalAlpha = 0.6; g.fillText(String(i), x, 56); }
  }
  g.globalAlpha = 1;
  const t = tex(c); t.wrapS = THREE.ClampToEdgeWrapping; return t;
}

// Backlit wall panels: a tree, a ray fan and a plate, blurred by stage.
export function wallArt(stage) {
  const [c, g] = canvas(768, 512);
  const bg = g.createRadialGradient(384, 256, 40, 384, 256, 460); bg.addColorStop(0, '#16304a'); bg.addColorStop(1, '#0a1522');
  g.fillStyle = bg; g.fillRect(0, 0, 768, 512);
  g.strokeStyle = 'rgba(120,190,255,0.08)'; g.lineWidth = 1;
  for (let x = 0; x < 768; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke(); }
  for (let y = 0; y < 512; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(768, y); g.stroke(); }
  const blur = [26, 9, 0][stage];
  g.filter = blur ? `blur(${blur}px)` : 'none';
  g.fillStyle = '#eef6ff';
  const tree = (cx, base, h) => {
    for (let k = 0; k < 4; k++) { const w = h * (0.52 - k * 0.09), y0 = base - k * h * 0.2; g.beginPath(); g.moveTo(cx - w / 2, y0); g.lineTo(cx + w / 2, y0); g.lineTo(cx, y0 - h * 0.42); g.closePath(); g.fill(); }
    g.fillRect(cx - h * 0.04, base, h * 0.08, h * 0.12);
  };
  tree(200, 380, 300);
  g.filter = 'none';
  g.strokeStyle = 'rgba(225,240,255,0.75)'; g.lineWidth = 2;
  const fx = 560, fy = 250, spread = [80, 38, 0][stage];
  for (let k = -5; k <= 5; k++) { g.beginPath(); g.moveTo(300, 250 + k * 16); g.lineTo(fx, fy + (k / 5) * spread); g.stroke(); }
  g.fillStyle = '#dff0ff'; g.fillRect(596, 110, 10, 290);
  g.fillStyle = 'rgba(230,245,255,0.9)'; g.beginPath(); g.arc(601, 250, spread ? spread * 0.25 + 4 : 5, 0, 7); g.fill();
  return tex(c);
}

// An iris seen face on: a disc with a polygonal opening.
export function irisTexture(open, { disc = '#b4b9c2', hole = '#07090c', ring = null } = {}) {
  const [c, g] = canvas(512, 512);
  g.fillStyle = disc; g.beginPath(); g.arc(256, 256, 250, 0, 7); g.fill();
  const gr = g.createRadialGradient(256, 256, 60, 256, 256, 250); gr.addColorStop(0, 'rgba(255,255,255,0.0)'); gr.addColorStop(1, 'rgba(0,0,0,0.22)');
  g.fillStyle = gr; g.beginPath(); g.arc(256, 256, 250, 0, 7); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 3;
  for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; g.beginPath(); g.moveTo(256 + Math.cos(a) * open * 240, 256 + Math.sin(a) * open * 240); g.lineTo(256 + Math.cos(a + 0.9) * 236, 256 + Math.sin(a + 0.9) * 236); g.stroke(); }
  g.fillStyle = hole; g.beginPath();
  for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2 + 0.2; const x = 256 + Math.cos(a) * open * 240, y = 256 + Math.sin(a) * open * 240; k ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.closePath(); g.fill();
  if (ring) { g.strokeStyle = ring; g.lineWidth = 10; g.beginPath(); g.arc(256, 256, 244, 0, 7); g.stroke(); }
  return tex(c);
}

// Engraved brass maker's plate.
export function plateTexture(lines) {
  const [c, g] = canvas(512, 256);
  const gr = g.createLinearGradient(0, 0, 512, 256); gr.addColorStop(0, '#e2b066'); gr.addColorStop(0.5, '#c9913f'); gr.addColorStop(1, '#a8742c');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = 'rgba(60,35,10,0.55)'; g.lineWidth = 6; g.strokeRect(14, 14, 484, 228);
  g.fillStyle = 'rgba(55,32,10,0.85)'; g.textAlign = 'center';
  g.font = '800 70px "Outfit", sans-serif'; g.fillText(lines[0], 256, 125);
  g.font = '600 38px "JetBrains Mono", monospace'; g.fillText(lines[1], 256, 195);
  return tex(c);
}

// Light wood with fine grain, for the diorama tray rim.
export function woodTexture() {
  const [c, g] = canvas(1024, 128), r = rng(5);
  g.fillStyle = '#c99862'; g.fillRect(0, 0, 1024, 128);
  for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(${120 + r() * 40},${70 + r() * 30},${30 + r() * 20},${0.12 + r() * 0.18})`; g.lineWidth = 1 + r() * 2.5; const y = r() * 128; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= 1024; x += 64) g.lineTo(x, y + Math.sin(x * 0.01 + i) * 3); g.stroke(); }
  const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

// Floor tiles for the far background.
export function tileTexture() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#c9ccd1'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(90,95,105,0.35)'; g.lineWidth = 3;
  for (let i = 0; i <= 512; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke(); }
  const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
