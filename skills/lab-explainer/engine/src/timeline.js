// The film as a pure function of time: parameter tracks, button presses and
// camera shots joined by hard cuts. Nothing here touches the scene.

export const EASE = {
  out: (u) => 1 - Math.pow(1 - u, 3),
  inOut: (u) => u * u * (3 - 2 * u),
  in: (u) => u * u * u,
  linear: (u) => u,
};
const lerp = (a, b, u) => a + (b - a) * u;
const lerp3 = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);

export function createTimeline(params, story) {
  const tracks = story.tracks || {};
  const names = Object.keys(params);

  // A track is [start, duration, target, ease?]; each move starts from where the last one ended.
  function value(name, t) {
    const P = params[name], keys = tracks[name] || [];
    let prev = P.value;
    for (const [t0, d, to, ease] of keys) {
      if (t < t0) return prev;
      if (t < t0 + d) {
        const u = EASE[ease || P.ease || 'out']((t - t0) / d);
        return P.interp === 'log' ? Math.exp(lerp(Math.log(prev), Math.log(to), u)) : lerp(prev, to, u);
      }
      prev = to;
    }
    return prev;
  }
  // The value a control was last set to, and how far its highlight has faded in.
  function pressed(name, t) {
    const keys = tracks[name] || [];
    let cur = params[name].value, prev = cur, at = -1;
    for (const [t0, , to] of keys) { if (t < t0) break; prev = cur; cur = to; at = t0; }
    return { cur, prev, k: at < 0 ? 1 : Math.min(1, (t - at) / 0.18) };
  }
  function moving(name, t, lead = 0.12) {
    return (tracks[name] || []).some(([t0, d]) => t >= t0 - lead && t <= t0 + d * 0.8);
  }

  function stateAt(t) {
    t = Math.max(0, Math.min(story.duration - 1e-6, t));
    const p = {}, press = {}, move = {};
    for (const n of names) { p[n] = value(n, t); press[n] = pressed(n, t); move[n] = moving(n, t); }
    const shot = story.shots.find((s) => t >= s.t0 && t < s.t1) || story.shots.at(-1);
    const u = EASE[shot.ease || 'inOut']((t - shot.t0) / (shot.t1 - shot.t0));
    const cam = shot.from ? { pos: lerp3(shot.from.pos, shot.to.pos, u), target: lerp3(shot.from.target, shot.to.target, u), fov: shot.fov ?? 34 } : null;
    return { t, u, p, press, move, shot, cam };
  }
  return { stateAt, value, pressed, duration: story.duration };
}
