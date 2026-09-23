// HTML and SVG overlays placed over the canvas by projecting 3D anchors.
// Elements are created on first use and hidden when a frame does not ask for
// them, so the story can describe each frame declaratively.

import * as THREE from 'three';

const NS = 'http://www.w3.org/2000/svg';
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

export function createUI(camera, { showCursor = false, chapters = [], tourLen = 45, T0 = 3.2, machine = {} } = {}) {
  const $ = (id) => document.getElementById(id);
  const labels = $('labels'), svg = $('svg');
  const els = new Map(); let used = new Set();
  const get = (id, make) => { let e = els.get(id); if (!e) { e = make(); els.set(id, e); } used.add(id); return e; };
  const div = (cls) => () => { const d = document.createElement('div'); d.className = cls; labels.appendChild(d); return d; };
  const sv = (tag, attrs = {}) => () => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); svg.appendChild(e); return e; };
  const v = new THREE.Vector3();
  const screen = (p) => { v.copy(p).project(camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; };

  // the card's text comes from the machine
  const [k0, k1] = machine.kicker || ['Sketch to physics', 'Scale 1:1'];
  $('kick0').textContent = k0; $('kick1').textContent = k1;
  $('title').textContent = machine.title || 'Paper Machine'; $('subtitle').textContent = machine.subtitle || 'A pencil sketch, measured, built and run.';
  document.title = machine.title || 'Paper Machine';

  // chapter bar, built once from the story
  const track = $('track');
  chapters.filter((c) => c.chapter !== 'DONE' || true).forEach((c) => {
    const f = c.start / tourLen;
    const e = document.createElement('div'); e.className = 'chap'; e.textContent = c.label || c.chapter; e.style.left = `calc(${f * 100}% + 6px)`; track.appendChild(e);
    const k = document.createElement('div'); k.className = 'tick'; k.style.left = `${f * 100}%`; track.appendChild(k);
  });
  const chapEls = [...track.querySelectorAll('.chap')];
  const card = $('card'), play = $('play'), bar = $('bar'), fill = $('fill'), dot = $('dot'), chapname = $('chapname'), time = $('time');
  const grade = $('grade'), badge = $('badge'), cursor = $('cursor');
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const moveCursor = (x, y, a) => { cursor.style.opacity = showCursor ? a : 0; cursor.style.transform = `translate(${x - 3}px, ${y - 2}px)`; };
  const centre = (el, fx = 0.45, fy = 0.55) => { const r = el.getBoundingClientRect(); return [r.left + r.width * fx, r.top + r.height * fy]; };

  return {
    screen,
    begin() { used = new Set(); },
    end() { for (const [id, e] of els) e.style.display = used.has(id) ? '' : 'none'; },

    card(opacity, label, pressed, buildPressed) {
      card.style.opacity = opacity; card.style.pointerEvents = opacity > 0.5 ? 'auto' : 'none';
      card.style.transform = `translateY(${(1 - opacity) * 10}px)`;
      play.textContent = label; play.classList.toggle('pressed', !!pressed);
      $('build').classList.toggle('pressed', !!buildPressed);
    },
    bar(opacity, T, current) {
      bar.style.opacity = opacity; bar.style.transform = `translateY(${(1 - opacity) * 12}px)`;
      const f = clamp(T / tourLen); fill.style.width = `${f * 100}%`; dot.style.left = `${f * 100}%`;
      chapname.textContent = current; time.textContent = `${fmt(Math.max(0, T))} / ${fmt(tourLen)}`;
      chapEls.forEach((c) => c.classList.toggle('on', c.textContent === current));
    },
    // the intro click on Play and, after DONE, the move to "Build it yourself"
    cursor(t, T, tourLen2) {
      if (!showCursor) { cursor.style.opacity = 0; return; }
      if (t < T0 + 0.4) {
        const [tx, ty] = centre(play), u = clamp((t - 0.4) / 2.0), e = u * u * (3 - 2 * u);
        moveCursor(innerWidth * 0.34 + (tx - innerWidth * 0.34) * e, innerHeight * 0.66 + (ty - innerHeight * 0.66) * e, clamp(t / 0.3) * (1 - clamp((t - T0 - 0.1) / 0.3)));
      } else if (T >= tourLen2 - 0.6) {
        const [tx, ty] = centre($('build')), u = clamp((T - tourLen2 + 0.5) / 0.85), e = u * u * (3 - 2 * u);
        moveCursor(innerWidth * 0.30 + (tx - innerWidth * 0.30) * e, innerHeight * 0.55 + (ty - innerHeight * 0.55) * e, clamp((T - tourLen2 + 0.6) / 0.3));
      } else cursor.style.opacity = 0;
    },
    cursorAt(x, y, a) { moveCursor(x, y, a); },
    grade(a) { grade.style.opacity = clamp(a); },
    badge(a, text = '0.25×') { badge.style.opacity = a; badge.textContent = text; },

    tag(id, text, p, [dx, dy], a) {
      if (a <= 0.01) return;
      const [x, y] = screen(p);
      const e = get(id, div('tag mono')); e.textContent = text; e.style.left = `${x + dx}px`; e.style.top = `${y + dy}px`; e.style.opacity = a;
      const l = get(id + ':l', sv('line', { stroke: 'rgba(40,36,32,0.55)', 'stroke-width': 1 }));
      l.setAttribute('x1', x); l.setAttribute('y1', y); l.setAttribute('x2', x + dx + (dx < 0 ? 26 : -34)); l.setAttribute('y2', y + dy + (dy < 0 ? 10 : -2)); l.style.opacity = a;
    },
    note(id, text, p, [dx, dy], write, a, blue = false) {
      if (write <= 0 || a <= 0.01) return;
      const [x, y] = screen(p);
      const e = get(id, div('note')); e.textContent = text; e.classList.toggle('blue', !!blue);
      e.style.left = `${x + dx}px`; e.style.top = `${y + dy}px`; e.style.opacity = a;
      e.style.clipPath = `inset(-20% ${(1 - clamp(write)) * 100}% -20% -5%)`;
    },
    cross(id, p, a) {
      if (a <= 0.01) return;
      const [x, y] = screen(p), s = 7;
      const e = get(id, sv('path', { stroke: '#3b3e52', 'stroke-width': 1.8, fill: 'none', 'stroke-linecap': 'round' }));
      e.setAttribute('d', `M${x - s} ${y - s}L${x + s} ${y + s}M${x + s} ${y - s}L${x - s} ${y + s}`); e.style.opacity = a;
    },
    ring(id, p, a, blue) {
      if (a <= 0.01) return;
      const [x, y] = screen(p);
      const e = get(id, sv('circle', { r: 7, fill: 'none', 'stroke-width': 1.8 }));
      e.setAttribute('cx', x); e.setAttribute('cy', y); e.setAttribute('stroke', blue ? '#2d4fb0' : '#3b3e52'); e.style.opacity = a;
    },
    // a handwritten dimension between two 3D points, text above the middle
    dim(id, A, B, text, a) {
      if (a <= 0.01) return;
      const [ax, ay] = screen(A), [bx, by] = screen(B), ang = Math.atan2(by - ay, bx - ax);
      const e = get(id, sv('path', { stroke: '#2d4fb0', 'stroke-width': 1.7, fill: 'none', 'stroke-linecap': 'round' }));
      const tick = (x, y) => `M${x - Math.sin(ang) * 7} ${y + Math.cos(ang) * 7}L${x + Math.sin(ang) * 7} ${y - Math.cos(ang) * 7}`;
      e.setAttribute('d', `M${ax} ${ay}L${bx} ${by}${tick(ax, ay)}${tick(bx, by)}`); e.style.opacity = a;
      const t = get(id + ':t', div('note blue')); t.textContent = text; t.style.left = `${(ax + bx) / 2}px`; t.style.top = `${(ay + by) / 2 - 26}px`; t.style.opacity = a; t.style.clipPath = 'none';
    },
    arrow(id, p, [dx, dy], a) {
      if (a <= 0.01) return;
      const [x, y] = screen(p), sx = x + dx, sy = y + dy, cx = x + dx * 0.15, cy = y + dy * 0.9;
      const e = get(id, sv('path', { stroke: '#2f3348', 'stroke-width': 1.5, fill: 'none', 'stroke-dasharray': '5 4', 'stroke-linecap': 'round' }));
      e.setAttribute('d', `M${sx} ${sy}Q${cx} ${cy} ${x - 10} ${y - 12}`); e.style.opacity = a;
      const h = get(id + ':h', sv('path', { stroke: '#2f3348', 'stroke-width': 1.6, fill: 'none', 'stroke-linecap': 'round' }));
      const g = Math.atan2(y - 12 - cy, x - 10 - cx), hx = x - 10, hy = y - 12;
      h.setAttribute('d', `M${hx - Math.cos(g - 0.45) * 10} ${hy - Math.sin(g - 0.45) * 10}L${hx} ${hy}L${hx - Math.cos(g + 0.45) * 10} ${hy - Math.sin(g + 0.45) * 10}`); h.style.opacity = a;
    },
  };
}
