// Helpers for describing a machine, and the normaliser the engine runs on it.
//
// A machine is drawn in side view, like the sketch: x runs right, y runs up
// from the ground line, z is depth towards the viewer. Units are metres and
// kilograms; mm() converts. Every part is a solid with a 2D profile (what the
// pencil draws) extruded to a depth (what the model and the physics use).
//
// Parts that share a `rigid` id move as one body (a seesaw plank and the stops
// on it). Joints connect rigid bodies to each other or to the world.

export const mm = (v) => v / 1000;
export const deg = (v) => (v * Math.PI) / 180;

const base = (o) => ({
  group: o.group || o.id, label: o.label, body: o.body || 'fixed', rigid: o.rigid || o.id,
  at: o.at || [0, 0], angle: o.angle || 0, z: o.z || 0,
  material: o.material || 'pine', mass: o.mass, density: o.density,
  friction: o.friction ?? 0.5, restitution: o.restitution ?? 0.1,
  shade: !!o.shade, sketch: o.sketch !== false, collide: o.collide !== false,
  ccd: !!o.ccd, damping: o.damping, sound: o.sound, id: o.id,
});

// A box centred on `at`, size [w, h, d].
export const box = (o) => ({ ...base(o), shape: 'box', size: o.size });

// A plank from one point to another, t thick and d deep.
export function beam(o) {
  const [x0, y0] = o.from, [x1, y1] = o.to;
  const l = Math.hypot(x1 - x0, y1 - y0);
  return { ...base({ ...o, at: [(x0 + x1) / 2, (y0 + y1) / 2], angle: Math.atan2(y1 - y0, x1 - x0) }), shape: 'box', size: [l, o.t, o.d] };
}

export const ball = (o) => ({ ...base({ material: 'steel', ...o }), shape: 'ball', r: o.r, shade: o.shade ?? true });

// A disc or cylinder whose axis runs along z (a wheel, a pulley, a peg).
export const wheel = (o) => ({ ...base(o), shape: 'cyl', r: o.r, d: o.d });

// A convex polygon in local coordinates, extruded to depth d.
export const poly = (o) => ({ ...base(o), shape: 'poly', pts: o.pts, d: o.d });

// A hinge (revolute joint about z) between rigid body a and b, or the world
// when b is omitted. anchor is in machine coordinates. limits in radians.
export const hinge = (o) => ({ type: 'hinge', a: o.a, b: o.b || null, anchor: o.anchor, limits: o.limits, motor: o.motor });

// A weld between two rigid bodies.
export const weld = (o) => ({ type: 'weld', a: o.a, b: o.b, anchor: o.anchor });

// ---------------------------------------------------------------------------

export function paramValues(machine, overrides = {}) {
  const p = {};
  for (const [k, d] of Object.entries(machine.params || {})) p[k] = d.value;
  return { ...p, ...overrides };
}

// Rotate a local 2D point by a part's angle and move it to the part's centre.
export const place = (part, [x, y]) => {
  const c = Math.cos(part.angle), s = Math.sin(part.angle);
  return [part.at[0] + x * c - y * s, part.at[1] + x * s + y * c];
};

// The 2D outline of a part in machine coordinates: a closed polygon, or a circle.
export function outline(part) {
  if (part.shape === 'ball' || part.shape === 'cyl') return { circle: [part.at, part.r] };
  if (part.shape === 'box') {
    const [w, h] = part.size;
    return { poly: [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map((q) => place(part, q)) };
  }
  return { poly: part.pts.map((q) => place(part, q)) };
}

export const depthOf = (p) => (p.shape === 'box' ? p.size[2] : p.shape === 'ball' ? p.r * 2 : p.d);

// Run the machine's build() for a set of parameter values and check it: ids
// are unique, sizes do not change with parameters (only placement may), and
// every joint names a real body. Returns parts, bodies and joints.
export function normalize(machine, params, reference = null) {
  const built = machine.build(params);
  const parts = built.parts.map((p, i) => ({ ...p, index: i }));
  const ids = new Set();
  for (const p of parts) {
    if (!p.id) throw new Error(`part ${p.index} has no id`);
    if (ids.has(p.id)) throw new Error(`duplicate part id "${p.id}"`);
    ids.add(p.id);
  }
  if (reference) {
    for (const p of parts) {
      const r = reference.parts.find((q) => q.id === p.id);
      if (!r) throw new Error(`part "${p.id}" appears only for some parameter values; parameters may move parts, not add them`);
      const sz = (q) => JSON.stringify([q.size, q.r, q.d, q.pts]);
      if (sz(r) !== sz(p)) throw new Error(`part "${p.id}" changes size with parameters; only its position and angle may change`);
    }
  }
  // rigid bodies: the first part of each group sets the body origin
  const bodies = new Map();
  for (const p of parts) {
    if (!bodies.has(p.rigid)) bodies.set(p.rigid, { id: p.rigid, type: p.body, parts: [], at: p.at, angle: p.angle });
    const b = bodies.get(p.rigid);
    if (b.type !== p.body) throw new Error(`rigid "${p.rigid}" mixes fixed and dynamic parts`);
    b.parts.push(p);
  }
  for (const j of built.joints || []) {
    for (const k of [j.a, j.b]) if (k && !bodies.has(k)) throw new Error(`joint names unknown body "${k}"`);
  }
  // bounds of everything, for cameras and the sheet of paper
  let x0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of parts) {
    const o = outline(p);
    const pts = o.circle ? [[o.circle[0][0] - o.circle[1], o.circle[0][1] + o.circle[1]], [o.circle[0][0] + o.circle[1], o.circle[0][1]]] : o.poly;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  return { parts, bodies: [...bodies.values()], joints: built.joints || [], bounds: { x0, x1, y0: 0, y1 } };
}
