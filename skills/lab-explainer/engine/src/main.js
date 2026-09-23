import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Pipeline } from './pipeline.js';
import { createKit } from './kit.js';
import { createTimeline } from './timeline.js';
import { createUI } from './ui.js';

const q = new URLSearchParams(location.search);
const CAPTURE = q.has('capture');
const W = 1920, H = 1080;
window.onerror = (m) => { window.__failed = String(m); };
window.addEventListener('unhandledrejection', (e) => { window.__failed = String(e.reason?.stack || e.reason); });

const film = await import(q.get('film') || '/project/film.js');
await document.fonts.load('800 20px Outfit'); await document.fonts.load('500 12px "JetBrains Mono"'); await document.fonts.ready;

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
renderer.autoClear = false;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.querySelector('#stage').prepend(renderer.domElement);
const fit = () => { const s = Math.min(innerWidth / W, innerHeight / H); document.querySelector('#stage').style.transform = `scale(${s}) translate(-50%, -50%)`; };
fit(); addEventListener('resize', fit);

const look = film.look || {};
const scene = new THREE.Scene(), overlay = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = look.environment ?? 0.42;

const timeline = createTimeline(film.params, film.story);
const withModel = (s) => { s.d = film.derive ? film.derive(s.p, s) : {}; return s; };
const stateAt = (t, override) => { const s = timeline.stateAt(t); if (override) Object.assign(s.p, override); return withModel(s); };
const pipe = new Pipeline(renderer, W, H, { field: film.blur?.field || null, look });
const kit = createKit({ renderer, scene, overlay, pipe, W, H, stateAt });
const built = (await film.build(kit)) || {};
const ui = createUI(film.ui || {}, built.labels || {}, film.story.captions || []);
const camera = new THREE.PerspectiveCamera(34, W / H, 2, 3000);

const val = (x, s) => (typeof x === 'function' ? x(s) : x);
const tmp = new THREE.Vector3();
const toV = (a) => (a?.isVector3 ? a : new THREE.Vector3(...a));
function project(p) {
  if (!p) return null;
  tmp.copy(toV(p)).project(camera);
  if (tmp.z > 1) return null;
  return { x: (tmp.x * 0.5 + 0.5) * W, y: (-tmp.y * 0.5 + 0.5) * H };
}

function frame(t) {
  const s = stateAt(t), shot = s.shot;
  built.update?.(s);
  pipe.setState(s);
  kit.renderViews(s);
  pipe.setState(s);
  const c = shot.camera ? shot.camera(s) : s.cam;
  camera.position.set(...c.pos); camera.lookAt(...c.target); camera.fov = c.fov ?? 34; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  const focus = toV(val(shot.focus, s) || c.target);
  const camF = -focus.clone().applyMatrix4(camera.matrixWorldInverse).z;
  pipe.renderMain(scene, overlay, camera, { fieldPx: val(shot.field, s) ?? 0, camK: val(shot.camK, s) ?? 16, camF, time: t, clear: look.clear ?? 0x0a0c12 });
  let cursor = null;
  if (shot.cursor) {
    const base = project(val(shot.cursor.at, s));
    if (base) { const [dx, dy] = val(shot.cursor.offset, s) || [0, 0]; cursor = { x: base.x + dx, y: base.y + dy, grab: val(shot.cursor.grab, s) ? 1 : 0 }; }
  }
  ui.update(s, { project, cursor });
}

window.seek = (ms) => frame(ms / 1000);
window.tourInfo = { duration: film.story.duration, shots: film.story.shots.map((s) => [s.id, s.t0]) };
if (q.has('coc')) pipe.debugCoc = true;
frame(Number(q.get('t') || 0));
window.tourReady = true;
if (!CAPTURE) {
  let t0 = performance.now() - Number(q.get('t') || 0) * 1000, paused = false, pausedAt = 0;
  addEventListener('keydown', (e) => { if (e.code === 'Space') { paused = !paused; if (paused) pausedAt = performance.now(); else t0 += performance.now() - pausedAt; } });
  const loop = () => { if (!paused) frame(((performance.now() - t0) / 1000) % film.story.duration); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
