import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// One frame: the scene -> a blur-size pass -> depth of field -> overlays
// (rays, planes, marks) depth-tested against the scene -> bloom -> filmic tone
// map to the screen. Secondary views (a ground glass, a monitor) run the same
// blur on their own camera into a texture.
//
// Blur has two sources. Every surface blurs like an ordinary camera focused at
// uCamF. Surfaces tagged userData.field additionally blur by a field the film
// supplies as GLSL, fieldBlur(vec3 p) of the world position: that is how a scene
// can blur the way an instrument inside it sees, not the way the camera does.

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
export const quad = (fs, uniforms, extra = {}) => new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, ...extra }));
export const rt = (w, h, o = {}) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, ...o });

function cocMaterial(U, field) {
  const m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  if (field) m.defines = { FIELD: '' };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec3 vWp; varying float vVz;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 wpp = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        wpp = instanceMatrix * wpp;
      #endif
      vWp = (modelMatrix * wpp).xyz; vVz = -mvPosition.z;`);
    const decl = Object.keys(U).map((k) => `uniform ${U[k].value?.isVector3 ? 'vec3' : 'float'} ${k};`).join('\n');
    sh.fragmentShader = `${decl}\nvarying vec3 vWp; varying float vVz;\nfloat fieldBlur(vec3 p){ return ${U.__glsl}; }\n` + sh.fragmentShader.replace('#include <dithering_fragment>', `
      float coc = uCamK * abs(1.0 - uCamF / max(vVz, 0.01));
      #ifdef FIELD
        coc = max(coc, uField * fieldBlur(vWp));
      #endif
      gl_FragColor = vec4(min(coc, uMax), vVz, 0.0, 1.0);`);
  };
  return m;
}

// Depth of field by gathering (after Dennis Gustafsson), at half resolution,
// merged back over the sharp full-resolution frame.
const GATHER = `
uniform sampler2D tColor, tCoc; uniform vec2 uTexel; uniform float uMaxR, uRad;
varying vec2 vUv;
void main(){
  vec2 cc = texture2D(tCoc, vUv).rg; float cs = cc.r * 0.5, cz = cc.g;
  vec3 color = texture2D(tColor, vUv).rgb; float tot = 1.0, fg = 0.0, radius = uRad;
  for (float ang = 0.0; ang < 1e5; ang += 2.39996323) {
    if (radius >= uMaxR) break;
    vec2 tc = vUv + vec2(cos(ang), sin(ang)) * uTexel * radius;
    vec3 sc = texture2D(tColor, tc).rgb;
    vec2 sd = texture2D(tCoc, tc).rg; float ss = sd.r * 0.5;
    if (sd.g > cz) ss = clamp(ss, 0.0, cs * 2.0);
    float m = smoothstep(radius - 0.5, radius + 0.5, ss);
    color += mix(color / tot, sc, m);
    fg += m * step(sd.g, cz - 2.0);
    tot += 1.0; radius += uRad / radius;
  }
  gl_FragColor = vec4(color / tot, clamp(fg / tot * 4.0, 0.0, 1.0));
}`;
const MERGE = `
uniform sampler2D tSharp, tBlur, tCoc; varying vec2 vUv;
void main(){
  vec3 s = texture2D(tSharp, vUv).rgb; vec4 b = texture2D(tBlur, vUv);
  float w = max(smoothstep(0.7, 2.2, texture2D(tCoc, vUv).r), b.a);
  gl_FragColor = vec4(mix(s, b.rgb, w), 1.0);
}`;
class DoF {
  constructor(w, h, maxHalf = 24) {
    this.half = rt(w >> 1, h >> 1);
    this.gather = quad(GATHER, { tColor: { value: null }, tCoc: { value: null }, uTexel: { value: new THREE.Vector2(2 / w, 2 / h) }, uMaxR: { value: maxHalf }, uRad: { value: 0.7 } });
    this.merge = quad(MERGE, { tSharp: { value: null }, tBlur: { value: this.half.texture }, tCoc: { value: null } });
  }
  render(r, colorTex, cocTex, out) {
    const g = this.gather.material.uniforms; g.tColor.value = colorTex; g.tCoc.value = cocTex;
    r.setRenderTarget(this.half); this.gather.render(r);
    const m = this.merge.material.uniforms; m.tSharp.value = colorTex; m.tCoc.value = cocTex;
    r.setRenderTarget(out); this.merge.render(r);
  }
}

const COMPOSE = `
uniform sampler2D tBase, tOver; varying vec2 vUv;
void main(){ vec4 o = texture2D(tOver, vUv); gl_FragColor = vec4(o.rgb + texture2D(tBase, vUv).rgb * (1.0 - o.a), 1.0); }`;
const FINAL = `
uniform sampler2D tIn; uniform float uExposure, uTime, uVignette, uGrain; varying vec2 vUv;
vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 c){
  const mat3 i = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 o = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  return clamp(o * RRTAndODTFit(i * c), 0.0, 1.0);
}
vec3 srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime * 17.0) * 43758.5453); }
void main(){
  vec3 c = aces(texture2D(tIn, vUv).rgb * uExposure / 0.6);
  vec2 q = vUv - 0.5; c *= 1.0 - uVignette * smoothstep(0.25, 0.85, length(q * vec2(1.25, 1.0)));
  c = srgb(c) + (hash(vUv * 1000.0) - 0.5) * uGrain;
  gl_FragColor = vec4(c, 1.0);
}`;
const DEPTHCOPY = 'uniform sampler2D tDepth; varying vec2 vUv; void main(){ gl_FragDepth = texture2D(tDepth, vUv).r; gl_FragColor = vec4(0.0); }';

export class Pipeline {
  // field: { glsl: 'expression of p', uniforms: { name: fn(state) } } or null
  constructor(renderer, w, h, { field = null, look = {} } = {}) {
    this.r = renderer; this.w = w; this.h = h; this.field = field;
    this.U = { uField: { value: 0 }, uCamK: { value: 10 }, uCamF: { value: 200 }, uMax: { value: 46 } };
    for (const k of Object.keys(field?.uniforms || {})) this.U[k] = { value: 0 };
    Object.defineProperty(this.U, '__glsl', { value: field?.glsl || '0.0', enumerable: false });
    this.cocField = cocMaterial(this.U, true); this.cocCam = cocMaterial(this.U, false);
    this.main = rt(w, h, { samples: 4, depthBuffer: true });
    this.coc = rt(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, depthTexture: new THREE.DepthTexture(w, h) });
    this.dofOut = rt(w, h);
    this.over = rt(w, h, { samples: 4, depthBuffer: true });
    this.composed = rt(w, h);
    this.dof = new DoF(w, h, 24);
    this.copy = quad('uniform sampler2D tIn; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tIn, vUv); }', { tIn: { value: null } });
    this.depthCopy = quad(DEPTHCOPY, { tDepth: { value: this.coc.depthTexture } }, { depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth, colorWrite: false });
    this.compose = quad(COMPOSE, { tBase: { value: this.dofOut.texture }, tOver: { value: this.over.texture } });
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), look.bloom ?? 0.42, look.bloomRadius ?? 0.5, look.bloomThreshold ?? 1.0);
    this.final = quad(FINAL, { tIn: { value: this.composed.texture }, uExposure: { value: look.exposure ?? 1.0 }, uTime: { value: 0 }, uVignette: { value: look.vignette ?? 0.32 }, uGrain: { value: look.grain ?? 0.018 } });
    this.debugCoc = false;
  }
  setState(s) { for (const [k, f] of Object.entries(this.field?.uniforms || {})) this.U[k].value = typeof f === 'function' ? f(s) : f; }

  // The blur-size pass: every mesh's material is swapped for a moment.
  cocPass(scene, camera, target) {
    const back = [];
    scene.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      if (o.userData.coc === false) { back.push([o, null]); o.visible = false; return; }
      back.push([o, o.material]); o.material = o.userData.field ? this.cocField : this.cocCam;
    });
    const r = this.r;
    r.setRenderTarget(target); r.setClearColor(new THREE.Color().setRGB(0, 1e4, 0, THREE.LinearSRGBColorSpace), 1); r.clear(); r.render(scene, camera);
    for (const [o, m] of back) { if (m) o.material = m; else o.visible = true; }
  }

  // A secondary view: its own camera, blurred by the same field, left in view.out.
  makeView(w, h, { maxHalf = 26, mipmaps = true } = {}) {
    return {
      w, h,
      main: rt(w, h, { samples: 4, depthBuffer: true }),
      coc: rt(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true }),
      out: rt(w, h, mipmaps ? { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter } : {}),
      dof: new DoF(w, h, maxHalf),
    };
  }
  renderView(scene, cam, v, { fieldPx = 0, camK = 0, camF = 100, clear = 0x0b0e14, before, after } = {}) {
    const r = this.r;
    before?.();
    r.setRenderTarget(v.main); r.setClearColor(clear, 1); r.clear(); r.render(scene, cam);
    this.U.uField.value = fieldPx; this.U.uCamK.value = camK; this.U.uCamF.value = camF; this.U.uMax.value = 52;
    this.cocPass(scene, cam, v.coc);
    v.dof.render(r, v.main.texture, v.coc.texture, v.out);
    after?.();
  }
  copyTo(src, dst) { this.copy.material.uniforms.tIn.value = src; this.r.setRenderTarget(dst); this.copy.render(this.r); }

  renderMain(scene, overlay, camera, { fieldPx = 0, camK = 10, camF = 200, time = 0, clear = 0x0a0c12 }) {
    const r = this.r;
    r.setRenderTarget(this.main); r.setClearColor(clear, 1); r.clear(); r.render(scene, camera);
    this.U.uField.value = fieldPx; this.U.uCamK.value = camK; this.U.uCamF.value = camF; this.U.uMax.value = 46;
    this.cocPass(scene, camera, this.coc);
    this.dof.render(r, this.main.texture, this.coc.texture, this.dofOut);
    r.setRenderTarget(this.over); r.setClearColor(0x000000, 0); r.clear(true, true, false);
    this.depthCopy.render(r);
    r.render(overlay, camera);
    r.setRenderTarget(this.composed); this.compose.render(r);
    this.bloom.render(r, null, this.composed, 0, false);
    this.final.material.uniforms.uTime.value = time;
    r.setRenderTarget(null); this.final.render(r);
    if (this.debugCoc) {
      this.dbg ??= quad('uniform sampler2D t; varying vec2 vUv; void main(){ gl_FragColor = vec4(vec3(texture2D(t, vUv).r / 40.0), 1.0); }', { t: { value: this.coc.texture } });
      this.dbg.render(r);
    }
  }
}
