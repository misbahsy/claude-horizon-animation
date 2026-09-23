import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import * as TX from './textures.js';

// Everything a film's build(kit) needs: materials, round parts built along +x,
// the studio set (bench with a sloped control panel, room, lights), low-poly
// scenery, overlays and secondary views. Units are centimetres, y is up and the
// camera usually looks from +z.

export const hdr = (r, g, b, k = 1) => new THREE.Color(r * k, g * k, b * k);
export const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function createKit({ renderer, scene, overlay, pipe, W, H, stateAt }) {
  // ---- materials -------------------------------------------------------------
  const M = {
    black: new THREE.MeshPhysicalMaterial({ color: 0x121417, roughness: 0.38, metalness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.28 }),
    satin: new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.55, metalness: 0.35 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x0e0f11, roughness: 0.68, metalness: 0.05 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xa8722f, roughness: 0.36, metalness: 1.0, envMapIntensity: 1.0 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xb66a2c, roughness: 0.3, metalness: 1.0, emissive: hdr(1.0, 0.42, 0.1), emissiveIntensity: 0.55 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xc3c7cd, roughness: 0.22, metalness: 1.0 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xf2fbff, roughness: 0.05, metalness: 0, transmission: 1, thickness: 2.5, ior: 1.52, envMapIntensity: 1.6, specularIntensity: 1, attenuationColor: new THREE.Color(0xc6ecff), attenuationDistance: 30, side: THREE.DoubleSide }),
    rim: new THREE.MeshBasicMaterial({ color: hdr(0.9, 2.0, 2.8) }),
    rimDim: new THREE.MeshBasicMaterial({ color: hdr(0.35, 0.8, 1.15) }),
    console: new THREE.MeshStandardMaterial({ color: 0x121722, roughness: 0.55, metalness: 0.18 }),
    consoleDark: new THREE.MeshStandardMaterial({ color: 0x0b0e14, roughness: 0.5, metalness: 0.25 }),
    rail: new THREE.MeshStandardMaterial({ color: 0x1b1e24, roughness: 0.4, metalness: 0.5 }),
    ledWarm: new THREE.MeshBasicMaterial({ color: hdr(3.2, 1.5, 0.45) }),
    ledCyan: new THREE.MeshBasicMaterial({ color: hdr(0.9, 2.4, 3.4) }),
    glassEdge: new THREE.MeshBasicMaterial({ color: hdr(0.45, 1.2, 1.6) }),
    wall: new THREE.MeshStandardMaterial({ color: 0x121826, roughness: 0.9, metalness: 0 }),
  };
  const glow = (r, g, b) => new THREE.MeshBasicMaterial({ color: hdr(r, g, b) });

  // A slice of space that lights up where it cuts through surfaces made with
  // sliceMaterial: a plane n.p = d, a bright core and a faint band either side.
  const sliceU = {
    uSliceN: { value: new THREE.Vector3(1, 0, 0) }, uSliceD: { value: 0 }, uSliceW: { value: 0.3 },
    uZone: { value: 1 }, uGlow: { value: 0 }, uGlowColor: { value: new THREE.Color(0.55, 0.88, 1.0) },
  };
  const slice = {
    set({ normal, offset, width, zone, strength, color } = {}) {
      if (normal) sliceU.uSliceN.value.copy(normal).normalize();
      if (offset != null) sliceU.uSliceD.value = offset;
      if (width != null) sliceU.uSliceW.value = width;
      if (zone != null) sliceU.uZone.value = zone;
      if (strength != null) sliceU.uGlow.value = strength;
      if (color) sliceU.uGlowColor.value.set(color);
    },
    get strength() { return sliceU.uGlow.value; },
  };
  function sliceMaterial(params = {}) {
    const m = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.85, metalness: 0, ...params });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, sliceU);
      sh.vertexShader = 'varying vec3 vWp;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
        vec4 wpp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wpp = instanceMatrix * wpp;
        #endif
        vWp = (modelMatrix * wpp).xyz;`);
      sh.fragmentShader = 'uniform vec3 uSliceN, uGlowColor; uniform float uSliceD, uSliceW, uZone, uGlow;\nvarying vec3 vWp;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float dpl = abs(dot(vWp, uSliceN) - uSliceD);
        float core = 1.0 - smoothstep(uSliceW * 0.3, uSliceW, dpl);
        float band = 1.0 - smoothstep(max(uZone * 0.5 - 0.15, 0.0), uZone * 0.5 + 0.05, dpl);
        totalEmissiveRadiance += uGlowColor * uGlow * (core * 5.0 + band * 0.12);`);
    };
    return m;
  }

  // ---- geometry: round parts are built with their axis along +x ---------------
  const AX = { y: 26, z: 0 }; // default axis height, change with kit.axis(y)
  function alongX(geo, x0, y = AX.y, z = AX.z) { geo.rotateY(Math.PI / 2); geo.translate(x0, y, z); return geo; }
  // dir 'z': the part faces the camera, centred on the origin in x and y, running from a0 to a1 along z;
  // place it with mesh.position and spin it with rotation.z
  const place = (geo, a0, dir, y, z) => (dir === 'z' ? geo.translate(0, 0, a0) : alongX(geo, a0, y ?? AX.y, z ?? AX.z));
  function annulus(rIn, rOut) {
    const s = new THREE.Shape(); s.absarc(0, 0, rOut, 0, Math.PI * 2, false);
    const h = new THREE.Path(); h.absarc(0, 0, rIn, 0, Math.PI * 2, true); s.holes.push(h); return s;
  }
  function ring(rIn, rOut, x0, x1, { bevel = 0.25, y, z, dir = 'x' } = {}) {
    const g = new THREE.ExtrudeGeometry(annulus(rIn, rOut), { depth: Math.max(0.01, x1 - x0 - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 96 });
    return place(g, x0 + bevel, dir, y, z);
  }
  function gearShape(rRoot, rTip, teeth, rHole, tip = 0.42) {
    const s = new THREE.Shape();
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2, d = (Math.PI * 2) / teeth;
      [[rRoot, a], [rTip, a + d * 0.1], [rTip, a + d * (0.1 + tip)], [rRoot, a + d * (0.2 + tip)]]
        .forEach(([r, t], k) => (i === 0 && k === 0 ? s.moveTo(r * Math.cos(t), r * Math.sin(t)) : s.lineTo(r * Math.cos(t), r * Math.sin(t))));
    }
    s.closePath();
    if (rHole > 0) { const h = new THREE.Path(); h.absarc(0, 0, rHole, 0, Math.PI * 2, true); s.holes.push(h); }
    return s;
  }
  function gear(rRoot, rTip, teeth, rHole, x0, x1, { tip, bevel = 0.12, y, z, dir = 'x' } = {}) {
    const g = new THREE.ExtrudeGeometry(gearShape(rRoot, rTip, teeth, rHole, tip), { depth: x1 - x0 - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 64 });
    return place(g, x0 + bevel, dir, y, z);
  }
  // A spur gear that meshes with any other built with the same module m (cm per tooth of
  // pitch diameter): pitch radius rp = m * teeth / 2, centres rp1 + rp2 apart.
  const MESH_TIP = 0.36;
  function spurGear(teeth, m, a0, a1, { rHole, dir = 'z', y, z, bevel = 0.1 } = {}) {
    const rp = (m * teeth) / 2, g = gear(rp - 0.6 * m, rp + 0.6 * m, teeth, rHole ?? rp * 0.25, a0, a1, { tip: MESH_TIP, bevel, dir, y, z });
    g.userData.rp = rp; return g;
  }
  // The angle gear 2 must sit at to mesh with gear 1 turned to a1, when gear 2's centre
  // lies in direction `at` (radians, 0 = +x) from gear 1's. Both built by spurGear (or gear
  // with the same tip). It turns the other way, t1/t2 as fast.
  function meshAngle(t1, a1, t2, { at = 0, tip = MESH_TIP } = {}) {
    const c = 0.1 + tip / 2, d2 = (Math.PI * 2) / t2;
    return -(a1 - at) * (t1 / t2) + at + Math.PI - (2 * c + 0.5) * d2;
  }
  // Integrate a rate over time: frames are seeked in any order, so anything that
  // accumulates (an angle from a speed, a distance from a velocity) must be a
  // function of t. rate(s) is evaluated on a fixed grid once, then looked up.
  function integrate(rate, { hz = 240 } = {}) {
    let table = null;
    return (t) => {
      if (!table) {
        const dur = stateAt(1e9).t + 1 / hz, n = Math.ceil(dur * hz) + 1; table = new Float64Array(n);
        let prev = rate(stateAt(0));
        for (let i = 1; i < n; i++) { const r = rate(stateAt(i / hz)); table[i] = table[i - 1] + ((prev + r) / 2) / hz; prev = r; }
      }
      const f = Math.max(0, t * hz), i = Math.min(table.length - 2, Math.floor(f));
      return table[i] + (table[i + 1] - table[i]) * (f - i);
    };
  }
  const box = (w, h, d, r = 0.4) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01));
  function mesh(geo, mat, pos, parent = scene, { cast = true, receive = true, data } = {}) {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.copy(Array.isArray(pos) ? V(...pos) : pos);
    m.castShadow = cast; m.receiveShadow = receive;
    Object.assign(m.userData, data || {});
    parent.add(m); return m;
  }
  // Recentre a geometry built on the axis so the mesh can spin about it.
  function spinnable(m) { m.geometry.translate(0, -AX.y, -AX.z); m.position.y += AX.y; m.position.z += AX.z; return m; }
  // Tag every mesh under a group: field blur, extra render layers, no shadows...
  function tag(group, { field, layers = [], coc } = {}) {
    group.traverse((o) => {
      if (!o.isMesh) return;
      if (field != null) o.userData.field = field;
      if (coc != null) o.userData.coc = coc;
      for (const l of layers) o.layers.enable(l);
    });
    return group;
  }

  // A lens element: two spherical caps and an edge in a black cell, with a lit rim.
  function lensElement(parent, x, r, t, RF, RB, { glow: gl = 1, y, z } = {}) {
    const yy = y ?? AX.y, zz = z ?? AX.z;
    const sag = (R, p) => (R === 0 ? 0 : Math.sign(R) * (Math.abs(R) - Math.sqrt(R * R - p * p)));
    const n = 28, front = [], back = [];
    for (let i = 0; i <= n; i++) { const p = (r * i) / n; front.push(new THREE.Vector2(p, t / 2 - sag(RF, p))); back.push(new THREE.Vector2(p, -t / 2 + sag(RB, p))); }
    const cap = (pts) => { const g = new THREE.LatheGeometry(pts, 72); g.rotateZ(-Math.PI / 2); g.translate(x, yy, zz); return g; };
    const xf = front[n].y, xb = back[n].y;
    const edge = new THREE.CylinderGeometry(r, r, Math.max(0.05, xf - xb), 72, 1, true); edge.rotateZ(Math.PI / 2); edge.translate(x + (xf + xb) / 2, yy, zz);
    const data = { cast: false, data: { coc: false, glass: true } };
    mesh(cap(front), M.glass, null, parent, data); mesh(cap(back), M.glass, null, parent, data); mesh(edge, M.glass, null, parent, data);
    mesh(ring(r - 0.25, r + 1.3, x + xb - 0.5, x + xf + 0.5, { bevel: 0.2, y: yy, z: zz }), M.satin, null, parent);
    const tor = new THREE.TorusGeometry(r + 0.02, 0.07 * gl + 0.04, 8, 160); tor.rotateY(Math.PI / 2);
    const rim = mesh(tor.clone().translate(x + xf + 0.55, yy, zz), M.rim, null, parent, { cast: false });
    mesh(tor.clone().translate(x + xb - 0.55, yy, zz), M.rimDim, null, parent, { cast: false });
    return { x, r, rim, front: x + xf, back: x + xb };
  }

  // ---- the studio set ----------------------------------------------------------
  function lights({ key = {}, sun = {}, hemi = 0.42, rim = 0.9, fill = 0.35 } = {}) {
    const all = (l) => { l.layers.enableAll(); scene.add(l); return l; };
    all(new THREE.HemisphereLight(0x8fa8d6, 0x141620, hemi));
    const k = all(new THREE.SpotLight(key.color ?? 0xffcf9c, key.intensity ?? 2.3, 0, 0.55, 0.85, 0));
    k.position.set(...(key.pos || [-60, 230, 170])); k.target.position.set(...(key.target || [70, 15, 0])); scene.add(k.target);
    k.castShadow = true; k.shadow.mapSize.set(2048, 2048); k.shadow.camera.near = 100; k.shadow.camera.far = 600; k.shadow.bias = -0.0004; k.shadow.radius = 4;
    const s = all(new THREE.DirectionalLight(sun.color ?? 0xfff1dc, sun.intensity ?? 1.3));
    s.position.set(...(sun.pos || [80, 200, 110])); s.target.position.set(...(sun.target || [122, 14, 0])); scene.add(s.target);
    const bx = sun.box ?? 60;
    s.castShadow = true; s.shadow.mapSize.set(2048, 2048); Object.assign(s.shadow.camera, { left: -bx, right: bx, top: bx, bottom: -bx, near: 50, far: 400 }); s.shadow.bias = -0.0005; s.shadow.radius = 3;
    const r = all(new THREE.DirectionalLight(0x7c98ff, rim)); r.position.set(260, 120, -160);
    const f = all(new THREE.DirectionalLight(0x9fc4ff, fill)); f.position.set(-200, 60, 60);
    return { key: k, sun: s };
  }

  // Dark room: back wall with backlit panels, a cabinet with lit rings, a white pedestal, a plant.
  function room({ panels = [TX.wallArt(0), TX.wallArt(1), TX.wallArt(2)], panelX = [5, 77, 149], panelY = 101, rings = true, plant = true, pedestal = true } = {}) {
    mesh(new THREE.PlaneGeometry(900, 500), M.wall, V(80, 90, -125), scene, { cast: false });
    const floorT = TX.tileTexture(); floorT.repeat.set(10, 10);
    mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: floorT, roughness: 0.6 }), V(80, -80, 0), scene, { cast: false });
    panels.forEach((map, k) => {
      const x = panelX[k], y = panelY;
      mesh(new THREE.PlaneGeometry(62, 41), new THREE.MeshBasicMaterial({ map, color: new THREE.Color(0.85, 0.85, 0.85) }), V(x, y, -123.5), scene, { cast: false });
      const eM = glow(0.5, 1.4, 2.2);
      for (const [w, h, dx, dy] of [[64, 1.2, 0, 21], [64, 1.2, 0, -21], [1.2, 43, -32, 0], [1.2, 43, 32, 0]]) mesh(new THREE.BoxGeometry(w, h, 0.8), eM, V(x + dx, y + dy, -123.2), scene, { cast: false });
    });
    if (rings) {
      mesh(box(160, 150, 50, 1.5), new THREE.MeshStandardMaterial({ color: 0x1d222c, roughness: 0.6 }), V(262, -5, -98));
      mesh(box(160, 4, 52, 1), new THREE.MeshStandardMaterial({ color: 0x2a303b, roughness: 0.5 }), V(262, 38, -97));
      [0, 1, 2, 3].forEach((i) => mesh(new THREE.TorusGeometry(10, 0.8, 12, 96), glow(0.55, 0.78, 1.0), V(186 + i * 26, 44, -104), scene, { cast: false }));
    }
    if (pedestal) mesh(box(34, 110, 34, 1), new THREE.MeshStandardMaterial({ color: 0xe6e8ec, roughness: 0.55 }), V(236, -25, 42));
    if (plant) {
      mesh(new THREE.CylinderGeometry(9, 7, 16, 24), new THREE.MeshStandardMaterial({ color: 0xdcdde0, roughness: 0.6 }), V(-82, 8, -58));
      mesh(box(26, 88, 26, 1), new THREE.MeshStandardMaterial({ color: 0x1b1f27, roughness: 0.6 }), V(-82, -44, -58));
      const leafM = new THREE.MeshStandardMaterial({ color: 0x3d7d3a, roughness: 0.7, flatShading: true }), r = TX.rng(9);
      for (let i = 0; i < 14; i++) { const l = new THREE.IcosahedronGeometry(5 + r() * 3, 0); l.scale(0.6, 1.6, 0.6); const a = (i / 14) * Math.PI * 2; const m = mesh(l, leafM, V(-82 + Math.cos(a) * 6, 26 + r() * 12, -58 + Math.sin(a) * 6)); m.rotation.set(Math.sin(a) * 0.5, a, Math.cos(a) * 0.5); }
    }
  }

  // The bench: a console whose top carries an optical rail and whose front is a
  // steep control panel. panel.add places things on the slope at (x, v), v measured
  // down the slope from its top edge, facing the camera.
  function bench({ x0 = -45, x1 = 205, rail = [-16, 172], knobX = 40 } = {}) {
    const prof = new THREE.Shape([new THREE.Vector2(-30, 0), new THREE.Vector2(14, 0), new THREE.Vector2(34, -38), new THREE.Vector2(34, -80), new THREE.Vector2(-30, -80)]);
    const body = new THREE.ExtrudeGeometry(prof, { depth: x1 - x0, bevelEnabled: true, bevelThickness: 0.8, bevelSize: 0.8, bevelSegments: 2 });
    body.rotateY(-Math.PI / 2); body.translate(x1, 0, 0);
    mesh(body, M.console);
    const rl = rail[1] - rail[0], rc = (rail[0] + rail[1]) / 2;
    if (rl > 0) {
      mesh(box(rl, 3, 9, 0.4), M.rail, V(rc, 1.5, 0));
      mesh(new THREE.PlaneGeometry(rl, 2.2), new THREE.MeshStandardMaterial({ map: TX.rulerTexture(rl), roughness: 0.55, metalness: 0.2 }), V(rc, 1.5, 4.52), scene, { cast: false });
    }
    const w = x1 - x0 - 20;
    mesh(new THREE.PlaneGeometry(w, 2.6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: TX.rulerTexture(w), roughness: 0.55, metalness: 0.2 }), V((x0 + x1) / 2, 0.06, 9.6), scene, { cast: false });
    mesh(new THREE.BoxGeometry(x1 - x0 - 14, 0.25, 0.35), M.ledWarm, V((x0 + x1) / 2, 0.2, 13.4), scene, { cast: false });
    if (knobX != null) { const k = gear(2.3, 2.6, 28, 0, -1.7, 1.7, { y: 0, z: 0 }); k.rotateY(Math.PI / 2); mesh(k, M.brass, V(knobX, 2.2, 7.2)); }
    const slope = new THREE.Group(); slope.position.set(0, 0, 14); slope.rotation.x = Math.atan2(38, 20); scene.add(slope);
    const len = Math.hypot(38, 20);
    const add = (geo, mat, x, v, lift = 0.1, o = {}) => mesh(geo, mat, V(x, lift, v), slope, { cast: false, ...o });
    add(box(x1 - x0 - 26, 0.8, len - 6, 0.6), M.consoleDark, (x0 + x1) / 2, len / 2 + 0.5, 0.0);
    return { slope, len, add, x0, x1 };
  }

  // Things for the control panel.
  const panel = {
    // a round dial with an iris face and a warm glowing bezel
    dial(b, { x, v = 19, r = 11, open = 0.42 } = {}) {
      b.add(new THREE.CircleGeometry(r, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: TX.irisTexture(open, { disc: '#4a505b', hole: '#050608' }), roughness: 0.5, metalness: 0.4 }), x, v, 0.55);
      b.add(new THREE.TorusGeometry(r + 0.6, 0.5, 12, 96).rotateX(-Math.PI / 2), glow(3.0, 1.5, 0.55), x, v, 0.6);
      b.add(new THREE.BoxGeometry(5, 0.3, 0.6), M.ledWarm, x, 37.5, 0.5);
    },
    // a strip of thumbnails (textures), one of which can be selected
    strip(b, { textures, xs, v = 15.3, w = 22, h = 14.7 }) {
      const cx = (xs[0] + xs.at(-1)) / 2;
      b.add(box(xs.at(-1) - xs[0] + w + 3, 1.2, h + 6.3, 0.6), new THREE.MeshStandardMaterial({ color: 0x0c0e12, roughness: 0.4 }), cx, v + 0.2, 0.2);
      const thumbs = xs.map((x, i) => {
        const m = b.add(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: textures[i], color: new THREE.Color(0.92, 0.92, 0.92) }), x, v, 0.95);
        const border = new THREE.Group(); border.position.set(x, 0.9, v); b.slope.add(border);
        const eM = new THREE.MeshBasicMaterial({ color: hdr(1.2, 2.8, 3.6) });
        for (const [bw, bd, dx, dz] of [[w + 2, 0.5, 0, -(h / 2 + 0.85)], [w + 2, 0.5, 0, h / 2 + 0.85], [0.5, h + 2.2, -(w / 2 + 1), 0], [0.5, h + 2.2, w / 2 + 1, 0]]) { const e = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.3, bd), eM); e.position.set(dx, 0.2, dz); border.add(e); }
        return { mesh: m, border, x };
      });
      return { thumbs, select(i) { thumbs.forEach((t, k) => { const on = k === i; t.border.visible = on; t.mesh.scale.setScalar(on ? 1.08 : 1); t.mesh.position.y = on ? 1.4 : 0.95; t.mesh.material.color.setScalar(on ? 1.15 : 0.8); }); } };
    },
    // a lit track with a knob; set(x) moves the knob, the track is lit up to it
    slider(b, { x0, x1, v = 30, chevrons = true } = {}) {
      b.add(new THREE.BoxGeometry(x1 - x0, 0.3, 0.7), new THREE.MeshStandardMaterial({ color: 0x2a3140 }), (x0 + x1) / 2, v, 0.6);
      const fill = b.add(new THREE.BoxGeometry(1, 0.35, 0.8), M.ledCyan, x0, v, 0.75);
      const knob = b.add(new THREE.CylinderGeometry(1.5, 1.5, 1.8, 32), M.steel, x0, v, 1.2, { cast: true });
      const n = Math.round((x1 - x0) / 2.5);
      for (let i = 0; i <= n; i++) b.add(new THREE.BoxGeometry(0.18, 0.2, i % 5 ? 0.8 : 1.6), new THREE.MeshBasicMaterial({ color: 0x55606e }), x0 + (i * (x1 - x0)) / n, v + 2.2, 0.55);
      if (chevrons) for (const [x, dir] of [[x0 - 8.5, -1], [x1 + 8.5, 1]]) for (const s of [1, -1]) { const c = b.add(new THREE.BoxGeometry(3.2, 0.3, 0.55), M.ledCyan, x, v + s * 1.05, 0.7); c.rotation.y = s * dir * 0.75; }
      return { set(x) { x = Math.max(x0, Math.min(x1, x)); knob.position.x = x; fill.scale.x = Math.max(0.01, x - x0); fill.position.x = x0 + (x - x0) / 2; } };
    },
    // a round gauge with a needle; set(f) points it at f from 0 to 1 across a 270° sweep
    gauge(b, { x, v = 19, r = 10, label = '', ticks = 10 } = {}) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 512; const g = cv.getContext('2d');
      g.fillStyle = '#0d1118'; g.beginPath(); g.arc(256, 256, 252, 0, 7); g.fill();
      g.strokeStyle = '#d9e2ee'; g.lineCap = 'round';
      for (let i = 0; i <= ticks * 5; i++) { const a = (-225 + (270 * i) / (ticks * 5)) * (Math.PI / 180), big = i % 5 === 0, r0 = big ? 196 : 214; g.globalAlpha = big ? 0.9 : 0.5; g.lineWidth = big ? 7 : 3; g.beginPath(); g.moveTo(256 + Math.cos(a) * r0, 256 + Math.sin(a) * r0); g.lineTo(256 + Math.cos(a) * 236, 256 + Math.sin(a) * 236); g.stroke(); }
      g.globalAlpha = 0.75; g.fillStyle = '#c9d3e0'; g.textAlign = 'center'; g.font = '600 44px "JetBrains Mono", monospace'; g.fillText(label, 256, 380);
      const face = new THREE.CanvasTexture(cv); face.colorSpace = THREE.SRGBColorSpace;
      b.add(new THREE.CircleGeometry(r, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: face, roughness: 0.5, metalness: 0.2 }), x, v, 0.55);
      b.add(new THREE.TorusGeometry(r + 0.6, 0.5, 12, 96).rotateX(-Math.PI / 2), glow(3.0, 1.5, 0.55), x, v, 0.6);
      const pivot = new THREE.Group(); pivot.position.set(x, 0.9, v); b.slope.add(pivot);
      const needle = new THREE.Mesh(new THREE.BoxGeometry(r * 0.82, 0.2, 0.35), glow(3.2, 1.6, 0.5)); needle.position.x = r * 0.36; pivot.add(needle);
      b.add(new THREE.CylinderGeometry(0.8, 0.8, 0.6, 24), M.brass, x, v, 1.0);
      return { set(f) { pivot.rotation.y = -(-225 + 270 * Math.max(0, Math.min(1, f))) * (Math.PI / 180); } };
    },
    // round discs with iris faces; select(i) lights one rim
    discs(b, { xs, v = 19, r = 8, opens = [0.66, 0.2, 0.07] } = {}) {
      b.add(box(xs.at(-1) - xs[0] + 2 * r + 8, 1.0, 2 * r + 10, 0.6), new THREE.MeshStandardMaterial({ color: 0x101217, roughness: 0.45 }), (xs[0] + xs.at(-1)) / 2, v, 0.3);
      const rims = xs.map((x, i) => {
        b.add(new THREE.CircleGeometry(r, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: TX.irisTexture(opens[i] ?? 0.3), roughness: 0.55, metalness: 0.4, color: 0x9aa0aa }), x, v, 0.95);
        return b.add(new THREE.TorusGeometry(r + 0.3, 0.3, 10, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: hdr(2.4, 2.8, 3.2), transparent: true }), x, v, 1.0);
      });
      b.add(new THREE.BoxGeometry(5, 0.3, 0.6), M.ledWarm, (xs[0] + xs.at(-1)) / 2, 37.5, 0.5);
      return { select(i) { rims.forEach((m, k) => { m.material.opacity = k === i ? 1 : 0.12; }); } };
    },
  };

  // ---- low-poly scenery (a subject for the instrument to look at) ---------------
  const lowpoly = {
    // gentle terrain over a rectangle; height(x, z) may add hills, colorAt(x, z, y) may paint paths
    terrain(parent, { x0, x1, z, top, height = () => 0, colorAt, seed = 3 }) {
      const rnd = TX.rng(seed);
      const hAt = (x, zz) => { const edge = Math.min(1, (x - x0) / 3, (x1 - x) / 3, (z - Math.abs(zz)) / 3); return top + 0.4 + Math.max(0, edge) * (0.8 + 0.7 * Math.sin(x * 0.19 + 1.3) * Math.cos(zz * 0.21) + 0.45 * Math.sin(x * 0.41 + zz * 0.33) + height(x, zz)); };
      let g = new THREE.PlaneGeometry(x1 - x0 - 1.6, 2 * z - 1.6, Math.round((x1 - x0) / 1.6), Math.round(z / 0.8)); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0, 0);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, hAt(p.getX(i), p.getZ(i)) + (rnd() - 0.5) * 0.25);
      g = g.toNonIndexed(); const q = g.attributes.position, cols = [];
      const greens = [0x5fae45, 0x6bb84c, 0x58a441, 0x74bf52].map((c) => new THREE.Color(c));
      for (let f = 0; f < q.count; f += 3) {
        const cx = (q.getX(f) + q.getX(f + 1) + q.getX(f + 2)) / 3, cz = (q.getZ(f) + q.getZ(f + 1) + q.getZ(f + 2)) / 3, cy = (q.getY(f) + q.getY(f + 1) + q.getY(f + 2)) / 3;
        const c = colorAt?.(cx, cz, cy) ?? greens[Math.floor(rnd() * 4)];
        for (let k = 0; k < 3; k++) cols.push(c.r, c.g, c.b);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.computeVertexNormals();
      mesh(g, sliceMaterial({ vertexColors: true }), null, parent, { cast: false });
      return hAt;
    },
    pine(parent, x, z, h, { ground = () => 0, seed = 0 } = {}) {
      const rnd = TX.rng(seed + 101), y0 = ground(x, z) - 0.3;
      const mats = lowpoly._pineMats ??= [0x2f8a3c, 0x3a9a42, 0x46a849, 0x2c7f39].map((c) => sliceMaterial({ color: c }));
      const trunk = lowpoly._trunk ??= sliceMaterial({ color: 0x6d4a2d });
      mesh(new THREE.CylinderGeometry(h * 0.035, h * 0.05, h * 0.22, 6), trunk, V(x, y0 + h * 0.11, z), parent);
      for (let t = 0; t < 3; t++) {
        const r = h * (0.3 - t * 0.068), hh = h * (0.44 - t * 0.04), cone = new THREE.ConeGeometry(r, hh, 7); cone.rotateY(rnd() * 2);
        mesh(cone, mats[(seed + t) % 4], V(x, y0 + h * 0.2 + t * h * 0.21 + hh / 2, z), parent);
      }
      return V(x, y0 + h * 0.66, z);
    },
    bush(parent, x, z, r, { ground = () => 0, seed = 0 } = {}) {
      const mats = lowpoly._bushMats ??= [0x86bf4a, 0x97c955, 0x7ab443].map((c) => sliceMaterial({ color: c }));
      const g = new THREE.IcosahedronGeometry(r, 0); g.rotateY(seed);
      return mesh(g, mats[seed % 3], V(x, ground(x, z) + r * 0.7, z), parent);
    },
    // a cabin whose lit front wall faces -x; returns the point on that wall
    cabin(parent, x, z, { ground = () => 0, windows = [5.5, 3.3, 1.3] } = {}) {
      const cy = ground(x, z) - 0.2;
      const wallM = sliceMaterial({ color: 0xb97f4c }), roofM = sliceMaterial({ color: 0x4d3a33 }), darkM = sliceMaterial({ color: 0x2b211c });
      mesh(new THREE.BoxGeometry(9, 6.2, 8), wallM, V(x, cy + 3.1, z), parent);
      const roof = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-5.9, 0), new THREE.Vector2(5.9, 0), new THREE.Vector2(0, 4.4)]), { depth: 9.4, bevelEnabled: false }); roof.translate(0, 0, -4.7);
      mesh(roof, roofM, V(x, cy + 6.1, z), parent);
      mesh(new THREE.BoxGeometry(1.4, 3.2, 1.4), darkM, V(x + 2.4, cy + 8.6, z - 2), parent);
      const winM = new THREE.MeshBasicMaterial({ color: hdr(...windows) });
      for (const dz of [-2.1, 2.1]) mesh(new THREE.PlaneGeometry(1.7, 1.9).rotateY(-Math.PI / 2), winM, V(x - 4.52, cy + 3.3, z + dz), parent, { cast: false });
      mesh(new THREE.PlaneGeometry(1.8, 1.9), winM, V(x + 1.8, cy + 3.4, z + 4.02), parent, { cast: false });
      mesh(new THREE.PlaneGeometry(1.8, 3.4), darkM, V(x - 1.6, cy + 1.7, z + 4.02), parent, { cast: false });
      const lamp = new THREE.PointLight(0xffb060, 1.6, 26, 0); lamp.position.set(x - 7, cy + 4, z); lamp.layers.enableAll(); parent.add(lamp);
      return { front: V(x - 4.5, cy + 3.3, z), winM };
    },
    // a jittered low-poly peak with snow; returns the summit
    mountain(parent, x, z, r, h, { ground = () => 0, seed = 21 } = {}) {
      const rr = TX.rng(seed); let geo = new THREE.ConeGeometry(r, h, 6, 3, false);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < h / 2 - 0.01) { p.setX(i, p.getX(i) * (0.85 + rr() * 0.3)); p.setZ(i, p.getZ(i) * (0.85 + rr() * 0.3)); p.setY(i, y + (rr() - 0.5) * h * 0.08); } }
      geo = geo.toNonIndexed(); const q = geo.attributes.position, c = [];
      const low = new THREE.Color(0x6f7189), mid = new THREE.Color(0x9294ab), snow = new THREE.Color(0xeef0f6);
      for (let f = 0; f < q.count; f += 3) {
        const yy = (q.getY(f) + q.getY(f + 1) + q.getY(f + 2)) / 3 / h + 0.5;
        const col = yy > 0.8 ? snow : yy > 0.4 ? mid.clone().lerp(low, rr() * 0.5) : low.clone().lerp(mid, rr() * 0.4);
        for (let k = 0; k < 3; k++) c.push(col.r, col.g, col.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); geo.computeVertexNormals();
      const base = ground(x, z) - 1;
      mesh(geo, sliceMaterial({ vertexColors: true }), V(x, base + h / 2, z), parent);
      return V(x, base + h, z);
    },
    // a painted sky in a black frame, standing at x and turned toward the room by `turn` radians
    backdrop(parent, x, { top = 13, w = 50, h = 44, turn = 0.42 } = {}) {
      const g = new THREE.Group(); g.position.set(x, 0, 0); g.rotation.y = turn; parent.add(g);
      const sky = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateY(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: TX.skyTexture(), color: new THREE.Color(1.15, 1.15, 1.15) }));
      sky.position.set(0, top + h / 2 - 1, 0); g.add(sky);
      const frameM = sliceMaterial({ color: 0x15171b });
      for (const [y, hh, z, ww] of [[top + h - 0.4, 1.4, 0, w + 2.8], [top - 1.2, 1.4, 0, w + 2.8], [top + h / 2 - 0.8, h + 2, w / 2 + 1.1, 1.4], [top + h / 2 - 0.8, h + 2, -w / 2 - 1.1, 1.4]]) mesh(new THREE.BoxGeometry(1.6, hh, ww), frameM, V(0.7, y, z), g);
      for (const z of [-w / 2 + 5, w / 2 - 5]) mesh(box(2.2, top + 1, 2.2, 0.3), M.black, V(0.7, (top - 1) / 2, z), g);
      return g;
    },
    // a dark tray with a wood rim, for a scene to stand in
    tray(parent, { x0, x1, z, top }) {
      mesh(box(x1 - x0 + 1, 3, 2 * z + 1, 0.4), M.consoleDark, V((x0 + x1) / 2, top - 1.7, 0), parent);
      const woodT = TX.woodTexture(); woodT.repeat.set(3, 1);
      const woodM = sliceMaterial({ map: woodT, flatShading: false, roughness: 0.7 });
      mesh(new THREE.BoxGeometry(x1 - x0 + 1.6, 3.6, 0.9), woodM, V((x0 + x1) / 2, top - 0.4, z + 0.7), parent);
      mesh(new THREE.BoxGeometry(x1 - x0 + 1.6, 3.6, 0.9), woodM, V((x0 + x1) / 2, top - 0.4, -z - 0.7), parent);
      mesh(new THREE.BoxGeometry(0.9, 3.6, 2 * z + 2.3), woodM, V(x0 - 0.3, top - 0.4, 0), parent);
    },
  };

  // ---- overlays ------------------------------------------------------------------
  // Thin glowing line segments drawn over the blurred scene, hidden behind solid things.
  function lines({ color = [1.15, 1.3, 1.5], width = 1.1, opacity = 0.62 } = {}) {
    const mat = new LineMaterial({ linewidth: width, transparent: true, opacity, depthWrite: false });
    mat.color.setRGB(...color); mat.resolution.set(W, H);
    const obj = new LineSegments2(new LineSegmentsGeometry(), mat); obj.frustumCulled = false; overlay.add(obj);
    return { object: obj, material: mat, set(pos) { obj.geometry.dispose(); obj.geometry = new LineSegmentsGeometry().setPositions(pos.length ? pos : [0, 0, 0, 0, 0, 0]); } };
  }
  // A glass sheet with a grid, facing +x (rotate the returned mesh for other directions).
  function gridPlane(w, h, { color = [0.95, 1.02, 1.12] } = {}) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ map: TX.gridTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, color: new THREE.Color(...color) }));
    overlay.add(m); return m;
  }
  const markMat = new THREE.MeshBasicMaterial({ color: hdr(1.6, 1.8, 2.0), transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
  // A circle outline (a blur disc) or a dot (a sharp point), facing +x.
  function mark() {
    const ringM = new THREE.Mesh(new THREE.RingGeometry(0.93, 1.0, 64).rotateY(Math.PI / 2), markMat);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24).rotateY(Math.PI / 2), markMat);
    overlay.add(ringM, dot);
    return { set(pos, r) { ringM.visible = r > 0.3; dot.visible = r <= 0.3; ringM.position.copy(pos); ringM.scale.setScalar(Math.max(r, 0.3)); dot.position.copy(pos); } };
  }

  // ---- secondary views -------------------------------------------------------------
  // Another camera rendered into a texture every frame, blurred by the film's field.
  const views = [];
  function view({ camera, size = [768, 512], layer = 1, clear = 0x0b0e14, fieldPx = 0, camK = 0, camF = 100, slice: sliceOn = false, every = true }) {
    camera.layers.set(layer); camera.updateMatrixWorld();
    const v = pipe.makeView(size[0], size[1]);
    const val = (x, s) => (typeof x === 'function' ? x(s) : x);
    const render = (s) => {
      const keep = slice.strength;
      pipe.setState(s);
      pipe.renderView(scene, camera, v, { fieldPx: val(fieldPx, s), camK: val(camK, s), camF: val(camF, s), clear, before: () => { if (!sliceOn) sliceU.uGlow.value = 0; }, after: () => { sliceU.uGlow.value = keep; } });
    };
    const api = { camera, texture: v.out.texture, render,
      // render once at another state and keep the picture (for thumbnails)
      snapshot(s, [w, h] = [size[0] >> 1, size[1] >> 1]) { render(s); const t = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter }); pipe.copyTo(v.out.texture, t); return t.texture; },
    };
    if (every) views.push(api);
    return api;
  }

  return {
    THREE, scene, overlay, renderer, W, H, M, V, hdr, tex: TX, glow,
    axis(y, z = 0) { AX.y = y; AX.z = z; },
    alongX, annulus, ring, gearShape, gear, spurGear, meshAngle, integrate, box, mesh, spinnable, tag, lensElement,
    slice, sliceMaterial, lights, room, bench, panel, lowpoly, lines, gridPlane, mark, view,
    stateAt, renderViews(s) { for (const v of views) v.render(s); },
  };
}
