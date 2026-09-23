// Boot any machine: load its spec, bake the story's runs and the sandbox
// session, build the scene, then either hand frames to window.seek(ms) for
// capture (?capture=1) or play live, with a working "Build it yourself".

import * as THREE from 'three';
import RAPIER from 'rapier';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { normalize, paramValues } from './spec.js';
import { bake } from './physics.js';
import { Paper } from './sketch.js';
import { buildScene } from './model.js';
import { createStory, layout, T0 } from './story.js';
import { createUI } from './ui.js';
import { Live, bakeSession, createSandboxView, sessionCursor } from './sandbox.js';
import { windowCookie } from './textures.js';

const params = new URLSearchParams(location.search);
const capture = params.has('capture');
const dpr = Number(params.get('dpr')) || Math.min(devicePixelRatio, 2);
const machine = (await import(params.get('machine') || '/project/machine.js')).default;

await Promise.all(['66px "Gochi Hand"', '500 40px "Caveat"', '500 16px "Geist"', '500 12px "Geist Mono"'].map((f) => document.fonts.load(f)));
await RAPIER.init({});

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: capture });
renderer.setPixelRatio(dpr); renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcfcac2);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.24;
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 20);

// window light from the left: a spotlight with the window's bars as a cookie
scene.add(new THREE.HemisphereLight(0xfff4e6, 0x7a5a3c, 0.2));
const sun = new THREE.SpotLight(0xffe9d0, 3.1, 0, 0.66, 0.5, 0);
const span = machine.paper.w / 0.841;
sun.position.set(-1.25 * span, 1.75 * span, 0.95 * span); sun.target.position.set(0, 0, -0.08);
sun.map = windowCookie(); sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.00012; sun.shadow.normalBias = 0.003;
sun.shadow.camera.near = 0.8; sun.shadow.camera.far = 5;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0xe8eefa, 0.12); fill.position.set(1.2, 0.8, 1.4); scene.add(fill);

// the story's runs, baked once
const firstRun = machine.story.find((c) => c.run);
const readCh = machine.story.find((c) => c.chapter === 'READ');
const norm0 = normalize(machine, paramValues(machine, readCh?.params || firstRun?.run || {}));
const paper = new Paper(machine, norm0);
const W = buildScene(scene, machine, norm0, paper.texture);
const t0 = performance.now();
const bakes = {};
for (const c of machine.story) if (c.run) bakes[c.name || c.chapter] = bake(RAPIER, machine, c.run, W.origin, { seconds: c.seconds ?? 12 });
const session = machine.sandbox?.script ? bakeSession(RAPIER, machine, W.origin, 60) : null;
const summary = Object.entries(bakes).map(([k, b]) => `${k}: ${Object.keys(b.triggers).length}/${(machine.triggers || []).length} steps, ${b.duration.toFixed(2)}s`).join('; ');
console.log(`baked in ${(performance.now() - t0).toFixed(0)}ms. ${summary}`);

const lineRes = new THREE.Vector2(innerWidth, innerHeight);
const { chapters, length: TOUR_LEN } = layout(machine, bakes);
const ui = createUI(camera, { showCursor: capture, chapters, tourLen: TOUR_LEN, T0, machine });
const story = createStory({ machine, scene, camera, W, paper, bakes, ui, lineRes, RAPIER });
const sbv = createSandboxView({ machine, scene, camera, W, lineRes, ui, normAt: story.normAt });
const BUILD_AT = TOUR_LEN + 1.0;                       // tour time when the sandbox opens
const VIDEO_LEN = T0 + (session ? BUILD_AT + session.length : TOUR_LEN + 2.2);

function resize() {
  renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  lineRes.set(innerWidth, innerHeight);
  scene.traverse((o) => { if (o.material instanceof LineMaterial) o.material.resolution.set(innerWidth, innerHeight); });
}
addEventListener('resize', resize); resize();

// ---- the recorded sandbox session
const cursorOf = session ? sessionCursor(session.script, { ...sbv.targets, build: () => { const r = document.getElementById('build').getBoundingClientRect(); return [r.left + r.width * 0.45, r.top + r.height * 0.55]; } }) : null;
function sessionFrame(b) {
  const f = session.frames[Math.max(0, Math.min(session.frames.length - 1, Math.round(b * session.fps)))];
  const pressed = new Set();
  for (const s of session.script) {
    if (b < s.t - 0.05 || b > s.t + (s.dur || 0) + 0.15) continue;
    if (s.do === 'run') pressed.add('fire'); else if (s.do === 'reset') pressed.add('reset'); else if (s.do === 'slowmo') pressed.add('tSlow');
    else if (s.do === 'trails') pressed.add('tPath'); else if (s.do === 'view') pressed.add('view:' + s.view); else if (s.do === 'param') pressed.add('param:' + s.id);
  }
  const hint = f.hint ? { text: f.hint.text, a: Math.min(1, (b - f.hint.from) / 0.3) * (1 - Math.max(0, Math.min(1, (b - f.hint.until) / 0.3))) } : null;
  ui.begin();
  story.frameAt(0);                     // resets tour-only layers
  ui.begin();
  sbv.apply({ ...f, trails: session.trails, counts: f.trails, viewU: (b - f.viewAt) / 0.9, panel: Math.min(1, Math.max(0, (b - 0.05) / 0.3)), hint, pressed });
  scene.updateMatrixWorld();
  ui.card(0, 'Play again', false, false); ui.bar(0, TOUR_LEN, ''); ui.grade(0); ui.badge(f.slow ? 1 : 0, '0.25×');
  const [cx, cy] = cursorOf(b); ui.cursorAt(cx, cy, b < session.length - 0.4 ? 1 : 0);
  ui.end();
}

