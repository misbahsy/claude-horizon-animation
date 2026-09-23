// Physics for any machine: a Rapier world built from the parts, and a bake
// that records a run so the film can replay any moment exactly.
//
// Everything moves in the plane of the drawing: dynamic bodies are locked to
// x/y translation and z rotation. That keeps stacks, dominoes and levers
// stable and makes the model do what the sketch shows. Works in the browser
// and in Node; pass the initialised RAPIER module in.

import { normalize, paramValues } from './spec.js';

export const HZ = 240;
export const G = 9.81;

const DENSITY = { pine: 450, basswood: 300, oak: 700, walnut: 650, steel: 7850, iron: 7200, brass: 8500, copper: 8900, rubber: 1100, felt: 250, paper: 700, cork: 240, glass: 2500 };
const quatZ = (a) => ({ x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) });
const rot2 = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
export const angleOfQuat = (q) => 2 * Math.atan2(q.z, q.w);

// Build the world for one set of parameters. origin is where machine (0,0)
// sits in world space. Returns handles to find bodies and parts again.
export function createWorld(RAPIER, norm, origin) {
  const R = RAPIER, [ox, oy, oz] = origin;
  const world = new R.World({ x: 0, y: -G, z: 0 });
  world.timestep = 1 / HZ;
  world.integrationParameters.numSolverIterations = 10;
  const { x0, x1 } = norm.bounds;
  const ground = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(ox + (x0 + x1) / 2, oy - 0.05, oz));
  const groundCol = world.createCollider(R.ColliderDesc.cuboid((x1 - x0) / 2 + 1.2, 0.05, 1.0).setFriction(0.6).setRestitution(0.1), ground);
  // low walls round the desk so nothing rolls off to infinity
  for (const [x, hx] of [[x0 - 0.9, 0.02], [x1 + 0.9, 0.02]]) {
    const w = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(ox + x, oy + 0.05, oz)); world.createCollider(R.ColliderDesc.cuboid(hx, 0.05, 1.0), w);
  }
  for (const z of [-0.7, 0.55]) { const w = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(ox + (x0 + x1) / 2, oy + 0.05, oz + z)); world.createCollider(R.ColliderDesc.cuboid((x1 - x0) / 2 + 1, 0.05, 0.02), w); }

  const byId = new Map(), partOf = new Map([[groundCol.handle, { id: 'ground', material: 'paper' }]]);
  // A hinge about z already keeps a body in the plane; locking its axes as well
  // makes Rapier's solver freeze it solid, so jointed bodies skip the lock.
  const jointed = new Set(norm.joints.flatMap((j) => [j.a, j.b]).filter(Boolean));
  for (const b of norm.bodies) {
    const dyn = b.type === 'dynamic';
    const desc = (dyn ? R.RigidBodyDesc.dynamic() : R.RigidBodyDesc.fixed())
      .setTranslation(ox + b.at[0], oy + b.at[1], oz).setRotation(quatZ(b.angle));
    if (dyn) {
      if (!jointed.has(b.id)) desc.enabledTranslations(true, true, false).enabledRotations(false, false, true);
      const d = b.parts[0].damping || [0.02, 0.15];
      desc.setLinearDamping(d[0]).setAngularDamping(d[1]).setCcdEnabled(b.parts.some((p) => p.ccd || p.shape === 'ball'));
    }
    const rb = world.createRigidBody(desc);
    for (const p of b.parts) {
      if (!p.collide) continue;
      const rel = rot2([p.at[0] - b.at[0], p.at[1] - b.at[1]], -b.angle), ra = p.angle - b.angle;
      let cd;
      if (p.shape === 'box') cd = R.ColliderDesc.cuboid(p.size[0] / 2, p.size[1] / 2, p.size[2] / 2);
      else if (p.shape === 'ball') cd = R.ColliderDesc.ball(p.r);
      else if (p.shape === 'cyl') cd = R.ColliderDesc.cylinder(p.d / 2, p.r);
      else {
        const pts = new Float32Array(p.pts.flatMap(([x, y]) => [x, y, -p.d / 2, x, y, p.d / 2]));
        cd = R.ColliderDesc.convexHull(pts);
        if (!cd) throw new Error(`part "${p.id}": polygon is not convex`);
      }
      cd.setTranslation(rel[0], rel[1], p.z || 0);
      if (p.shape === 'cyl') {
        // Rapier cylinders run along y; turn them to run along z, then by the part angle
        const c = Math.cos(ra / 2), s2 = Math.sin(ra / 2), h = Math.SQRT1_2;   // Rz(ra) * Rx(90 degrees)
        cd.setRotation({ x: c * h, y: s2 * h, z: s2 * h, w: c * h });
      } else cd.setRotation(quatZ(ra));
      if (p.mass != null) cd.setMass(p.mass); else cd.setDensity(p.density ?? DENSITY[p.material] ?? 500);
      cd.setFriction(p.friction).setRestitution(p.restitution)
        .setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(0.8);
      const col = world.createCollider(cd, rb);
      partOf.set(col.handle, p);
    }
    byId.set(b.id, { body: b, rb, start: { ...rb.translation() } });
  }
  for (const j of norm.joints) {
    const A = byId.get(j.a), B = j.b ? byId.get(j.b) : null;
    const local = (entry, [x, y]) => {
      if (!entry) return { x: ox + x, y: oy + y, z: oz };
      const r = rot2([x - entry.body.at[0], y - entry.body.at[1]], -entry.body.angle); return { x: r[0], y: r[1], z: 0 };
    };
    const rbB = B ? B.rb : ground;
    const anchorB = B ? local(B, j.anchor) : { x: ox + j.anchor[0] - (ox + (x0 + x1) / 2), y: oy + j.anchor[1] - (oy - 0.05), z: 0 };
    let data;
    if (j.type === 'hinge') data = R.JointData.revolute(local(A, j.anchor), anchorB, { x: 0, y: 0, z: 1 });
    else data = R.JointData.fixed(local(A, j.anchor), { x: 0, y: 0, z: 0, w: 1 }, anchorB, { x: 0, y: 0, z: 0, w: 1 });
    const joint = world.createImpulseJoint(data, A.rb, rbB, true);
    // Rapier measures this joint's angle the other way round from the drawing
    // (counter-clockwise positive), so limits are mirrored going in.
    if (j.limits && joint.setLimits) joint.setLimits(-j.limits[1], -j.limits[0]);
    if (j.motor && joint.configureMotorVelocity) joint.configureMotorVelocity(j.motor[0], j.motor[1]);
  }
  return { world, byId, partOf, origin, dynamic: norm.bodies.filter((b) => b.type === 'dynamic').map((b) => b.id) };
}

