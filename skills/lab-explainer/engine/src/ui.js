// The overlay UI, built from the film's ui block: a title card with live stats
// and a sentence rebuilt from the numbers every frame, a control panel whose
// buttons light up as the timeline presses them, part labels pinned to 3D
// anchors, and a scripted cursor.

const $ = (s) => document.querySelector(s);
const val = (x, s) => (typeof x === 'function' ? x(s) : x);
const h = (tag, cls, html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; e.innerHTML = html; return e; };

export function createUI(spec, labels = {}, captions = []) {
  const theme = spec.theme || {};
  // The corner UI is drawn like a web page; scale it up so it survives being watched as a video.
  const k = spec.scale ?? 1.3;
  $('#left').style.transform = `scale(${k})`; $('#left').style.transformOrigin = '0 0';
  $('#panel').style.transform = `scale(${k})`; $('#panel').style.transformOrigin = '100% 0';
  if (theme.accent) document.documentElement.style.setProperty('--cyan', theme.accent);
  if (theme.warm) document.documentElement.style.setProperty('--orange', theme.warm);
  const [kicker, title] = spec.title || ['', ''];
  // a number and its unit never wrap apart
  const glue = (html) => String(html).replace(/(\d)\s+(?=[A-Za-zµ°%Ω])/g, '$1&nbsp;');
  $('#left').append(h('div', 'kicker', kicker), h('div', 'title', title), h('div', 'intro', glue(spec.intro || '')));
  const stats = h('div', 'stats'); $('#left').append(stats);
  const statEls = (spec.stats || []).map((st) => { const e = h('div', 'stat', `<div class="k">${st.label}</div><div class="v${st.accent ? ' c' : ''}"></div>`); stats.append(e); return { st, v: e.querySelector('.v') }; });
  const explain = h('div', '', ''); explain.id = 'explain'; $('#left').append(explain);
  if (!spec.explain) explain.style.display = 'none';

  // control panel rows
  const panel = $('#panel'), groups = [], sliders = [], heads = [];
  if (!spec.panel?.length) panel.style.display = 'none';
  (spec.panel || []).forEach((row, ri) => {
    const r = h('div', 'row'); if (ri) r.style.marginTop = '9px'; panel.append(r);
    for (const g of row) {
      const col = h('div', 'col'); col.style[g.width ? 'width' : 'flex'] = g.width ? `${g.width}px` : '1';
      const head = h('div', 'head', `<span>${g.label}</span><span class="hint"></span>`); col.append(head);
      heads.push({ g, el: head.querySelector('.hint') });
      if (g.buttons) {
        const line = h('div', ''); line.style.cssText = 'display:flex;align-items:center;gap:6px';
        const seg = h('div', 'seg');
        const btns = g.buttons.options.map(([label, value]) => { const b = h('span', `b${g.buttons.mono ? ' m' : ''}`, label); seg.append(b); return { b, value }; });
        line.append(seg);
        if (g.icons) line.insertAdjacentHTML('beforeend', `<span style="flex:1"></span><span class="icon"><svg viewBox="0 0 16 16" fill="#dfe6ef"><rect x="1" y="4" width="10" height="8" rx="1.5"/><path d="M11 7l4-2.2v6.4L11 9z"/></svg></span><span class="icon"><svg viewBox="0 0 16 16" fill="none" stroke="#dfe6ef" stroke-width="1.6"><circle cx="8" cy="8" r="6.5"/><path d="M6.2 6.2a1.9 1.9 0 1 1 2.6 1.8c-.6.3-.8.7-.8 1.3"/><circle cx="8" cy="11.6" r=".4" fill="#dfe6ef"/></svg></span>`);
        col.append(line); groups.push({ g, btns });
      }
      if (g.slider) {
        const s = h('div', 'slider', '<div class="track"></div><div class="fill"></div><div class="thumb"></div>');
        for (let i = 0; i <= 20; i++) { const t = h('div', 'tick'); t.style.left = `${(i / 20) * 100}%`; s.append(t); }
        col.append(s); sliders.push({ g, fill: s.querySelector('.fill'), thumb: s.querySelector('.thumb') });
      }
      r.append(col);
    }
  });

  const tags = {};
  for (const [id, L] of Object.entries(labels)) {
    const e = h('div', 'tag', `<span>${L.text}</span><span class="sub"></span>`); e.style.display = 'none'; e.style.transform = `translate(-5px, -50%) scale(${spec.labelScale ?? k * 1.15})`; e.style.transformOrigin = '0 50%'; $('#tags').append(e);
    tags[id] = { L, e, sub: e.querySelector('.sub') };
  }
  let lastExplain = '', lastCaption = '';
  const cap = $('#caption');

  function update(s, { project, cursor }) {
    for (const { st, v } of statEls) v.textContent = val(st.value, s);
    if (spec.explain) { const x = glue(spec.explain(s)); if (x !== lastExplain) { explain.innerHTML = x; lastExplain = x; } }
    for (const { g, el } of heads) el.textContent = g.value ? val(g.value, s) : g.hint || '';
    for (const { g, btns } of groups) {
      const pr = s.press[g.buttons.param];
      for (const { b, value } of btns) {
        const on = value === pr.cur ? pr.k : value === pr.prev && pr.prev !== pr.cur ? 1 - pr.k : 0;
        const press = value === pr.cur && pr.k < 1 ? (1 - pr.k) * 0.35 : 0;
        b.style.background = `rgba(${on > 0.5 ? '238,242,247' : '200,208,220'},${Math.max(on * 0.96, press)})`;
        b.style.color = on > 0.5 ? '#0e131b' : '#d4dbe5';
      }
    }
    for (const { g, fill, thumb } of sliders) { const p = Math.max(0, Math.min(1, g.slider.at(s))); fill.style.width = `${p * 100}%`; thumb.style.left = `${p * 100}%`; }
    const show = s.shot.labels || [];
    for (const [id, t] of Object.entries(tags)) {
      const q = show.includes(id) ? project(val(t.L.at, s)) : null;
      if (!q || q.x < 20 || q.x > 1900 || q.y < 20 || q.y > 1060) { t.e.style.display = 'none'; continue; }
      t.e.style.display = 'flex'; t.e.style.left = `${q.x}px`; t.e.style.top = `${q.y}px`;
      t.sub.textContent = t.L.sub ? val(t.L.sub, s) : '';
    }
    // captions: [start, end, html or fn, { top }], fading in and out over 0.3 s
    const c = captions.filter(([t0, t1]) => s.t >= t0 && s.t < t1).at(-1);
    if (c) {
      const [t0, t1, text, o = {}] = c, a = Math.min(1, (s.t - t0) / 0.3, (t1 - s.t) / 0.3);
      const html = glue(val(text, s));
      if (html !== lastCaption) { cap.innerHTML = html; lastCaption = html; }
      cap.className = o.top ? 'top' : '';
      cap.style.opacity = a; cap.style.transform = `translateX(-50%) translateY(${(1 - a) * (o.top ? -10 : 10)}px)`;
    } else cap.style.opacity = 0;
    $('#cursor').style.opacity = cursor ? 1 : 0;
    if (cursor) { $('#cursor').style.transform = `translate(${cursor.x}px, ${cursor.y}px)`; $('#grab').style.opacity = cursor.grab; }
  }
  return { update };
}