function frameAt(t) {
  const T = t - T0;
  if (session && T >= BUILD_AT) sessionFrame(T - BUILD_AT);
  else { sbv.hideAll(); story.frameAt(t); }
  renderer.render(scene, camera);
}
window.seek = (ms) => frameAt(ms / 1000);
window.tourInfo = { duration: VIDEO_LEN, fps: 60, tour: TOUR_LEN, chapters: chapters.map((c) => [c.name, c.start, c.dur]), runs: Object.fromEntries(Object.entries(bakes).map(([k, b]) => [k, { triggers: b.triggers, duration: b.duration }])) };
const evs = (b) => b.events;
window.soundData = {
  T0, TOUR_LEN, VIDEO_LEN, BUILD_AT, read: story.readSchedule.items.map((i) => i.s), dims: (machine.dims || []).length, readStart: chapters.find((c) => c.chapter === 'READ')?.start,
  groups: story.groupOrder.length, chapters: chapters.map((c) => ({ name: c.name, chapter: c.chapter, start: c.start, dur: c.dur, run: !!c.run, of: c.of, from: c.from, speed: c.speed, rewind: c.rewind })),
  runs: Object.fromEntries(Object.entries(bakes).map(([k, b]) => [k, { events: evs(b), duration: b.duration }])),
  session: session ? { events: session.events, script: session.script } : null,
};

if (capture) { document.getElementById('loading').remove(); frameAt(0); window.tourReady = true; }
else {
  document.getElementById('loading').style.opacity = 0; setTimeout(() => document.getElementById('loading').remove(), 500);
  // live: intro, the tour in real time, and a working sandbox
  let mode = 'intro', start = 0, live = null, slow = false, trailsOn = true, sketch = 0, view = 'hero', prevView = 'hero', viewAt = -9, last = performance.now();
  const $ = (id) => document.getElementById(id);
  const at = params.has('t') ? Number(params.get('t')) : null;
  $('play').onclick = () => { mode = 'tour'; start = performance.now() - T0 * 1000; };
  const openSandbox = () => {
    mode = 'sandbox'; live = live || new Live(RAPIER, machine, machine.sandbox?.params || {}, W.origin);
    $('panel').classList.add('live'); $('hint').textContent = machine.sandbox?.hintText || 'Press Run'; viewAt = -9;
  };
  $('build').onclick = openSandbox;
  $('fire').onclick = () => live && live.start();
  $('reset').onclick = () => { if (live) { live.reset(live.params); live.clearTrails(); } };
  $('replay').onclick = () => { $('panel').classList.remove('live'); mode = 'tour'; start = performance.now() - T0 * 1000; };
  $('tSlow').onclick = () => (slow = !slow);
  $('tPath').onclick = () => (trailsOn = !trailsOn);
  document.querySelectorAll('#views button').forEach((b) => (b.onclick = () => { prevView = view; view = b.dataset.v; viewAt = performance.now() / 1000; }));
  const dragSlider = (el, onValue, onDone) => {
    el.addEventListener('pointerdown', (e) => {
      const r = el.getBoundingClientRect(), set = (x) => onValue(Math.max(0, Math.min(1, (x - r.left) / r.width)));
      el.setPointerCapture(e.pointerId); set(e.clientX);
      el.onpointermove = (m) => set(m.clientX);
      el.onpointerup = () => { el.onpointermove = null; el.onpointerup = null; onDone && onDone(); };
    });
  };
  let pending = null;
  for (const [id, sl] of Object.entries(sbv.sliders)) dragSlider(sl.el, (f) => { const p = sl.p; pending = { ...(pending || {}), [id]: +(p.min + f * (p.max - p.min)).toFixed(6) }; }, () => { if (live && pending) live.setParams(pending); pending = null; });
  dragSlider($('slSketch'), (f) => (sketch = 1 - f));
  const loop = () => {
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (at != null) frameAt(at);
    else if (mode === 'intro') frameAt(0);
    else if (mode === 'tour') { const t = (now - start) / 1000; if (t - T0 > TOUR_LEN + 0.8) { openSandbox(); } frameAt(Math.min(t, T0 + TOUR_LEN + 0.8)); }
    else {
      live.step(dt * (slow ? 0.25 : 1));
      ui.begin(); story.frameAt(0); ui.begin();
      sbv.apply({ params: pending ? { ...live.params, ...pending } : live.params, poses: pending ? null : live.poses(), ids: live.run.W.dynamic, trails: live.trails.map((t) => t.pts), counts: live.trails.map((t) => t.pts.length),
        stats: live.stats(), slow, trailsOn, sketch, view, prevView, viewU: (now / 1000 - viewAt) / 0.9, panel: 1, hint: { text: $('hint').textContent, a: live.running ? 0 : 1 }, pressed: new Set() });
      ui.card(0, 'Play again', false, false); ui.bar(0, TOUR_LEN, ''); ui.grade(0); ui.badge(slow ? 1 : 0, '0.25×'); ui.end();
      renderer.render(scene, camera);
    }
    requestAnimationFrame(loop);
  };
  loop();
  window.tourReady = true;
}