// Read-only helpers the machine's triggers and the story's notes use.
export function stateView(W) {
  const [ox, oy] = W.origin;
  const rb = (id) => { const e = W.byId.get(id); if (!e) throw new Error(`no body "${id}"`); return e.rb; };
  return {
    pos: (id) => { const t = rb(id).translation(); return [t.x - ox, t.y - oy]; },
    angle: (id) => angleOfQuat(rb(id).rotation()),
    speed: (id) => { const v = rb(id).linvel(); return Math.hypot(v.x, v.y); },
    moved: (id) => { const e = W.byId.get(id), t = e.rb.translation(); return Math.hypot(t.x - e.start.x, t.y - e.start.y); },
    vel: (id) => { const v = rb(id).linvel(); return [v.x, v.y]; },
  };
}

// A running machine: world plus the start action, holds and triggers. The same
// class drives bakes (for the film) and the live sandbox.
export class Run {
  constructor(RAPIER, machine, params, origin) {
    this.R = RAPIER; this.m = machine; this.params = paramValues(machine, params); this.origin = origin;
    this.norm = normalize(machine, this.params);
    this.W = createWorld(RAPIER, this.norm, origin);
    this.S = stateView(this.W);
    this.eq = new RAPIER.EventQueue(true);
    this.t = 0; this.started = false; this.events = []; this.fired = {}; this.hits = {}; this.snaps = {};
    this.S.hit = (a, b) => this.hits[[a, b].sort().join('|')] || 0;
    // held bodies wait (as if pinned) until the start
    // start may be a plain object or a function of the parameters
    this.st = (typeof machine.start === 'function' ? machine.start(this.params) : machine.start) || {};
    this.held = (this.st.hold || []).map((id) => this.W.byId.get(id).rb);
    this.held.forEach((rb) => rb.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true));
    for (let i = 0; i < HZ * (machine.settle ?? 0.5); i++) this.W.world.step();
    this.W.byId.forEach((e) => { e.start = { ...e.rb.translation() }; });
  }

  start() {
    if (this.started) return; this.started = true;
    const st = this.st;
    this.held.forEach((rb) => rb.setBodyType(this.R.RigidBodyType.Dynamic, true));
    for (const [id, v] of Object.entries(st.velocity || {})) this.W.byId.get(id).rb.setLinvel({ x: v[0], y: v[1], z: 0 }, true);
    for (const [id, w] of Object.entries(st.spin || {})) this.W.byId.get(id).rb.setAngvel({ x: 0, y: 0, z: w }, true);
    this.events.push({ t: this.t, type: 'start' });
  }

  step() {
    this.W.world.step(this.eq);
    this.eq.drainContactForceEvents((e) => {
      const a = this.W.partOf.get(e.collider1()), b = this.W.partOf.get(e.collider2());
      if (a && b) {
        const force = e.maxForceMagnitude();
        this.events.push({ t: this.t, type: 'contact', a: a.id, b: b.id, ra: a.rigid, rb: b.rigid, ma: a.material, mb: b.material, sa: a.sound, sb: b.sound, force });
        const k = [a.rigid, b.rigid].sort().join('|'); this.hits[k] = Math.max(this.hits[k] || 0, force);
      }
    });
    this.t += 1 / HZ;
    if (this.started) for (const tr of this.m.triggers || []) {
      if (this.fired[tr.id] == null) { let ok = false; try { ok = tr.when(this.S, this.params); } catch { ok = false; } if (ok) { this.fired[tr.id] = this.t; this.snaps[tr.id] = Object.fromEntries(this.W.dynamic.map((id) => [id, this.S.speed(id)])); this.events.push({ t: this.t, type: 'trigger', id: tr.id }); } }
    }
  }

  pose(id) { const rb = this.W.byId.get(id).rb, p = rb.translation(), q = rb.rotation(); return [p.x, p.y, p.z, q.x, q.y, q.z, q.w]; }
  asleep() { return this.W.dynamic.every((id) => { const rb = this.W.byId.get(id).rb; return rb.isSleeping() || (Math.hypot(rb.linvel().x, rb.linvel().y) < 0.004 && Math.abs(rb.angvel().z) < 0.02); }); }
  free() { this.W.world.free(); }
}

// Bake one run: settle, start at t = 0, record every dynamic body at HZ until
// `seconds`, or until everything has been still for `rest` seconds.
export function bake(RAPIER, machine, params, origin, { seconds = 12, rest = 1.2 } = {}) {
  const run = new Run(RAPIER, machine, params, origin);
  const ids = run.W.dynamic;
  const frames = [], speeds = [];
  let stillFor = 0;
  frames.push(ids.map((id) => run.pose(id))); speeds.push(ids.map(() => 0));
  run.start();
  for (let i = 1; i <= seconds * HZ; i++) {
    run.step();
    frames.push(ids.map((id) => run.pose(id)));
    speeds.push(ids.map((id) => run.S.speed(id)));
    stillFor = run.asleep() ? stillFor + 1 / HZ : 0;
    if (i > HZ && stillFor > rest) break;
  }
  const out = { params: run.params, ids, frames, speeds, hz: HZ, duration: (frames.length - 1) / HZ, events: run.events, triggers: { ...run.fired }, norm: run.norm };
  run.free();
  return out;
}

// Pose of body `id` at time t (seconds) in a bake, interpolated.
export function poseAt(b, id, t) {
  const k = b.ids.indexOf(id); if (k < 0) return null;
  const f = Math.max(0, Math.min(b.frames.length - 1, t * b.hz)), i = Math.floor(f), u = f - i;
  const A = b.frames[i][k], B = b.frames[Math.min(i + 1, b.frames.length - 1)][k];
  if (u < 1e-6) return A;
  const q = [A[3], A[4], A[5], A[6]], r = [B[3], B[4], B[5], B[6]];
  let dot = q[0] * r[0] + q[1] * r[1] + q[2] * r[2] + q[3] * r[3]; if (dot < 0) r.forEach((v, j) => (r[j] = -v));
  const m = q.map((v, j) => v + (r[j] - v) * u), n = Math.hypot(...m);
  return [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u, A[2] + (B[2] - A[2]) * u, ...m.map((v) => v / n)];
}
export const speedAt = (b, id, t) => { const k = b.ids.indexOf(id); const i = Math.max(0, Math.min(b.speeds.length - 1, Math.round(t * b.hz))); return k < 0 ? 0 : b.speeds[i][k]; };
