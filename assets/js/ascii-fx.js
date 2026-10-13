// ASCII effects.
//
// Everything here draws text into <canvas> with the same luminance ramp the
// profile reveal uses, or scrambles real text into glyphs and back. Each
// animated canvas runs only while it is on screen, at a modest frame rate,
// and sits still when the visitor prefers reduced motion.

(function () {
  const RAMP = " .'`^\",:;Il!i><~+_-?][}{1)(tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
  const SCRAMBLE = '01GSXKEBC8?+#@&%$*;:~<>';
  const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  const C = {
    navy: [27, 42, 65], midblue: [94, 132, 185], pale: [201, 213, 227],
    clay: [200, 98, 58], amber: [222, 147, 77], sage: [91, 127, 110]
  };
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;


  const clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const rgba = (c, a) => 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
  const rampChar = (lum) => RAMP[(clamp01(lum) * (RAMP.length - 1)) | 0];
  const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const parseColor = (s) => {
    const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(s);
    return m ? [+m[1], +m[2], +m[3]] : C.navy;
  };

  // Shared ticker: every live canvas gets a frame at ~15 fps, and only while
  // it is on screen and the tab is visible.
  const live = new Set();
  const FRAME_MS = 1000 / 15;
  let last = 0;
  function tick(now) {
    if (now - last >= FRAME_MS) {
      last = now;
      const t = now / 1000;
      live.forEach(fn => fn(t));
    }
    requestAnimationFrame(tick);
  }
  if (!reduced) requestAnimationFrame(tick);

  const seen = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      const fn = e.target._frame;
      if (!fn) return;
      if (e.isIntersecting) live.add(fn); else live.delete(fn);
    });
  }, { threshold: 0.05 });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) live.clear(); else document.querySelectorAll('canvas').forEach(c => { if (c._frame && c._onScreen) live.add(c._frame); });
  });

  // Things that belong to the current page (the main column) and must be
  // torn down when nav.js swaps it: listeners, scene canvases, timers.
  const pageListeners = [], pageCanvases = [];
  let pageTimers = [];
  function pageOn(target, type, fn) { target.addEventListener(type, fn); pageListeners.push([target, type, fn]); }
  document.addEventListener('ascii:page-leave', () => {
    for (const [t, ty, fn] of pageListeners) t.removeEventListener(ty, fn);
    pageListeners.length = 0;
    for (const c of pageCanvases) { seen.unobserve(c); if (c._frame) live.delete(c._frame); c._frame = null; }
    pageCanvases.length = 0;
    for (const id of pageTimers) clearInterval(id);
    pageTimers = [];
    document.querySelectorAll('.display-name, .section-title, .card-title').forEach(el => decoder.unobserve(el));
  });

  // live ripples (made in drift(), felt by the cloudscape too)
  const ripples = [];
  // radius of a wave's front in a given direction: a circle bent by three
  // sine lobes at random phases, the finest of which churns with time
  function frontR(rp, ang, age) {
    const w = rp.wobble;
    return rp.speed * age * (1 + w[3] * Math.sin(3 * ang + w[0]) + w[4] * Math.sin(5 * ang + w[1]) + w[5] * Math.sin(8 * ang + w[2] + age * 3));
  }

  // ── a glyph grid on a canvas ─────────────────────────────────────
  // cellPx is in CSS pixels. `paint(col, row, t)` returns null for an empty
  // cell or [lum, color, char?]. The canvas background stays transparent.
  function makeGrid(canvas, cellPx, paint) {
    const ctx = canvas.getContext('2d');
    let cols = 0, rows = 0, cell = cellPx, dpr = 1;

    function resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      cols = Math.max(1, Math.round(w / cellPx));
      rows = Math.max(1, Math.round(h / cellPx));
      cell = w / cols;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = '600 ' + (cell + 1).toFixed(1) + 'px ' + MONO;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
    }

    function frame(t) {
      if (!cols) resize();
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      const rowH = canvas.clientHeight / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const v = paint(c / cols, r / rows, t, c, r);
          if (!v || v[0] <= 0.02) continue;
          ctx.fillStyle = v[1];
          if (v[3]) ctx.font = '700 ' + (cell * v[3]).toFixed(1) + 'px ' + MONO;
          ctx.fillText(v[2] || rampChar(v[0]), (c + 0.5) * cell, (r + 0.5) * rowH);
          if (v[3]) ctx.font = '600 ' + (cell + 1).toFixed(1) + 'px ' + MONO;
        }
      }
    }

    resize();
    canvas._frame = frame; frame.__canvas = canvas;
    canvas._onScreen = true;
    frame(0);
    if (!reduced) seen.observe(canvas);
    pageCanvases.push(canvas);
    pageOn(window, 'resize', () => { resize(); frame(performance.now() / 1000); });
    return { frame, resize };
  }

  // ── research card: a basin with valleys, and points descending into them ─
  // The surface is a bowl that rises toward the rim, with hills and hollows
  // drifting inside it, so every descent ends in an interior valley. The
  // pointer raises a hill under itself, so moving over the figure reshapes
  // the terrain and pushes the points around. A click drops a new point.
  function landscape(canvas) {
    // [cx, cy, amplitude (negative = hollow), width, drift x, drift y]
    const bumps = [
      [0.25, 0.3, 0.9, 0.05, 0.11, 0.07], [0.7, 0.25, -0.7, 0.06, -0.09, 0.13],
      [0.45, 0.7, 0.8, 0.07, 0.12, -0.08], [0.8, 0.7, -0.6, 0.04, -0.07, -0.1],
      [0.2, 0.75, -0.5, 0.05, 0.08, 0.1], [0.5, 0.42, -0.45, 0.03, 0.06, 0.09]
    ];
    const cursor = { x: 0.5, y: 0.5, on: false, k: 0 };   // k eases toward on/off
    function height(x, y, t) {
      const bx = (x - 0.5) * 2, by = (y - 0.5) * 2;
      let h = 1.1 * (bx * bx + by * by);                    // the bowl
      for (const b of bumps) {
        const cx = b[0] + Math.sin(t * 0.17 + b[4] * 40) * b[4];
        const cy = b[1] + Math.cos(t * 0.13 + b[5] * 40) * b[5];
        const dx = (x - cx) / 0.42, dy = (y - cy) / 0.36;
        h += b[2] * Math.exp(-(dx * dx + dy * dy) / (2 * (b[3] + 0.054)));
      }
      if (cursor.k > 0.001) {
        const dx = (x - cursor.x) / 0.42, dy = (y - cursor.y) / 0.36;
        h += cursor.k * 1.1 * Math.exp(-(dx * dx + dy * dy) / 0.09);
      }
      return h;
    }

    const balls = [];
    const MAX_BALLS = 6;
    // start on a hill inside the basin, never on the rim
    function spawnHigh(t) {
      let best = null;
      for (let i = 0; i < 12; i++) {
        const x = 0.2 + Math.random() * 0.6, y = 0.2 + Math.random() * 0.6, h = height(x, y, t);
        if (!best || h > best[2]) best = [x, y, h];
      }
      return { x: best[0], y: best[1], age: 0, trail: [], auto: true };
    }
    balls.push(spawnHigh(0));

    function step(t) {
      cursor.k += ((cursor.on ? 1 : 0) - cursor.k) * 0.12;
      for (let i = balls.length - 1; i >= 0; i--) {
        const b = balls[i];
        const e = 0.01;
        const gx = (height(b.x + e, b.y, t) - height(b.x - e, b.y, t)) / (2 * e);
        const gy = (height(b.x, b.y + e, t) - height(b.x, b.y - e, t)) / (2 * e);
        const g = Math.hypot(gx, gy);
        b.x = clamp01(b.x - gx * 0.012); b.y = clamp01(b.y - gy * 0.012);
        b.trail.push([b.x, b.y]); if (b.trail.length > 18) b.trail.shift();
        b.age++;
        const settled = (g < 0.05 && b.age > 40) || b.age > 400;
        if (settled) {
          if (b.auto) balls[i] = spawnHigh(t);       // the house point always comes back
          else balls.splice(i, 1);                   // dropped points fade once they settle
        }
      }
    }

    let lastT = -1;
    const grid = makeGrid(canvas, 7, (u, v, t, c, r) => {
      if (c === 0 && r === 0 && t !== lastT) { lastT = t; step(t); }
      const h = clamp01((height(u, v, t) + 0.6) / 2.2);   // hollows ~0, inner hills ~0.5, rim ~1
      // a round, feathered edge rather than a box
      const vig = clamp01(2.2 - Math.hypot((u - 0.5) * 2, (v - 0.5) * 2) * 1.6);
      if (vig <= 0) return null;
      for (const b of balls) {
        if (Math.abs(u - b.x) < 0.013 && Math.abs(v - b.y) < 0.017) return [1, rgba(C.clay, 1), '@', 2.4];
      }
      for (const b of balls) {
        for (let i = b.trail.length - 1; i >= 0; i--) {
          if (Math.abs(u - b.trail[i][0]) < 0.012 && Math.abs(v - b.trail[i][1]) < 0.016) return [0.7, rgba(C.clay, 0.3 + 0.65 * i / b.trail.length), i > b.trail.length - 4 ? '*' : '·'];
        }
      }
      // slope: lit from the upper left, shaded on the far side
      const e = 0.012;
      const hx = height(u + e, v, t) - height(u - e, v, t), hy = height(u, v + e, t) - height(u, v - e, t);
      const lit = clamp01(0.5 - (hx + hy) * 2.2);
      // contour bands: a bright line every level, a faint band between
      const lv = (h * 7) % 1;
      const line = lv < 0.16 ? 1 : 0;
      if (h < 0.16 && !line) return null;                  // the floor of a hollow is open
      // between the lines the fill thins toward the valleys so the terrain breathes
      if (!line && hash(c, r, 9) > 0.55 + h * 0.45) return null;
      const lum = line ? (0.6 + h * 0.4) * vig : (0.1 + h * 0.45 + lit * 0.2) * vig;
      const col = line ? mix(C.navy, C.clay, Math.pow(h, 1.2)) : mix(mix(C.pale, C.midblue, 0.55 + lit * 0.3), C.amber, h * 0.8);
      return [lum, rgba(col, (line ? 0.6 + h * 0.4 : 0.28 + h * 0.4) * vig)];
    });

    function at(ev) {
      const r = canvas.getBoundingClientRect();
      return [clamp01((ev.clientX - r.left) / r.width), clamp01((ev.clientY - r.top) / r.height)];
    }
    canvas.addEventListener('pointermove', (ev) => {
      const p = at(ev); cursor.x = p[0]; cursor.y = p[1]; cursor.on = true;
      if (reduced) grid.frame(performance.now() / 1000);
    });
    canvas.addEventListener('pointerleave', () => { cursor.on = false; });
    pageOn(document, 'ascii:thunder', () => {
      for (const b of bumps) { b[0] = 0.15 + Math.random() * 0.7; b[1] = 0.15 + Math.random() * 0.7; b[2] = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5); }
      for (let i = 0; i < 6; i++) { if (balls.length >= MAX_BALLS) balls.splice(1, 1); balls.push({ x: Math.random(), y: Math.random(), age: 0, trail: [], auto: false }); }
    });
    canvas.addEventListener('pointerdown', (ev) => {
      const p = at(ev);
      if (balls.length >= MAX_BALLS) balls.splice(1, 1);   // keep the house point, drop the oldest extra
      balls.push({ x: p[0], y: p[1], age: 0, trail: [], auto: false });
      if (reduced) { step(performance.now() / 1000); grid.frame(performance.now() / 1000); }
    });
  }

  // ── footer: two hills rendered as glyph density, with a slow wave ─
  function hills(canvas) {
    const front = (x, t) => 0.55 * Math.exp(-Math.pow((x - 0.3 + 0.02 * Math.sin(t * 0.3)) / 0.33, 2)) + 0.38 * Math.exp(-Math.pow((x - 0.82) / 0.22, 2));
    const back  = (x, t) => 0.72 * Math.exp(-Math.pow((x - 0.6 + 0.02 * Math.cos(t * 0.25)) / 0.3, 2));
    makeGrid(canvas, 8, (u, v, t) => {
      const y = 1 - v;
      const f = front(u, t), b = back(u, t);
      if (y < f) {
        const depth = (f - y) / f;
        const wave = 0.12 * Math.sin(u * 14 + t * 0.9 + y * 6);
        return [0.25 + depth * 0.7 + wave, rgba(C.navy, 0.55 + depth * 0.4)];
      }
      if (y < b) {
        const depth = (b - y) / b;
        return [0.1 + depth * 0.45, rgba(C.midblue, 0.25 + depth * 0.35)];
      }
      return null;
    });
  }

  // ── value noise, shared by the cloudscape and the meadow ─────────
  const hash = (x, y, z) => {
    let n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const fade = (t) => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  function noise(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
    const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
    const z0 = lerp(lerp(c(0, 0, 0), c(1, 0, 0), xf), lerp(c(0, 1, 0), c(1, 1, 0), xf), yf);
    const z1 = lerp(lerp(c(0, 0, 1), c(1, 0, 1), xf), lerp(c(0, 1, 1), c(1, 1, 1), xf), yf);
    return lerp(z0, z1, zf);
  }
  function fbm(x, y, z) {
    return 0.5 * noise(x, y, z) + 0.25 * noise(x * 2.1, y * 2.1, z) + 0.125 * noise(x * 4.3, y * 4.3, z) + 0.0625 * noise(x * 8.7, y * 8.7, z);
  }

  // ── storm: ridges, rain in gusts, cloud, and lightning ───────────
  // Three mountain ridges in ASCII with weather over them. Rain streaks
  // lean with the wind, which comes in gusts. Every so often a bolt forks
  // down out of the cloud: the scene flashes, the crests light up, and a
  // burst of sparks is thrown out into the background field.
  function storm(canvas, opts) {
    opts = opts || {};
    const ctx = canvas.getContext('2d');
    const cellPx = 7;
    let W = 0, H = 0, cols = 0, rows = 0, lastT = 0;
    let ridges = [];            // per layer: array of crest y (px) per column
    const rain = [];
    let bolt = null, flash = 0, nextBolt = 0;
    const cloudTop = 0, cloudBot = () => H * (opts.cloud || 0.36);

    function resize() {
      W = canvas.clientWidth; H = canvas.clientHeight;
      if (!W || !H) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      cols = Math.round(W / cellPx); rows = Math.round(H / cellPx);
      // back ridge high and soft, front ridge low and sharp
      const layers = [[0.5, 0.16, 1.6, 11], [0.64, 0.14, 2.6, 23], [0.8, 0.1, 3.4, 37]];
      ridges = layers.map(([base, amp, freq, seed]) => {
        const ys = [];
        for (let c = 0; c <= cols; c++) {
          const u = c / cols;
          ys.push(H * (base - amp * (fbm(u * freq + seed, seed, 0) * 1.6 - 0.4)));
        }
        return ys;
      });
      const want = Math.round(cols * (opts.rain == null ? 1.6 : opts.rain));
      while (rain.length < want) rain.push(newDrop(true));
      rain.length = want;
    }
    function newDrop(anywhere) {
      return { x: Math.random() * W * 1.3 - W * 0.05, y: anywhere ? Math.random() * H : -10 - Math.random() * 60, s: 260 + Math.random() * 220, a: 0.25 + Math.random() * 0.5 };
    }
    const wind = (t) => 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * 0.21), 2) + (noise(t * 0.5, 9, 0) - 0.5) * 0.6;

    function makeBolt(t) {
      // strike on the right half, from the cloud base down to the front ridge
      const x0 = W * (0.5 + Math.random() * 0.4);
      const c0 = Math.min(cols, Math.max(0, Math.round(x0 / cellPx)));
      const yEnd = ridges[2][c0];
      const main = [];
      let x = x0, y = cloudBot() * 0.8;
      while (y < yEnd) {
        main.push([x, y]);
        x += (Math.random() - 0.5) * 26;
        y += 8 + Math.random() * 12;
      }
      main.push([x, yEnd]);
      const branches = [];
      for (let b = 0; b < 1 + Math.floor(Math.random() * 3); b++) {
        const from = main[Math.floor(Math.random() * main.length * 0.7)];
        const dir = Math.random() < 0.5 ? -1 : 1;
        let bx = from[0], by = from[1];
        const seg = [];
        for (let k = 0; k < 4 + Math.random() * 7; k++) { seg.push([bx, by]); bx += dir * (4 + Math.random() * 14); by += 4 + Math.random() * 10; }
        branches.push(seg);
      }
      bolt = { main, branches, born: t, strike: [x, yEnd] };
      flash = 1;
      // sparks fly out into the page from the strike point
      const box = canvas.getBoundingClientRect();
      const n = 6 + Math.floor(Math.random() * 6);
      for (let i = 0; i < n; i++) {
        const a = -Math.PI * (0.15 + Math.random() * 0.7), sp = 180 + Math.random() * 220;
        document.dispatchEvent(new CustomEvent('ascii:launch', { detail: {
          x: box.left + x, y: box.top + yEnd, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          ch: '*+x^'[Math.floor(Math.random() * 4)], color: Math.random() < 0.6 ? '#DE934D' : '#C8623A'
        }}));
      }
      nextBolt = t + (opts.boltEvery || 9) * (0.6 + Math.random() * 0.9);
    }

    function frame(t) {
      if (!W) resize();
      const dt = lastT ? Math.min(t - lastT, 0.2) : 0; lastT = t;
      ctx.clearRect(0, 0, W, H);
      if (!nextBolt) nextBolt = t + 3 + Math.random() * 4;
      const frenzy = t < frenzyUntil;
      if (dt && t > nextBolt && !reduced) { makeBolt(t); if (frenzy) nextBolt = t + 0.5; }
      flash *= Math.pow(0.02, dt);
      const w = frenzy ? 1.3 : wind(t);
      const wantRain = Math.round(cols * (opts.rain == null ? 1.6 : opts.rain) * (frenzy ? 2.2 : 1));
      while (rain.length < wantRain) rain.push(newDrop(false));
      if (!frenzy && rain.length > wantRain) rain.length = wantRain;
      const cb = cloudBot();

      // storm cloud across the top, lit from below when the bolt fires
      for (let r = 0; r < Math.ceil(cb / cellPx); r++) {
        const v = (r * cellPx) / cb;
        for (let c = 0; c < cols; c++) {
          const u = c / cols;
          const gate = 0.55 + 0.45 * clamp01((u - 0.1) * 2);            // heavier toward the right
          const n = fbm(u * 2.6 + t * 0.04, v * 2.2, t * 0.03);
          const d = clamp01((n - 0.5 + (1 - v) * 0.18) / 0.22) * gate;
          if (d < 0.08) continue;
          const col = mix(C.navy, C.amber, flash * 0.8 * (1 - v));
          ctx.fillStyle = rgba(col, (0.12 + d * 0.5) * clamp01(1.5 - v * 1.3));
          ctx.font = '600 8px ' + MONO;
          ctx.fillText(rampChar(0.1 + d * 0.75), (c + 0.5) * cellPx, (r + 0.5) * cellPx);
        }
      }

      // ridges, back to front: a bright crest line, thinning into the mass below
      const cols3 = [mix(C.sage, C.pale, 0.55), mix(C.sage, C.navy, 0.4), C.navy];
      const alpha3 = [0.45, 0.6, 0.8];
      for (let L = 0; L < 3; L++) {
        const ys = ridges[L];
        const front = L === 2 ? ys : null;
        for (let c = 0; c < cols; c++) {
          const crest = ys[c];
          const limit = L < 2 ? ridges[L + 1][c] : H;   // hidden behind the next ridge forward
          const slope = (ys[c + 1] - ys[c]) / cellPx;
          const rowStart = Math.ceil(crest / cellPx);
          for (let r = rowStart; r < Math.min(rows, Math.ceil(limit / cellPx)); r++) {
            const y = (r + 0.5) * cellPx;
            const edge = r === rowStart;
            const depth = (y - crest) / (H * 0.1);
            const dens = Math.exp(-depth * 1.1) * (0.95 - L * 0.2) + 0.1;
            // the mass thins in clumps, never on the crest itself
            if (!edge && depth > 0.3 && noise(c * 0.3, r * 0.3, L * 7) > dens) continue;   // solid just under the crest
            const ch = edge ? (slope > 0.3 ? '\\' : slope < -0.3 ? '/' : '^') : rampChar(dens * 0.75);
            const col = edge ? mix(cols3[L], C.amber, flash * 0.9) : cols3[L];
            ctx.fillStyle = rgba(col, edge ? Math.min(1, alpha3[L] + 0.2) : alpha3[L] * (0.35 + dens * 0.65));
            ctx.font = '600 ' + (edge ? 9 : 8) + 'px ' + MONO;
            ctx.fillText(ch, (c + 0.5) * cellPx, y);
          }
        }
      }

      // rain, leaning with the gusts
      ctx.font = '600 9px ' + MONO;
      const lean = w * 0.9;
      for (const d of rain) {
        d.y += d.s * dt; d.x -= d.s * lean * 0.5 * dt;
        const c = Math.min(cols, Math.max(0, Math.round(d.x / cellPx)));
        if (d.y > ridges[2][c] + 6 || d.y > H || d.x < -20) Object.assign(d, newDrop(false));
        if (d.x < 0 || d.x > W) continue;
        ctx.fillStyle = rgba(mix(C.midblue, C.navy, 0.3), d.a * (0.35 + w * 0.65));
        ctx.fillText(lean > 0.7 ? '/' : lean > 0.4 ? '/' : '|', d.x, d.y);
      }

      // lightning: the bolt lingers for a third of a second after the flash
      if (bolt) {
        const age = t - bolt.born;
        if (age < 0.5) {
          const a = age < 0.08 ? 1 : clamp01(1 - (age - 0.08) / 0.4);
          const drawSeg = (seg, w) => {
            for (let i = 0; i < seg.length; i++) {
              const [x, y] = seg[i];
              const nx = seg[i + 1] ? seg[i + 1][0] - x : 0;
              ctx.font = '700 ' + w + 'px ' + MONO;
              ctx.fillStyle = rgba(mix(C.amber, [250, 240, 210], 0.5), a);
              ctx.fillText(nx > 3 ? '\\' : nx < -3 ? '/' : '|', x, y);
            }
          };
          drawSeg(bolt.main, 12);
          bolt.branches.forEach(b => drawSeg(b, 9));
        } else bolt = null;
      }
    }

    let frenzyUntil = 0;
    pageOn(document, 'ascii:thunder', () => { nextBolt = 0; frenzyUntil = performance.now() / 1000 + 2.5; });
    resize();
    frame(0);
    canvas._frame = frame; frame.__canvas = canvas;
    canvas._onScreen = true;
    if (!reduced) seen.observe(canvas);
    pageCanvases.push(canvas);
    pageOn(window, 'resize', resize);
  }

  // ── orrery: a sun, planets on orbits, a moon, and a comet ─────────
  // Each body is a small disc of glyphs shaded by a light from the sun;
  // orbits are faint dotted rings; the comet's tail streams away from the sun.
  function orrery(canvas) {
    const ctx = canvas.getContext('2d');
    const cell = 7;
    let W = 0, H = 0, lastT = 0;
    const bodies = [
      { a: 0.12, period: 9,  r: 2.2, col: C.clay,    moon: null },
      { a: 0.2,  period: 16, r: 3.4, col: C.midblue, moon: { a: 0.045, period: 2.6, r: 1.1 } },
      { a: 0.29, period: 28, r: 2.8, col: C.sage,    moon: null },
      { a: 0.38, period: 47, r: 4.2, col: C.amber,   moon: null, ring: true }
    ];
    const comet = { e: 0.78, a: 0.44, period: 38, phase: 2.1 };
    function resize() {
      W = canvas.clientWidth; H = canvas.clientHeight;
      if (!W || !H) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    }
    // a disc of glyphs: dense on the lit side (toward the sun), sparse on the far side
    function disc(cx, cy, rad, col, sx, sy, t, seed) {
      const px = rad * cell;
      const lx = sx - cx, ly = sy - cy, ln = Math.hypot(lx, ly) || 1;
      for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > rad + 0.2) continue;
        const nx = dx / rad, ny = dy / rad;
        const lit = clamp01(0.55 + (nx * lx / ln + ny * ly / ln) * 0.6);
        if (hash(dx + 50, dy + 50, seed) > 0.35 + lit * 0.65) continue;
        ctx.fillStyle = rgba(col, 0.55 + lit * 0.45);
        ctx.font = '700 ' + (cell + 1) + 'px ' + MONO;
        ctx.fillText(rampChar(0.25 + lit * 0.7), cx + dx * cell, cy + dy * cell);
      }
    }
    function frame(t) {
      if (!W) resize();
      const dt = lastT ? Math.min(t - lastT, 0.2) : 0; lastT = t;
      ctx.clearRect(0, 0, W, H);
      const sx = W * 0.5, sy = H * 0.52, unit = Math.min(W, H);
      // orbits: faint dotted rings
      ctx.font = '600 8px ' + MONO;
      for (const b of bodies) {
        const R = b.a * unit, n = Math.round(R * 0.9);
        for (let i = 0; i < n; i++) {
          const ang = i / n * Math.PI * 2;
          ctx.fillStyle = rgba(C.navy, 0.28 + 0.15 * hash(i, 3, 0));
          ctx.fillText(i % 7 === 0 ? '+' : '.', sx + Math.cos(ang) * R, sy + Math.sin(ang) * R * 0.92);
        }
      }
      // the sun: a hot core with a shimmering corona
      for (let r = 0; r < 60; r++) {
        const ang = hash(r, 11, 0) * Math.PI * 2, d = (0.6 + hash(r, 13, 0) * 1.6 + 0.25 * Math.sin(t * 2 + r)) * cell * 3;
        const k = clamp01(1 - d / (cell * 7));
        ctx.fillStyle = rgba(mix(C.amber, C.clay, hash(r, 17, 0)), 0.35 + k * 0.65);
        ctx.font = '700 ' + (7 + k * 5).toFixed(1) + 'px ' + MONO;
        ctx.fillText(k > 0.6 ? '@' : k > 0.3 ? '*' : '·', sx + Math.cos(ang) * d, sy + Math.sin(ang) * d);
      }
      // planets
      bodies.forEach((b, i) => {
        const ang = t / b.period * Math.PI * 2 + i * 1.7;
        const R = b.a * unit;
        const cx = sx + Math.cos(ang) * R, cy = sy + Math.sin(ang) * R * 0.92;
        if (b.ring) {                                        // a ring of glyphs round the big one
          ctx.font = '600 8px ' + MONO;
          for (let q = 0; q < 26; q++) { const a2 = q / 26 * Math.PI * 2; ctx.fillStyle = rgba(b.col, 0.5); ctx.fillText('-', cx + Math.cos(a2) * b.r * cell * 1.7, cy + Math.sin(a2) * b.r * cell * 0.55); }
        }
        disc(cx, cy, b.r, b.col, sx, sy, t, i + 1);
        if (b.moon) {
          const ma = t / b.moon.period * Math.PI * 2;
          const mx = cx + Math.cos(ma) * b.moon.a * unit, my = cy + Math.sin(ma) * b.moon.a * unit * 0.8;
          disc(mx, my, b.moon.r, C.pale, sx, sy, t, 9);
        }
      });
      // the comet on an eccentric orbit, tail streaming away from the sun
      const M = (t / comet.period * Math.PI * 2 + comet.phase) % (Math.PI * 2);
      const A = comet.a * unit, E = comet.e;
      const nu = M + 2 * E * Math.sin(M) + 1.25 * E * E * Math.sin(2 * M);   // rough true anomaly
      const rr = A * (1 - E * E) / (1 + E * Math.cos(nu));
      const cx = sx + Math.cos(nu + 0.6) * rr, cy = sy + Math.sin(nu + 0.6) * rr * 0.9;
      const away = Math.atan2(cy - sy, cx - sx), near = clamp01(1 - rr / (A * 1.2));
      ctx.font = '600 9px ' + MONO;
      const tail = 6 + Math.round(near * 26);
      for (let k = 0; k < tail; k++) {
        const d = k * 9, spread = (hash(k, 23, Math.floor(t * 6)) - 0.5) * k * 1.6;
        ctx.fillStyle = rgba(mix(C.pale, C.midblue, 0.4), (1 - k / tail) * (0.3 + near * 0.6));
        ctx.fillText(k < 3 ? '*' : k < 10 ? '·' : '.', cx + Math.cos(away) * d - Math.sin(away) * spread, cy + Math.sin(away) * d + Math.cos(away) * spread);
      }
      ctx.fillStyle = rgba(C.navy, 0.95); ctx.font = '700 11px ' + MONO; ctx.fillText('@', cx, cy);
    }
    resize();
    frame(0);
    canvas._frame = frame; frame.__canvas = canvas;
    canvas._onScreen = true;
    if (!reduced) seen.observe(canvas);
    pageCanvases.push(canvas);
    pageOn(window, 'resize', resize);
  }

  // ── cloudscape: fractal noise through the glyph ramp ─────────────
  // Value noise summed over four octaves, thresholded into cloud; the noise
  // domain drifts sideways and morphs with time. Shadow falls to the lower
  // right, lit edges go amber, and the whole thing fades out toward the
  // page so the list beside it stays readable.
  function clouds(canvas) {
    // separate masses with sky between them: a slow large-scale mask gates the detail
    const density = (u, v, t) => {
      const x = u * 2.4 + t * 0.03, y = v * 3.2, z = t * 0.025;
      const big = noise(u * 1.1 + t * 0.012, v * 1.5 + 3.7, z * 0.6);
      const n = fbm(x, y, z);
      return clamp01((n - 0.56 + big * 0.3) / 0.2);
    };
    const IVORY = [246, 243, 236];
    let box = null, boxT = -1, blastAt = -99;
    pageOn(document, 'ascii:thunder', () => { blastAt = performance.now() / 1000; });
    // where a wave front is crossing the cloud, the field is pushed outward
    // along the ring and thinned a little, so the billows bulge away from it
    function waved(u, v, t) {
      if (!ripples.length && !(window.__rays && window.__rays.length)) return [u, v, 1];
      if (t !== boxT) { boxT = t; const r = canvas.getBoundingClientRect(); box = { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height }; }
      const X = box.x + u * box.w, Y = box.y + v * box.h;
      let du = 0, dv = 0, thin = 1;
      for (const r of (window.__rays || [])) {
        const dx = X - (r.x + window.scrollX), dy = Y - (r.y + window.scrollY), dd = Math.hypot(dx, dy) || 1;
        if (dd > 160) continue;
        const k = (1 - dd / 160);
        du += dx / dd * k * 0.06; dv += dy / dd * k * 0.06; thin *= 1 - k * 0.6;
      }
      for (const rp of ripples) {
        const age = t - rp.born;
        if (age < 0) continue;
        const dx = X - rp.px, dy = Y - rp.py, dd = Math.hypot(dx, dy) || 1;
        const R = frontR(rp, Math.atan2(dy, dx), age);
        if (dd > R + 20 || dd < R - rp.thick - 20) continue;
        const ph = clamp01((dd - (R - rp.thick - 20)) / (rp.thick + 40));
        const bump = Math.sin(ph * Math.PI) * (1 - age / rp.life) * (0.4 + 0.6 * rp.k);
        du += dx / dd * bump * 0.045; dv += dy / dd * bump * 0.045;
        thin *= 1 - bump * 0.3;
      }
      return [u + du, v + dv, thin];
    }
    makeGrid(canvas, 7, (u0, v0, t) => {
      const [u, v, thin] = waved(u0, v0, t);
      const blast = 1 - 0.92 * Math.exp(-Math.max(0, t - blastAt) * 0.9);   // thinned by the thunder, growing back
      const d = density(u, v, t) * thin * blast;
      if (d <= 0.02) return null;
      // light from the upper left: a cell is in shadow where density rises toward the light
      const shade = clamp01(0.5 + (density(u - 0.014, v - 0.02, t) - d) * 7) * d;
      // lit tops stay almost empty amber; shaded undersides are dense sage, deepest to navy
      let col = mix(mix(C.amber, IVORY, 0.4), C.sage, clamp01(shade * 1.6));
      col = mix(col, C.navy, clamp01(shade - 0.45) * 0.9);
      const edge = clamp01(u0 / 0.38) * clamp01((1 - v0) / 0.1) * clamp01(v0 / 0.08);
      const lum = (0.06 + d * 0.2 + shade * 0.9) * edge;
      return [lum, rgba(col, (0.2 + d * 0.3 + shade * 0.5) * edge)];
    });
  }

  // ── project thumbnails: asciify the image on hover ───────────────
  function hoverAscii(card) {
    const thumb = card.querySelector('.feat-thumb');
    const img = thumb && thumb.querySelector('img');
    const canvas = thumb && thumb.querySelector('.thumb-ascii');
    if (!img || !canvas) return;
    let grid = null;
    const sample = document.createElement('canvas');
    const sctx = sample.getContext('2d', { willReadFrequently: true });
    let data = null, sw = 0, sh = 0;

    function build() {
      if (!img.naturalWidth) return;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const cellPx = 6;
      sw = Math.round(w / cellPx); sh = Math.round(h / cellPx);
      sample.width = sw; sample.height = sh;
      const scale = Math.max(sw / img.naturalWidth, sh / img.naturalHeight);
      const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
      sctx.drawImage(img, (sw - dw) / 2, (sh - dh) / 2, dw, dh);
      try { data = sctx.getImageData(0, 0, sw, sh).data; } catch (_) { data = null; return; }
      grid = makeGrid(canvas, cellPx, (u, v, t, c, r) => {
        const i = ((Math.min(r, sh - 1) * sw) + Math.min(c, sw - 1)) * 4;
        const R = data[i], G = data[i + 1], B = data[i + 2];
        const lum = (0.299 * R + 0.587 * G + 0.114 * B) / 255;
        const col = [lum + (R - lum * 255) * 1.3, lum + (G - lum * 255) * 1.3, lum + (B - lum * 255) * 1.3];
        return [1 - lum * 0.9, rgba([clamp01(col[0] / 255) * 255, clamp01(col[1] / 255) * 255, clamp01(col[2] / 255) * 255], 1)];
      });
      canvas._frame = null;   // drawn once; nothing to animate
    }
    card.addEventListener('mouseenter', () => {
      if (!grid) build();
      card.classList.add('ascii-on');
    });
    card.addEventListener('mouseleave', () => card.classList.remove('ascii-on'));
  }

  // ── background: a faint field of glyphs and dots drifting on a flow ─
  // Particles ride a slowly turning flow. Leaves launched from the garden
  // ('ascii:launch') join the field with momentum, and anything moving fast
  // knocks into its neighbours: the struck particle flashes, takes a push,
  // and may turn from a dot into a glyph.
  function drift(canvas) {
    const ctx = canvas.getContext('2d');
    const parts = [];
    let w = 0, h = 0, lastT = 0, want = 0;
    const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      want = Math.floor((w * h) / 8000);
      while (parts.length < want) parts.push(spawn(Math.random() * w, Math.random() * h));
    }
    function spawn(x, y) {
      const isGlyph = Math.random() < 0.5;
      return {
        x, y, isGlyph, vx: 0, vy: 0, flash: 0, boost: 0, lastHit: -9, launched: false,
        ch: SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0],
        size: isGlyph ? 10 + Math.random() * 5 : 1 + Math.random() * 1.4,
        base: isGlyph ? 0.16 + Math.random() * 0.16 : 0.18 + Math.random() * 0.2,
        phase: Math.random() * Math.PI * 2,
        col: Math.random() < 0.75 ? C.navy : [C.clay, C.midblue, C.sage, C.amber][(Math.random() * 4) | 0]
      };
    }
    // a slowly turning flow: the direction at a point is a sum of long waves
    function angle(x, y, t) {
      return Math.sin(x * 0.0035 + t * 0.08) * 1.4 + Math.cos(y * 0.003 - t * 0.06) * 1.4 + Math.sin((x + y) * 0.0015 + t * 0.04);
    }
    const shift = () => (window.scrollY || 0) * 0.06;

    document.addEventListener('ascii:launch', (e) => {
      const d = e.detail;
      const p = spawn(d.x, d.y + window.scrollY);
      p.isGlyph = true; p.ch = d.ch || p.ch; p.size = 12; p.base = 0.3; p.boost = 1; p.launched = true; p.page = true;
      p.vx = d.vx; p.vy = d.vy;
      p.col = d.color && d.color[0] === '#' ? hex(d.color) : C.navy;
      parts.push(p);
      // keep the field from growing without bound: retire the oldest launched one
      if (parts.length > want + 60) {
        const i = parts.findIndex(q => q.launched);
        if (i >= 0) parts.splice(i, 1);
      }
    });

    // a particle's on-screen y (page-space debris scrolls; ambient ones parallax)
    const screenY = (p) => p.page ? p.y - window.scrollY : ((p.y - shift()) % (h + 20) + (h + 20)) % (h + 20) - 10;

    // ── ripples: press to charge, release to send a ring out through the
    // field. The ring is a thick front; every letter it is passing over
    // flips to a glyph (a few in colour) and heals once it has gone by, and
    // the band of the photo under it turns to ASCII. How long you hold sets
    // how big, fast, thick and disruptive the wave is. ──
    const TINTS = ['#C8623A', '#DE934D', '#5E84B9', '#5B7F6E', '#CD8F7C', '#1B2A41'];
    let charge = null, textNodes = null;
    document.addEventListener('ascii:textchanged', () => { textNodes = null; });
    const range = document.createRange();

    function collectText() {
      textNodes = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        if (!n.nodeValue.trim() || !n.parentElement || n.parentElement.closest('script, style, canvas')) continue;
        textNodes.push({ node: n, text: n.nodeValue, chars: Array.from(n.nodeValue) });
      }
    }
    // approximate page position of every character: the run's line boxes,
    // with the characters spread along each box in proportion to its width
    function charPositions(w) {
      range.selectNodeContents(w.node);
      const rects = Array.from(range.getClientRects()).filter(r => r.width > 0);
      if (!rects.length) return null;
      const total = rects.reduce((a, r) => a + r.width, 0);
      const pos = [];
      let i = 0;
      rects.forEach((r, k) => {
        const count = k === rects.length - 1 ? w.chars.length - i : Math.round(w.chars.length * r.width / total);
        for (let j = 0; j < count && i < w.chars.length; j++, i++) {
          pos.push([r.left + window.scrollX + (j + 0.5) * r.width / Math.max(1, count), r.top + window.scrollY + r.height / 2]);
        }
      });
      while (pos.length < w.chars.length) pos.push(pos[pos.length - 1]);
      return pos;
    }
    const SUPER_HOLD = 2.25;                    // seconds of holding for the super wave
    // content the super front crosses sheds into the background field: a glyph
    // (or a coloured cell of the photo) that flies on outward with the wave
    function shed(x, y, rp, ch, color) {
      const dx = x - rp.px, dy = y - rp.py, d = Math.hypot(dx, dy) || 1;
      const sp = 220 + Math.random() * 180;
      const p = spawn(x - window.scrollX, y);                       // y in page space
      p.isGlyph = true; p.ch = ch; p.size = 11; p.base = 0.3; p.boost = 1; p.launched = true; p.flash = 0.8; p.page = true;
      p.vx = dx / d * sp + (Math.random() - 0.5) * 60; p.vy = dy / d * sp + (Math.random() - 0.5) * 60;
      p.col = color || C.navy;
      parts.push(p);
      if (parts.length > want + 160) { const i = parts.findIndex(q => q.launched); if (i >= 0) parts.splice(i, 1); }
    }
    function startRipple(px, py, now, k, sup) {
      if (!textNodes) collectText();
      const rp = {
        px, py, born: now, k,
        speed: 620 + 260 * k, life: 0.8 + 1.1 * k, thick: 22 + 34 * k,
        prob: 0.12 + 0.4 * k, shove: 40 + 90 * k, alpha: 0.5 + 0.5 * k,
        wobble: [Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3, 0.02 + Math.random() * 0.03, 0.015 + Math.random() * 0.025, 0.01 + Math.random() * 0.02],
        near: [], photo: photoTarget(), thumbs: thumbTargets()
      };
      imageList = imageTargets();
      if (sup) Object.assign(rp, { k: 2.2, sup: true, speed: 2300, life: 1.5, thick: 95, prob: 0.98, shove: 420, alpha: 1, lingerCells: new Map() });
      const reach = rp.speed * rp.life;
      for (const w of textNodes) {
        if (!w.node.parentNode) continue;                 // already glitching under another ring
        const pos = charPositions(w);
        if (!pos) continue;
        let dmin = Infinity, dmax = 0;
        const dist = pos.map(([x, y]) => { const d = Math.hypot(x - px, y - py); if (d < dmin) dmin = d; if (d > dmax) dmax = d; return d; });
        if (dmin > reach * 1.3) continue;
        const ang = pos.map(([x, y]) => Math.atan2(y - py, x - px));
        rp.near.push({ w, pos, dist, ang, roll: w.chars.map(() => Math.random()), dmin, dmax, hit: false });
      }
      ripples.push(rp);
    }
    document.addEventListener('pointerdown', (e) => {
      if (reduced || e.button > 0) return;
      charge = { px: e.clientX + window.scrollX, py: e.clientY + window.scrollY, start: performance.now() / 1000 };
    });
    const release = () => {
      if (!charge) return;
      const now = performance.now() / 1000;
      const held = now - charge.start;
      const k = Math.max(0.1, clamp01(held / 0.55));
      if (charge.near) { for (const e of charge.near) healRun(e); charge.near = null; }
      if (held >= SUPER_HOLD) {
        // the super wave: three fronts, a thunderclap, and the rest of the page hears it
        startRipple(charge.px, charge.py, now, k, true);
        startRipple(charge.px, charge.py, now + 0.14, k, true);
        startRipple(charge.px, charge.py, now + 0.28, k, true);
        document.dispatchEvent(new CustomEvent('ascii:thunder', { detail: { x: charge.px, y: charge.py } }));
        shatter = { start: now, px: charge.px, py: charge.py, hit: new Map() };
        // every thumbnail goes ASCII for a couple of seconds
        document.querySelectorAll('.feat-card-link').forEach(card => { card.dispatchEvent(new Event('mouseenter')); setTimeout(() => card.classList.remove('ascii-on'), 2200 + Math.random() * 800); });
        // and once the fronts are past, every heading scrambles and decodes again
        setTimeout(() => { document.dispatchEvent(new Event('ascii:redecode')); }, 1800);
      } else {
        startRipple(charge.px, charge.py, now, k);
      }
      dropCharge();
    };
    document.addEventListener('pointerup', release);
    document.addEventListener('pointercancel', dropCharge);
    // a drag is a selection, not a charge: moving the pointer while holding,
    // or any text getting selected, cancels the charge
    document.addEventListener('pointermove', (e) => {
      if (!charge) return;
      if (Math.hypot(e.clientX + window.scrollX - charge.px, e.clientY + window.scrollY - charge.py) > 8) dropCharge();
    });
    document.addEventListener('selectionchange', () => {
      const sel = window.getSelection();
      if (charge && sel && !sel.isCollapsed) dropCharge();
    });

    // The profile photo: inside the band the ring is crossing, the photo turns
    // to ASCII the way the reveal renders it (dark cells, colour-sampled
    // glyphs), sampling through a lens that pushes outward then pulls back
    // along the radius, tinted warm at the leading edge and cool at the
    // trailing edge. Nothing is drawn outside the band.
    const PN = 256, PAD = 0.14;                 // photo grid size; the ripple canvas overhangs the photo by PAD
    const PC = Math.round(PN * (1 + 2 * PAD));   // ripple canvas size
    let photoPix = null, photoCanvas = null, shatter = null;
    const PAPER = [250, 248, 243];
    function photoTarget() {
      const link = document.querySelector('.ascii-photo-link');
      const wrap = link && link.querySelector('.ascii-photo-wrap');
      const img = wrap && wrap.querySelector('.ascii-photo');
      if (!img || !img.naturalWidth) return null;
      if (!photoCanvas) {
        photoCanvas = document.createElement('canvas');
        photoCanvas.className = 'ascii-photo-ripple';
        photoCanvas.width = photoCanvas.height = PC;
        link.appendChild(photoCanvas);              // outside the circle's clip, so the rim can be bent
        const off = document.createElement('canvas');
        off.width = off.height = PN;
        const o = off.getContext('2d', { willReadFrequently: true });
        const sc = Math.max(PN / img.naturalWidth, PN / img.naturalHeight);
        o.drawImage(img, (PN - img.naturalWidth * sc) / 2, (PN - img.naturalHeight * sc) / 2, img.naturalWidth * sc, img.naturalHeight * sc);
        try { photoPix = o.getImageData(0, 0, PN, PN).data; } catch (_) { photoPix = null; }
      }
      const r = wrap.getBoundingClientRect();
      return { x: r.left + window.scrollX, y: r.top + window.scrollY, size: r.width };
    }
    // Images in posts get the same treatment as the photo: a canvas laid over
    // each (inside the post body) carries the band of ASCII tiles the wave
    // is crossing. Pixels are sampled once per image; images the browser
    // will not let us read (hot-linked) are skipped.
    const imgCache = new WeakMap();
    function imageTargets() {
      const body = document.querySelector('.post-body');
      if (!body) return [];
      const bodyRect = body.getBoundingClientRect();
      const list = [];
      body.querySelectorAll('img').forEach(img => {
        if (!img.complete || !img.naturalWidth) return;
        const r = img.getBoundingClientRect();
        if (!r.width) return;
        let c = imgCache.get(img);
        if (!c) {
          const w = Math.round(r.width), h = Math.round(r.height);
          const off = document.createElement('canvas');
          off.width = w; off.height = h;
          const o = off.getContext('2d', { willReadFrequently: true });
          o.drawImage(img, 0, 0, w, h);
          let pix = null;
          try { pix = o.getImageData(0, 0, w, h).data; } catch (_) { imgCache.set(img, { bad: true }); return; }
          const cv = document.createElement('canvas');
          cv.className = 'ascii-img-ripple';
          cv.width = w; cv.height = h;
          body.appendChild(cv);
          c = { pix, w, h, canvas: cv, linger: new Map() };
          imgCache.set(img, c);
        }
        if (c.bad) return;
        c.canvas.style.left = (r.left - bodyRect.left) + 'px';
        c.canvas.style.top = (r.top - bodyRect.top) + 'px';
        c.canvas.style.width = r.width + 'px';
        c.canvas.style.height = r.height + 'px';
        list.push({ c, x: r.left + window.scrollX, y: r.top + window.scrollY, sx: c.w / r.width, sy: c.h / r.height });
      });
      return list;
    }
    function tileAt(pc, pix, w, c, r, cell, sx, sy, tint, m, hot, alpha) {
      const si = (Math.max(0, Math.min(w - 1, sy)) * w + Math.max(0, Math.min(w - 1, sx))) * 4;
      let pr = pix[si], pg = pix[si + 1], pb = pix[si + 2];
      if (tint) { pr += (tint[0] - pr) * m; pg += (tint[1] - pg) * m; pb += (tint[2] - pb) * m; }
      const lum = (0.299 * pr + 0.587 * pg + 0.114 * pb) / 255;
      const al = alpha == null ? 0.95 : alpha;
      pc.fillStyle = rgba([pr * 0.18 + 12, pg * 0.18 + 16, pb * 0.18 + 28], al);
      pc.fillRect(c * cell, r * cell, cell, cell);
      pc.fillStyle = hot ? rgba(C.clay, al) : rgba([lum * 255 + (pr - lum * 255) * 1.3, lum * 255 + (pg - lum * 255) * 1.3, lum * 255 + (pb - lum * 255) * 1.3].map(v => Math.max(0, Math.min(255, v))), al);
      pc.fillText(rampChar(lum), (c + 0.5) * cell, (r + 0.5) * cell);
      return [pr, pg, pb, lum];
    }
    function drawImageBand(tg, rp, R, a, t) {
      const { c } = tg, pc = c.canvas.getContext('2d'), cell = 6;
      pc.setTransform(1, 0, 0, 1, 0, 0);
      pc.textAlign = 'center'; pc.textBaseline = 'middle';
      pc.font = '700 ' + (cell + 1) + 'px ' + MONO;
      const age = R / rp.speed, tick = Math.floor(age * 12);
      const amp = (3 + 9 * rp.k) * a;
      const cols = Math.ceil(c.w / cell), rows = Math.ceil(c.h / cell);
      for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
        const x = (q + 0.5) * cell, y = (r + 0.5) * cell;               // canvas px (scale ~1)
        const X = tg.x + x / tg.sx, Y = tg.y + y / tg.sy;               // page px
        const dx = X - rp.px, dy = Y - rp.py, d = Math.hypot(dx, dy) || 1;
        const Rt = frontR(rp, Math.atan2(dy, dx), age);
        const T = rp.thick * (0.6 + 0.8 * hash(q, r, 5)) * (0.4 + 0.6 * a);
        if (d > Rt || d < Rt - T || hash(q, r, tick) < 0.12 + (1 - a) * 0.6) continue;
        const ph = (d - (Rt - T)) / T, bump = Math.sin(ph * Math.PI);
        const disp = amp * Math.sin(ph * Math.PI * 2);
        const sx = Math.round(x + dx / d * disp), sy = Math.round(y + dy / d * disp);
        const swap = hash(q, r, tick + 3) < 0.1;
        const tint = swap ? hexToRgb(TINTS[(hash(q, r, tick + 4) * TINTS.length) | 0]) : (ph > 0.5 ? C.amber : C.midblue);
        const px = tileAt(pc, c.pix, c.w, q, r, cell, sx, Math.min(c.h - 1, sy), tint, swap ? 0.8 : bump * 0.25 * a, false, Math.min(1, bump * 2.2) * Math.min(1, a * 1.4));
        if (rp.sup) {
          const key = r * 10000 + q;
          if (!c.linger.has(key)) {
            c.linger.set(key, hash(q, r, 71) < 0.1 ? t + 0.6 + hash(q, r, 73) * 2.6 : 0);
            if (hash(q, r, 77) < 0.04) shed(X, Y, rp, rampChar(1 - px[3]), [px[0], px[1], px[2]]);
          }
        }
      }
    }
    function drawImageLinger(c, t) {
      if (!c.linger.size) return;
      const pc = c.canvas.getContext('2d'), cell = 6, tick = Math.floor(t * 3);
      pc.setTransform(1, 0, 0, 1, 0, 0);
      pc.textAlign = 'center'; pc.textBaseline = 'middle';
      pc.font = '700 ' + (cell + 1) + 'px ' + MONO;
      for (const [key, until] of c.linger) {
        if (until === 0) continue;
        if (t > until) { c.linger.delete(key); continue; }
        const r = Math.floor(key / 10000), q = key % 10000;
        const swap = hash(q, r, tick) < 0.15;
        tileAt(pc, c.pix, c.w, q, r, cell, Math.round((q + 0.5) * cell), Math.min(c.h - 1, Math.round((r + 0.5) * cell)), swap ? hexToRgb(TINTS[(hash(q, r, tick + 1) * TINTS.length) | 0]) : null, swap ? 0.8 : 0, false);
      }
    }
    let imageList = [];
    function clearImages() {
      for (const tg of imageList) tg.c.canvas.getContext('2d').clearRect(0, 0, tg.c.w, tg.c.h);
    }
    function thumbTargets() {
      return Array.from(document.querySelectorAll('.feat-card-link')).map(card => {
        const r = card.querySelector('.feat-thumb').getBoundingClientRect();
        return { card, cx: r.left + window.scrollX + r.width / 2, cy: r.top + window.scrollY + r.height / 2, on: false };
      });
    }
    function drawPhotoBand(rp, R, a) {
      if (!photoPix || !rp.photo) return;
      const scale = PN / rp.photo.size;                       // page px -> photo px
      const o = PN * PAD;                                     // photo origin inside the ripple canvas
      const ox = (rp.px - rp.photo.x) * scale + o, oy = (rp.py - rp.photo.y) * scale + o;
      const age = R / rp.speed, Rp = R * scale * 1.3, Tp = rp.thick * scale;
      const cell = 6, n = Math.ceil(PC / cell), tick = Math.floor(age * 12);
      const c0 = Math.max(0, Math.floor((ox - Rp) / cell) - 1), c1 = Math.min(n, Math.ceil((ox + Rp) / cell) + 1);
      const r0 = Math.max(0, Math.floor((oy - Rp) / cell) - 1), r1 = Math.min(n, Math.ceil((oy + Rp) / cell) + 1);
      if (c0 >= c1 || r0 >= r1) return;
      const pc = photoCanvas.getContext('2d');
      pc.setTransform(1, 0, 0, 1, 0, 0);
      pc.textAlign = 'center'; pc.textBaseline = 'middle';
      pc.font = '700 ' + (cell + 1) + 'px ' + MONO;
      const amp = (3 + 9 * rp.k) * scale * a;
      const warm = C.amber, cool = C.midblue;
      const cx = PC / 2, cy = PC / 2, rim = PN / 2;           // the photo's circle
      for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
        const x = (c + 0.5) * cell, y = (r + 0.5) * cell;
        const dx = x - ox, dy = y - oy, d = Math.hypot(dx, dy) || 1;
        const Rt = frontR(rp, Math.atan2(dy, dx), age) * scale;
        const T = Tp * (0.6 + 0.8 * hash(c, r, 5)) * (0.4 + 0.6 * a);   // ragged band, narrowing as the wave dies
        if (d > Rt || d < Rt - T || hash(c, r, tick) < 0.12 + (1 - a) * 0.6) continue;   // holes, more of them as it fades
        const ph = (d - (Rt - T)) / T;                           // 0 trailing edge .. 1 leading edge
        const bump = Math.sin(ph * Math.PI);
        const disp = amp * Math.sin(ph * Math.PI * 2);           // out then in: a lens
        // where the band crosses the rim, the rim bends: out with the lens, plus a ragged tear
        const ex = x - cx, ey = y - cy, er = Math.hypot(ex, ey);
        const tear = (hash(Math.round(Math.atan2(ey, ex) * 6), 43, tick) - 0.5) * 10 * a;
        const rimHere = rim + bump * (disp * 1.2 + tear) * (0.5 + rp.k);
        if (er > rimHere) continue;                              // outside the bent rim: nothing
        if (rp.sup && er <= rim - 2 && !rp.lingerCells.has(r * 1000 + c)) {
          rp.lingerCells.set(r * 1000 + c, hash(c, r, 71) < 0.1 ? age + rp.born + 0.6 + hash(c, r, 73) * 2.6 : 0);
          if (hash(c, r, 77) < 0.05) {
            const si0 = (Math.max(0, Math.min(PN - 1, Math.round(y - o))) * PN + Math.max(0, Math.min(PN - 1, Math.round(x - o)))) * 4;
            shed(rp.photo.x + (x - o) / scale, rp.photo.y + (y - o) / scale, rp, rampChar(1 - (0.299 * photoPix[si0] + 0.587 * photoPix[si0 + 1] + 0.114 * photoPix[si0 + 2]) / 255), [photoPix[si0], photoPix[si0 + 1], photoPix[si0 + 2]]);
          }
        }
        const alpha = Math.min(1, bump * 2.2) * Math.min(1, a * 1.4);
        if (er > rim - 1 || x < o || y < o || x >= o + PN || y >= o + PN) {
          // past the true rim: the tile stands on the paper
          pc.fillStyle = rgba([24, 32, 52], alpha * 0.9);
          pc.fillRect(c * cell, r * cell, cell, cell);
        }
        // sample the photo through the lens, clamped to its edge
        const sx = Math.max(0, Math.min(PN - 1, Math.round(x - o + dx / d * disp)));
        const sy = Math.max(0, Math.min(PN - 1, Math.round(y - o + dy / d * disp)));
        const si = (sy * PN + sx) * 4;
        const swap = hash(c, r, tick + 3) < 0.1;                 // the odd cell goes a colour of its own
        const tint = swap ? hexToRgb(TINTS[(hash(c, r, tick + 4) * TINTS.length) | 0]) : (ph > 0.5 ? warm : cool), m = swap ? 0.8 : bump * 0.25 * a;
        const pr = photoPix[si] + (tint[0] - photoPix[si]) * m;
        const pg = photoPix[si + 1] + (tint[1] - photoPix[si + 1]) * m;
        const pb = photoPix[si + 2] + (tint[2] - photoPix[si + 2]) * m;
        const lum = (0.299 * pr + 0.587 * pg + 0.114 * pb) / 255;
        pc.fillStyle = rgba([pr * 0.18 + 12, pg * 0.18 + 16, pb * 0.18 + 28], alpha);
        pc.fillRect(c * cell, r * cell, cell, cell);
        const boost = [lum * 255 + (pr - lum * 255) * 1.3, lum * 255 + (pg - lum * 255) * 1.3, lum * 255 + (pb - lum * 255) * 1.3];
        pc.fillStyle = rgba(boost.map(v => Math.max(0, Math.min(255, v * 1.05))), alpha);
        pc.fillText(rampChar(lum), x, y);
      }
      // and where the rim is bitten inward, paper covers the photo's edge
      for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
        const x = (c + 0.5) * cell, y = (r + 0.5) * cell;
        const ex = x - cx, ey = y - cy, er = Math.hypot(ex, ey);
        if (er > rim || er < rim - 14) continue;
        const dx = x - ox, dy = y - oy, d = Math.hypot(dx, dy) || 1;
        const Rt = frontR(rp, Math.atan2(dy, dx), age) * scale;
        if (d > Rt || d < Rt - Tp) continue;
        const ph = (d - (Rt - Tp)) / Tp, bump = Math.sin(ph * Math.PI);
        const bite = bump * (hash(Math.round(Math.atan2(ey, ex) * 6), 47, tick) * 9 + 2) * (0.5 + rp.k) * a;
        if (er > rim - bite) { pc.fillStyle = rgba(PAPER, Math.min(1, bump * 2)); pc.fillRect(c * cell, r * cell, cell, cell); }
      }
    }
    function photoPatch(pxPage, pyPage, radiusPage, hot) {
      if (!photoPix || !charge || !charge.photo) return;
      const ph = charge.photo, scale = PN / ph.size, o = PN * PAD;
      const px = (pxPage - ph.x) * scale + o, py = (pyPage - ph.y) * scale + o, rad = radiusPage * scale;
      const cell = 6, pc = photoCanvas.getContext('2d');
      pc.setTransform(1, 0, 0, 1, 0, 0);
      pc.textAlign = 'center'; pc.textBaseline = 'middle';
      pc.font = '700 ' + (cell + 1) + 'px ' + MONO;
      const cx = PC / 2, cy = PC / 2, rim = PN / 2;
      for (let r = Math.floor((py - rad) / cell); r <= Math.ceil((py + rad) / cell); r++) for (let c = Math.floor((px - rad) / cell); c <= Math.ceil((px + rad) / cell); c++) {
        const x = (c + 0.5) * cell, y = (r + 0.5) * cell;
        if (Math.hypot(x - cx, y - cy) > rim + 4 || Math.hypot(x - px, y - py) > rad) continue;
        const sx = Math.max(0, Math.min(PN - 1, Math.round(x - o))), sy = Math.max(0, Math.min(PN - 1, Math.round(y - o)));
        const si = (sy * PN + sx) * 4, pr = photoPix[si], pg = photoPix[si + 1], pb = photoPix[si + 2];
        const lum = (0.299 * pr + 0.587 * pg + 0.114 * pb) / 255;
        pc.fillStyle = rgba([pr * 0.18 + 12, pg * 0.18 + 16, pb * 0.18 + 28], 0.9);
        pc.fillRect(c * cell, r * cell, cell, cell);
        pc.fillStyle = hot ? rgba(C.clay, 0.95) : rgba([lum * 255 + (pr - lum * 255) * 1.3, lum * 255 + (pg - lum * 255) * 1.3, lum * 255 + (pb - lum * 255) * 1.3].map(v => Math.max(0, Math.min(255, v))), 0.95);
        pc.fillText(rampChar(lum), x, y);
      }
    }
    // letters hit by a particle flip for a moment (the charge's own glitch runs)
    function glitchHits(e, t) {
      const span = e.w.span || (e.w.span = document.createElement('span'));
      span.className = 'glitch-run';
      while (span.firstChild) span.removeChild(span.firstChild);
      let plain = '', any = false;
      const flush = () => { if (plain) { span.appendChild(document.createTextNode(plain)); plain = ''; } };
      const tick = Math.floor(t * 15);
      for (let i = 0; i < e.w.chars.length; i++) {
        const ch = e.w.chars[i];
        if (ch !== ' ' && ch.length === 1 && e.hitUntil[i] > t) {
          flush(); any = true;
          const g = document.createElement('span');
          g.className = 'g';
          g.dataset.g = SCRAMBLE[(hash(i, 51, tick) * SCRAMBLE.length) | 0];
          if (e.hot[i]) g.style.setProperty('--gc', '#C8623A'); else if (hash(i, 53, tick) < 0.2) g.style.setProperty('--gc', TINTS[(hash(i, 55, tick) * TINTS.length) | 0]);
          g.textContent = ch;
          span.appendChild(g);
        } else plain += ch;
      }
      flush();
      if (!any) { healRun(e); return; }
      if (!e.hit) { e.w.node.replaceWith(span); e.hit = true; }
    }
    function dropCharge() {
      if (charge && charge.near) for (const e of charge.near) healRun(e);
      if (charge && charge.photo) clearPhoto();
      charge = null;
    }
    // cells a super wave left as ASCII, recovering one by one
    function drawPhotoLinger(rp, t) {
      if (!photoPix || !rp.photo || !rp.lingerCells) return;
      const o = PN * PAD, cell = 6, pc = photoCanvas.getContext('2d');
      pc.setTransform(1, 0, 0, 1, 0, 0);
      pc.textAlign = 'center'; pc.textBaseline = 'middle';
      pc.font = '700 ' + (cell + 1) + 'px ' + MONO;
      const tick = Math.floor(t * 3), rim = PN / 2, cx = PC / 2, cy = PC / 2;
      for (const [key, until] of rp.lingerCells) {
        if (until === 0) continue;
        if (t > until) { rp.lingerCells.delete(key); continue; }
        const r = Math.floor(key / 1000), c = key % 1000;
        const x = (c + 0.5) * cell, y = (r + 0.5) * cell;
        if (Math.hypot(x - cx, y - cy) > rim - 2) continue;      // never outside the circle
        const sx = Math.max(0, Math.min(PN - 1, Math.round(x - o))), sy = Math.max(0, Math.min(PN - 1, Math.round(y - o)));
        const si = (sy * PN + sx) * 4, pr = photoPix[si], pg = photoPix[si + 1], pb = photoPix[si + 2];
        const lum = (0.299 * pr + 0.587 * pg + 0.114 * pb) / 255;
        pc.fillStyle = rgba([pr * 0.18 + 12, pg * 0.18 + 16, pb * 0.18 + 28], 0.95);
        pc.fillRect(c * cell, r * cell, cell, cell);
        const swap = hash(c, r, tick) < 0.15;
        pc.fillStyle = swap ? rgba(hexToRgb(TINTS[(hash(c, r, tick + 1) * TINTS.length) | 0]), 0.95) : rgba([lum * 255 + (pr - lum * 255) * 1.3, lum * 255 + (pg - lum * 255) * 1.3, lum * 255 + (pb - lum * 255) * 1.3].map(v => Math.max(0, Math.min(255, v))), 0.95);
        pc.fillText(SCRAMBLE[(hash(c, r, tick + 2) * SCRAMBLE.length) | 0], x, y);
      }
    }
    // the whole photo as ASCII, each cell coming back at its own time (most early, a few late)
    function drawShatter(t) {
      if (!shatter) return;
      if (!photoPix) { photoTarget(); if (!photoPix) { shatter = null; return; } }
      const age = t - shatter.start;
      if (age > 7) { shatter = null; return; }
      const first = ripples.find(r => r.sup && r.photo) || null;      // the leading super front, while it lives
      const o = PN * PAD, cell = 6, pc = photoCanvas.getContext('2d');
      pc.setTransform(1, 0, 0, 1, 0, 0);
      pc.textAlign = 'center'; pc.textBaseline = 'middle';
      pc.font = '700 ' + (cell + 1) + 'px ' + MONO;
      const rim = PN / 2, cx = PC / 2, cy = PC / 2, tick = Math.floor(t * 4);
      const n = Math.ceil(PC / cell);
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        const x = (c + 0.5) * cell, y = (r + 0.5) * cell;
        if (Math.hypot(x - cx, y - cy) > rim - 2) continue;
        const key = r * 1000 + c;
        let hitAt = shatter.hit.get(key);
        if (hitAt == null) {
          if (!first) continue;                                     // the front never got here
          // page position of this cell, against the leading front
          const ph = first.photo, scale = ph.size / PN;
          const X = ph.x + (x - o) * scale, Y = ph.y + (y - o) * scale;
          const dx = X - first.px, dy = Y - first.py, d = Math.hypot(dx, dy);
          const Rt = frontR(first, Math.atan2(dy, dx), t - first.born);
          if (d > Rt) continue;                                     // not reached yet
          hitAt = t; shatter.hit.set(key, t);
        }
        const back = 0.4 + Math.pow(hash(c, r, 81), 2.2) * 5;       // how long this cell stays broken
        if (t - hitAt > back) continue;
        const sx = Math.max(0, Math.min(PN - 1, Math.round(x - o))), sy = Math.max(0, Math.min(PN - 1, Math.round(y - o)));
        const si = (sy * PN + sx) * 4, pr = photoPix[si], pg = photoPix[si + 1], pb = photoPix[si + 2];
        const lum = (0.299 * pr + 0.587 * pg + 0.114 * pb) / 255;
        pc.fillStyle = rgba([pr * 0.18 + 12, pg * 0.18 + 16, pb * 0.18 + 28], 0.95);
        pc.fillRect(c * cell, r * cell, cell, cell);
        const swap = hash(c, r, tick) < 0.12;
        pc.fillStyle = swap ? rgba(hexToRgb(TINTS[(hash(c, r, tick + 1) * TINTS.length) | 0]), 0.95) : rgba([lum * 255 + (pr - lum * 255) * 1.3, lum * 255 + (pg - lum * 255) * 1.3, lum * 255 + (pb - lum * 255) * 1.3].map(v => Math.max(0, Math.min(255, v))), 0.95);
        pc.fillText(hash(c, r, 83) < 0.25 ? SCRAMBLE[(hash(c, r, tick + 2) * SCRAMBLE.length) | 0] : rampChar(lum), x, y);
      }
    }
    function clearPhoto() {
      if (photoCanvas) photoCanvas.getContext('2d').clearRect(0, 0, PC, PC);
    }

    // A glitching run swaps the text node for a span. Each flipped letter stays
    // in the flow (invisible) so the line never reflows; the glyph is painted
    // over it by CSS, a few in colour. Only letters under the front flip.
    function glitchRun(e, rp, age) {
      const span = e.w.span || (e.w.span = document.createElement('span'));
      span.className = 'glitch-run';
      while (span.firstChild) span.removeChild(span.firstChild);
      let plain = '', any = false;
      const flush = () => { if (plain) { span.appendChild(document.createTextNode(plain)); plain = ''; } };
      const t = rp.born + age;
      if (rp.sup && !e.linger) e.linger = new Float64Array(e.w.chars.length);
      for (let i = 0; i < e.w.chars.length; i++) {
        const ch = e.w.chars[i], d = e.dist[i];
        const Rt = frontR(rp, e.ang[i], age);
        const fade = Math.pow(1 - clamp01(age / rp.life), 1.6);                 // the wave's strength here
        const thick = rp.thick * (0.6 + 0.8 * hash(i, 11, 0)) * (0.4 + 0.6 * fade);   // ragged band, narrowing as the wave dies
        const inBand = ch !== ' ' && ch.length === 1 && d <= Rt && d >= Rt - thick && e.roll[i] < rp.prob * fade;
        // a super wave leaves some letters damaged after it has passed; they recover on their own clock
        if (inBand && rp.sup && e.linger[i] === 0) {
          e.linger[i] = hash(i, 61, 0) < 0.3 ? t + 0.8 + Math.pow(hash(i, 63, 0), 1.5) * 4.5 : -1;
          if (hash(i, 67, 0) < 0.14) shed(e.pos[i][0], e.pos[i][1], rp, ch, null);
        }
        const lingering = rp.sup && e.linger[i] > t;
        if (inBand || lingering) {
          flush(); any = true;
          const g = document.createElement('span');
          g.className = 'g';
          const jitter = lingering ? Math.floor(t * 3 + hash(i, 65, 0) * 9) : (hash(i, 13, 0) < 0.3 ? Math.floor(age * 20) : Math.floor(Rt / 9));   // some letters keep re-rolling
          g.dataset.g = SCRAMBLE[(hash(i, Math.floor(d), jitter) * SCRAMBLE.length) | 0];
          if (hash(i, 17, jitter) < 0.35) g.style.setProperty('--gc', TINTS[(hash(i, 19, jitter) * TINTS.length) | 0]);
          g.textContent = ch;
          span.appendChild(g);
        } else plain += ch;
      }
      flush();
      if (!any) { healRun(e); return; }
      if (!e.hit) { e.w.node.replaceWith(span); e.hit = true; }
    }
    function healRun(e) {
      if (e.hit) { e.w.span.replaceWith(e.w.node); e.hit = false; }
    }
    function restoreRipple(rp) {
      for (const e of rp.near) healRun(e);
      if (ripples.length <= 1) { clearImages(); for (const tg of imageList) tg.c.linger.clear(); }
      for (const th of rp.thumbs) if (th.on) { th.card.classList.remove('ascii-on'); th.on = false; }
      clearPhoto();
    }
    function drawRipples(t) {
      // the charge: a cluster that grows and jitters under the pointer while you hold
      if (charge) {
        // The core energises over the first 1.6 s: more glyphs, wider, faster,
        // shakier, re-rolling quicker, warming from navy through blue and
        // amber to clay, throwing off sparks. At 2.25 s it goes dark in 0.2 s and
        // collapses to a small dense ball that fires off particles one after
        // another in fast straight tracks, like an accelerator supercharging.
        const held = t - charge.start;
        const e = clamp01(held / 1.6);                          // energy, 0 .. 1 over 1.6 s
        const dark = clamp01((held - SUPER_HOLD) / 0.2);        // 0 .. 1 in the 0.2 s after 2.25 s
        const INK = [22, 28, 44];
        const vx = charge.px - window.scrollX, vy = charge.py - window.scrollY;
        const rad = (6 + 44 * e * e) * (1 - 0.68 * dark);       // the ball collapses as it goes dark
        const n = Math.round((6 + e * e * 40) * (1 - 0.45 * dark));
        const spin = 1 + e * 7 + dark * 9;
        const shake = (1.5 + e * 9) * (1 - 0.7 * dark);
        const reroll = Math.floor(t * (6 + e * 24));
        let warm = e < 0.35 ? mix(C.navy, C.midblue, e / 0.35) : e < 0.7 ? mix(C.midblue, C.amber, (e - 0.35) / 0.35) : mix(C.amber, C.clay, (e - 0.7) / 0.3);
        warm = mix(warm, INK, dark);
        const hotCol = mix(C.clay, INK, dark);
        ctx.font = '600 ' + (9 + e * 5 - dark * 3).toFixed(1) + 'px ' + MONO;
        for (let i = 0; i < n; i++) {
          const ang = hash(i, 3, 0) * Math.PI * 2 + t * spin * (hash(i, 4, 0) < 0.5 ? 1 : -1);
          const r = rad * (0.3 + 0.7 * hash(i, 5, 0)) + (hash(i, 6, reroll) - 0.5) * shake;
          const jx = (hash(i, 8, reroll) - 0.5) * shake, jy = (hash(i, 9, reroll) - 0.5) * shake;
          const hot = hash(i, 10, reroll) < e * 0.5;
          ctx.fillStyle = hot ? rgba(hotCol, 0.6 + 0.4 * e) : rgba(warm, 0.3 + 0.5 * e + 0.3 * dark);
          ctx.fillText(SCRAMBLE[(hash(i, 7, reroll) * SCRAMBLE.length) | 0], vx + Math.cos(ang) * r + jx, vy + Math.sin(ang) * r + jy);
        }
        if (dark === 0) {
          // energising: a few sparks drift off and fade
          const sparks = Math.round(e * e * 10), rate = 2 + e * 3, reach = 20 + 80 * e;
          ctx.font = '600 9px ' + MONO;
          for (let i = 0; i < sparks; i++) {
            const loop = t * rate + hash(i, 12, 0) * 7, life = loop % 1;
            const ang = hash(i, 13, Math.floor(loop)) * Math.PI * 2;
            const r = rad + life * reach;
            ctx.fillStyle = rgba(hash(i, 14, 0) < 0.5 ? C.amber : C.clay, (1 - life) * 0.8);
            ctx.fillText('*+·'[(hash(i, 15, 0) * 3) | 0], vx + Math.cos(ang) * r, vy + Math.sin(ang) * r);
          }
        } else {
          // armed: particles leave the ball one at a time on fast tracks with fading trails
          charge.tracks = charge.tracks || [];
          charge.nextTrack = charge.nextTrack || t;
          while (t >= charge.nextTrack) {
            const kind = Math.random();
            charge.tracks.push({
              ang: Math.random() * Math.PI * 2, born: charge.nextTrack,
              speed: 760 + Math.random() * 640,
              // most run nearly straight; one in six bends hard enough to come back round into the ball
              loop: kind < 0.17,
              curve: kind < 0.17 ? (Math.random() < 0.5 ? 1 : -1) * (2.6 + Math.random() * 1.2) : (Math.random() - 0.5) * 0.5,
              ch: SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0], hot: Math.random() < 0.25
            });
            charge.nextTrack += 0.05 + Math.random() * 0.07;
          }
          // what the particles can hit: nearby letters, the photo, the field
          if (!charge.near) {
            if (!textNodes) collectText();
            charge.near = [];
            for (const w of textNodes) {
              if (!w.node.parentNode) continue;
              const pos = charPositions(w);
              if (!pos) continue;
              let close = false;
              for (const [x, y] of pos) if (Math.hypot(x - charge.px, y - charge.py) < 1200) { close = true; break; }
              if (close) charge.near.push({ w, pos, hitUntil: new Float64Array(pos.length), hot: new Uint8Array(pos.length), hit: false });
            }
            charge.photo = photoTarget();
          }
          clearPhoto();
          ctx.font = '700 11px ' + MONO;
          for (let i = charge.tracks.length - 1; i >= 0; i--) {
            const tr = charge.tracks[i], age = t - tr.born;
            if (age > (tr.loop ? 0.9 : 1.1)) { charge.tracks.splice(i, 1); continue; }
            const dist = age * tr.speed;
            // where a track is after running `d` along it: nearly straight tracks bend
            // gently with distance; looping ones go round a circle tangent to the ball
            const at = (d) => {
              if (tr.loop) {
                const Rc = 70 + 30 * Math.abs(tr.curve - 2.6), th = (d / Rc) * Math.sign(tr.curve);
                const ccx = Math.cos(tr.ang + Math.PI / 2 * Math.sign(tr.curve)) * Rc, ccy = Math.sin(tr.ang + Math.PI / 2 * Math.sign(tr.curve)) * Rc;
                const sa = tr.ang - Math.PI / 2 * Math.sign(tr.curve);
                return [ccx + Math.cos(sa + th) * Rc, ccy + Math.sin(sa + th) * Rc];
              }
              const a = tr.ang + tr.curve * (d / 400);
              return [Math.cos(a) * (rad + d), Math.sin(a) * (rad + d)];
            };
            const [hox, hoy] = at(dist);
            const hx = charge.px + hox, hy = charge.py + hoy;
            const ha = Math.atan2(hoy - at(Math.max(0, dist - 8))[1], hox - at(Math.max(0, dist - 8))[0]);
            for (const e of charge.near) {
              for (let q = 0; q < e.pos.length; q++) {
                if (Math.abs(e.pos[q][0] - hx) < 10 && Math.abs(e.pos[q][1] - hy) < 10) { e.hitUntil[q] = t + 0.35; e.hot[q] = tr.hot ? 1 : 0; }
              }
            }
            if (charge.photo) {
              const ph = charge.photo, cxp = ph.x + ph.size / 2, cyp = ph.y + ph.size / 2;
              if (Math.hypot(hx - cxp, hy - cyp) < ph.size / 2 + 8) photoPatch(hx, hy, 14, tr.hot);
            }
            for (const pp of parts) {
              if (Math.abs(pp.x - (hx - window.scrollX)) < 12 && Math.abs(screenY(pp) - (hy - window.scrollY)) < 12 && t - pp.lastHit > 0.3) {
                pp.vx += Math.cos(ha) * 220; pp.vy += Math.sin(ha) * 220; pp.flash = 0.8; pp.lastHit = t;
              }
            }
            for (let j = 0; j < 7; j++) {
              const d = dist - j * 14;
              if (d < 0) break;
              const [ox2, oy2] = at(d);
              if (tr.loop && d > 40 && Math.hypot(ox2, oy2) < rad * 0.8) break;   // back inside the ball
              ctx.fillStyle = rgba(tr.hot ? C.clay : INK, (1 - j / 7) * 0.9 * (1 - age / (tr.loop ? 0.9 : 1.1)));
              ctx.fillText(j === 0 ? tr.ch : (j < 3 ? '·' : '.'), vx + ox2, vy + oy2);
            }
          }
          for (const e of charge.near) glitchHits(e, t);
        }
      }
      if (ripples.length || shatter || rays.length) clearPhoto();
      if (ripples.length) clearImages();
      drawShatter(t);
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        const age = t - rp.born;
        if (age < 0) continue;
        if (age > rp.life) {
          if (rp.sup && age < rp.life + 5.6) {              // the front is gone; the damage lingers
            for (const e of rp.near) if (e.linger) glitchRun(e, rp, age);
            drawPhotoLinger(rp, t);
            for (const tg of imageList) drawImageLinger(tg.c, t);
            continue;
          }
          restoreRipple(rp); ripples.splice(i, 1); continue;
        }
        const R = age * rp.speed, a = Math.pow(1 - age / rp.life, 2.2) * rp.alpha;   // eases out, never cuts off
        const vx = rp.px - window.scrollX, vy = rp.py - window.scrollY;
        // the front: rows of glyphs filling the band, brightest at the leading edge
        const rows = Math.max(1, Math.round(rp.thick / 11));
        ctx.font = '600 10px ' + MONO;
        const n = Math.max(10, Math.round((2 * Math.PI * R) / 15));
        const tick = Math.floor(age * 12);
        for (let q = 0; q < n; q++) {
          const ang = (q / n) * Math.PI * 2 + age * 0.3;
          const Rt = frontR(rp, ang, age);
          for (let row = 0; row < rows; row++) {
            if (hash(q, row + i * 7, tick) < 0.14) continue;                 // gaps
            const r = Rt - row * 11 + (hash(q, row, tick) - 0.5) * 3;       // jitter
            if (r < 4) continue;
            const fade = 1 - row / rows;
            const g = SCRAMBLE[(hash(q, row + i * 7, tick + 1) * SCRAMBLE.length) | 0];
            const tinted = hash(q, row, tick + 2) < 0.12;
            ctx.fillStyle = tinted ? rgba(hexToRgb(TINTS[(hash(q, 23, tick) * TINTS.length) | 0]), 0.6 * a * fade) : rgba(C.navy, (0.18 + 0.25 * hash(q, row, 3)) * a * fade);
            ctx.fillText(g, vx + Math.cos(ang) * r, vy + Math.sin(ang) * r);
          }
          // sparks thrown ahead of the front
          if (hash(q, 29, tick) < 0.06) {
            const r = Rt + 8 + hash(q, 31, tick) * 30;
            ctx.fillStyle = rgba(hexToRgb(TINTS[(hash(q, 37, tick) * TINTS.length) | 0]), 0.5 * a);
            ctx.fillText(SCRAMBLE[(hash(q, 41, tick) * SCRAMBLE.length) | 0], vx + Math.cos(ang) * r, vy + Math.sin(ang) * r);
          }
        }
        drawPhotoBand(rp, R, a);
        if (rp.sup) drawPhotoLinger(rp, t);
        for (const tg of imageList) { drawImageBand(tg, rp, R, a, t); if (rp.sup) drawImageLinger(tg.c, t); }
        for (const th of rp.thumbs) {
          const d = Math.hypot(th.cx - rp.px, th.cy - rp.py);
          const Rt = frontR(rp, Math.atan2(th.cy - rp.py, th.cx - rp.px), age);
          const near = d <= Rt + 40 && d >= Rt - rp.thick - 40;
          if (near && !th.on) { th.card.dispatchEvent(new Event('mouseenter')); th.on = true; }
          else if (!near && th.on) { th.card.classList.remove('ascii-on'); th.on = false; }
        }
        // shove the particles the front passes
        for (const p of parts) {
          const dx = p.x - vx, dy = screenY(p) - vy, d = Math.hypot(dx, dy) || 1;
          const Rt = frontR(rp, Math.atan2(dy, dx), age);
          if (d <= Rt && d >= Rt - 12 && t - p.lastHit > 0.5) {
            p.vx += dx / d * rp.shove * a; p.vy += dy / d * rp.shove * a; p.flash = 0.45; p.lastHit = t;
          }
        }
        // the letters under the front
        for (const e of rp.near) {
          if (!rp.sup && (e.dmin > R * 1.3 || e.dmax < R * 0.7 - rp.thick * 1.4)) { healRun(e); continue; }
          if (rp.sup && e.dmin > R * 1.3 && !e.linger) { healRun(e); continue; }
          glitchRun(e, rp, age);
        }
      }
    }

    // ── cosmic rays: now and then a particle streaks across the viewport at
    // great speed. It is drawn in NEGATIVE: a layer over the page blended in
    // difference mode, so the ray and its tail invert whatever they cross.
    // It knocks the field aside hard, glitches the letters it passes, marks
    // the photo and nudges the cloud, and every hit spews fresh glyph
    // particles out into the background.
    const rays = [];
    window.__rays = rays;
    let nextRay = 0, rayCount = 0;
    // flux 0..1: how often rays come. The mean gap runs from 60 s down to 0.6 s on a log scale.
    let flux = 0.35;
    try { const v = localStorage.getItem('ray-flux'); if (v != null) flux = clamp01(parseFloat(v)); } catch (_) {}
    const rayGap = () => { const mean = 60 * Math.pow(0.01, flux); return mean * (0.5 + Math.random()); };
    const showerChance = () => 0.1 + flux * 0.7;
    document.addEventListener('ascii:flux', (e) => { flux = clamp01(e.detail); nextRay = performance.now() / 1000 + Math.min(rayGap(), 2); try { localStorage.setItem('ray-flux', String(flux)); } catch (_) {} });
    const rayCanvas = document.createElement('canvas');
    rayCanvas.className = 'ray-layer';
    rayCanvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(rayCanvas);
    const rctx = rayCanvas.getContext('2d');
    function sizeRayCanvas() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      rayCanvas.width = Math.round(w * dpr); rayCanvas.height = Math.round(h * dpr);
      rctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      rctx.textAlign = 'center'; rctx.textBaseline = 'middle';
    }
    // a burst of glyphs thrown out into the field from a point, roughly along a direction
    function spew(x, y, dirx, diry, n, hot) {
      for (let i = 0; i < n; i++) {
        const p = spawn(x, y + window.scrollY);                      // y in page space
        p.page = true;
        const a = Math.atan2(diry, dirx) + (Math.random() - 0.5) * 2.2;
        const sp = 160 + Math.random() * 320;
        p.isGlyph = true; p.ch = SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0]; p.size = 10 + Math.random() * 4;
        p.base = 0.3; p.boost = 1; p.flash = 1; p.launched = true;
        p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
        p.col = hot ? (Math.random() < 0.5 ? C.clay : C.amber) : (Math.random() < 0.3 ? C.midblue : C.navy);
        parts.push(p);
      }
      if (parts.length > want + 200) parts.splice(parts.findIndex(q => q.launched), Math.max(1, parts.length - want - 200));
    }
    function launchRay(now) {
      const fromLeft = Math.random() < 0.5;
      const ang = (Math.random() < 0.5 ? 1 : -1) * (0.12 + Math.random() * 0.4);   // shallow diagonal
      const sp = 2250 + Math.random() * 1350;
      const y0 = h * (0.1 + Math.random() * 0.8);
      const ray = {
        x: fromLeft ? -40 : w + 40, y: y0,
        vx: (fromLeft ? 1 : -1) * Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        born: now, trail: [], hot: Math.random() < 0.4, near: null, lastSpew: 0
      };
      if (!textNodes) collectText();
      ray.near = [];
      for (const wn of textNodes) {
        if (!wn.node.parentNode) continue;
        const pos = charPositions(wn);
        if (!pos) continue;
        ray.near.push({ w: wn, pos, hitUntil: new Float64Array(pos.length), hot: new Uint8Array(pos.length), hit: false });
      }
      ray.photo = photoTarget();
      rays.push(ray);
    }
    function drawRays(t, dt) {
      if (!nextRay) nextRay = t + 4 + Math.random() * 6;               // the first one comes soon after load
      if (t > nextRay && !reduced) {
        launchRay(t); rayCount++;
        if (Math.random() < showerChance()) { setTimeout(() => launchRay(performance.now() / 1000), 120); setTimeout(() => launchRay(performance.now() / 1000), 260); rayCount += 2; }
        nextRay = t + rayGap();
        document.dispatchEvent(new CustomEvent('ascii:ray', { detail: rayCount }));
      }
      if (rayCanvas.width !== Math.round(w * Math.min(window.devicePixelRatio || 1, 2))) sizeRayCanvas();
      rctx.clearRect(0, 0, w, h);
      for (let i = rays.length - 1; i >= 0; i--) {
        const r = rays[i];
        r.x += r.vx * dt; r.y += r.vy * dt;
        r.trail.push([r.x, r.y]); if (r.trail.length > 14) r.trail.shift();
        const gone = r.x < -160 || r.x > w + 160 || r.y < -160 || r.y > h + 160;
        if (gone) { for (const e of r.near) healRun(e); rays.splice(i, 1); continue; }
        // the ray in negative: a tiny head and a hairline tail on the difference
        // layer, so what it crosses flips for an instant; the damage is what you see
        const len = r.trail.length;
        rctx.lineCap = 'round';
        for (let j = 1; j < len; j++) {
          const [ax, ay] = r.trail[j - 1], [bx, by] = r.trail[j], k = j / len;
          rctx.strokeStyle = 'rgba(255,255,255,' + (0.05 + 0.9 * k * k * k).toFixed(3) + ')';
          rctx.lineWidth = 0.6 + 1.2 * k;
          rctx.beginPath(); rctx.moveTo(ax, ay); rctx.lineTo(bx, by); rctx.stroke();
        }
        rctx.fillStyle = 'rgba(255,255,255,1)';
        rctx.fillRect(r.x - 1.5, r.y - 1.5, 3, 3);
        // knock the field aside, hard, and spew new glyphs from each hit
        const dirx = r.vx, diry = r.vy;
        let hits = 0;
        for (const pp of parts) {
          const dx = pp.x - r.x, dy = screenY(pp) - r.y, d = Math.hypot(dx, dy);
          if (d < 40 && t - pp.lastHit > 0.4) {
            pp.vx += dx / (d || 1) * 320 + r.vx * 0.12; pp.vy += dy / (d || 1) * 320 + r.vy * 0.12;
            pp.flash = 1; pp.lastHit = t;
            if (!pp.isGlyph) { pp.isGlyph = true; pp.size = 10 + Math.random() * 3; pp.base = 0.25; }
            pp.ch = SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];
            hits++;
          }
        }
        if (hits && t - r.lastSpew > 0.08) { spew(r.x, r.y, -dirx, -diry, Math.min(4, hits), r.hot); r.lastSpew = t; }
        // letters under the head glitch, and spit out glyphs
        const px = r.x + window.scrollX, py = r.y + window.scrollY - shift();
        for (const e of r.near) {
          let any = false;
          for (let q = 0; q < e.pos.length; q++) {
            if (Math.abs(e.pos[q][0] - px) < 14 && Math.abs(e.pos[q][1] - py) < 14) { e.hitUntil[q] = t + 0.35; e.hot[q] = r.hot ? 1 : 0; any = true; }
          }
          if (any && t - r.lastSpew > 0.08) { spew(r.x, r.y, -dirx, -diry, 3, r.hot); r.lastSpew = t; }
          if (any || e.hit) glitchHits(e, t);
        }
        // the photo
        if (r.photo) {
          const ph = r.photo, cxp = ph.x + ph.size / 2, cyp = ph.y + ph.size / 2;
          if (Math.hypot(px - cxp, py - cyp) < ph.size / 2 + 8) {
            const was = charge; charge = { photo: ph };      // photoPatch reads the photo from the charge
            photoPatch(px, py, 20, r.hot);
            charge = was;
            if (t - r.lastSpew > 0.08) { spew(r.x, r.y, -dirx, -diry, 5, true); r.lastSpew = t; }
          }
        }
      }
    }

    function collide(t) {
      for (const m of parts) {
        if (Math.hypot(m.vx, m.vy) < 30) continue;
        const my = screenY(m);
        for (const o of parts) {
          if (o === m || t - o.lastHit < 0.6) continue;
          const dx = o.x - m.x, dy = screenY(o) - my;
          if (dx * dx + dy * dy > 100) continue;
          // pass most of the momentum on, with a little scatter
          o.vx += m.vx * 0.6 + (Math.random() - 0.5) * 30;
          o.vy += m.vy * 0.6 + (Math.random() - 0.5) * 30;
          m.vx *= 0.45; m.vy *= 0.45;
          o.flash = 1; m.flash = 0.6; o.lastHit = m.lastHit = t;
          if (o.isGlyph) o.ch = SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];
          else if (Math.random() < 0.5) { o.isGlyph = true; o.ch = SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0]; o.size = 10 + Math.random() * 3; o.base = 0.2; }
          break;
        }
      }
    }

    function frame(t) {
      const dt = lastT ? Math.min(t - lastT, 0.2) : 0; lastT = t;
      const sh = shift();
      const keep = Math.pow(0.3, dt);      // momentum decays over a second or so
      ctx.clearRect(0, 0, w, h);
      if (dt) collide(t);
      drawRipples(t);
      drawRays(t, dt);
      for (const p of parts) {
        const a = angle(p.x, p.y, t);
        p.x += (Math.cos(a) * 12 + p.vx) * dt; p.y += (Math.sin(a) * 12 + p.vy) * dt;
        p.vx *= keep; p.vy *= keep;
        p.flash *= Math.pow(0.05, dt); p.boost *= Math.pow(0.5, dt);
        if (p.x < -10) p.x = w + 10; else if (p.x > w + 10) p.x = -10;
        let y;
        if (p.page) {
          // thrown debris keeps its place on the page and scrolls with it
          y = p.y - window.scrollY;
          if (p.y < -200 || p.y > document.documentElement.scrollHeight + 200) { p.dead = true; continue; }
          if (y < -40 || y > h + 40) continue;                        // off screen: skip the draw
        } else {
          if (p.y < -10) p.y = h + 10; else if (p.y > h + 10) p.y = -10;
          y = ((p.y - sh) % (h + 20) + (h + 20)) % (h + 20) - 10;
        }
        if (p.isGlyph && Math.random() < 0.004) p.ch = SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];
        const alpha = Math.min(1, p.base * (0.55 + 0.45 * Math.sin(t * 0.7 + p.phase)) + p.flash * 0.55 + p.boost * 0.35);
        ctx.fillStyle = rgba(p.col, alpha);
        if (p.isGlyph) {
          ctx.font = '600 ' + (p.size * (1 + p.flash * 0.5)).toFixed(1) + 'px ' + MONO;
          ctx.fillText(p.ch, p.x, y);
        } else {
          ctx.beginPath(); ctx.arc(p.x, y, p.size * (1 + p.flash), 0, Math.PI * 2); ctx.fill();
        }
      }
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].dead) parts.splice(i, 1);
    }
    resize();
    frame(0);
    canvas._frame = frame; frame.__canvas = canvas;
    canvas._onScreen = true;
    if (!reduced) seen.observe(canvas);
    window.addEventListener('resize', resize);
  }

  // ── the flux dial in the footer ──────────────────────────────────
  function fluxDial() {
    const meter = document.getElementById('flux-meter');
    const note = document.getElementById('flux-note'), count = document.getElementById('flux-count');
    if (!meter) return;
    let v = 0.35;
    try { const sv = localStorage.getItem('ray-flux'); if (sv != null) v = clamp01(parseFloat(sv)); } catch (_) {}
    const COLS = 64;
    function describe(x) {
      const mean = 60 * Math.pow(0.01, x);
      const lo = mean * 0.5, hi = mean * 1.5;
      const fmt = (n) => n >= 1 ? Math.round(n) + ' s' : (Math.round(n * 10) / 10) + ' s';
      if (x < 0.15) return ['quiet', 'a ray every ' + fmt(lo) + '–' + fmt(hi)];
      if (x < 0.5) return ['calm', 'a ray every ' + fmt(lo) + '–' + fmt(hi)];
      if (x < 0.8) return ['busy', 'a ray every ' + fmt(lo) + '–' + fmt(hi) + ', showers likely'];
      if (x < 0.97) return ['storm', 'a ray every ' + fmt(lo) + '–' + fmt(hi) + ', showers'];
      return ['you asked for it', 'continuous shower'];
    }
    // the bar's own span inside the meter text, for mapping a pointer to a value:
    // measure the rendered width of the first character and of the first COLS+1
    let barLeft = 0, barWidth = 1;
    function measure() {
      const tn = meter.firstChild;
      if (!tn || tn.nodeType !== 3) return;
      const rg = document.createRange();
      rg.setStart(tn, 0); rg.setEnd(tn, 1);
      const r0 = rg.getBoundingClientRect();
      rg.setStart(tn, 1); rg.setEnd(tn, Math.min(tn.length, COLS + 1));
      const r1 = rg.getBoundingClientRect();
      barLeft = r1.left - meter.getBoundingClientRect().left; barWidth = Math.max(1, r1.width);
    }
    function render(t) {
      const x = v, filled = Math.round(x * COLS), tick = Math.floor(t * 8);
      let bar = '';
      for (let i = 0; i < COLS; i++) {
        if (i < filled) bar += x > 0.8 && hash(i, 1, tick) < 0.3 ? '*' : (i === filled - 1 ? '>' : '=');
        else bar += hash(i, 2, Math.floor(t * 2)) < 0.08 ? '·' : ' ';
      }
      const [name, desc] = describe(x);
      meter.textContent = '[' + bar + '] ' + Math.round(x * 100).toString().padStart(3) + '%';
      meter.setAttribute('aria-valuenow', Math.round(x * 100));
      if (note) { note.textContent = name + ' · ' + desc; note.classList.toggle('hot', x >= 0.8); }
    }
    function setFrom(clientX) {
      const r = meter.getBoundingClientRect();
      v = clamp01((clientX - r.left - barLeft) / barWidth);
      document.dispatchEvent(new CustomEvent('ascii:flux', { detail: v }));
      render(performance.now() / 1000);
    }
    let dragging = false;
    meter.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); dragging = true; meter.setPointerCapture(e.pointerId); measure(); setFrom(e.clientX); });
    meter.addEventListener('pointermove', (e) => { if (dragging) setFrom(e.clientX); });
    meter.addEventListener('pointerup', (e) => { dragging = false; e.stopPropagation(); });
    meter.addEventListener('pointercancel', () => { dragging = false; });
    meter.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 0.1 : 0.02;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { v = clamp01(v + step); } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { v = clamp01(v - step); } else return;
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('ascii:flux', { detail: v })); render(performance.now() / 1000);
    });
    pageOn(document, 'ascii:ray', (e) => { if (count) count.textContent = e.detail; });
    render(0);
    if (!reduced) pageTimers.push(setInterval(() => render(performance.now() / 1000), 125));
  }

  // ── headings decode from glyphs ──────────────────────────────────
  function decode(el) {
    const text = el.textContent, chars = Array.from(text);
    if (reduced || !text.trim()) return;
    el.textContent = chars.map(ch => /\s/.test(ch) || ch.length > 1 ? ch : SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0]).join('');
    el.classList.add('decoding');
    const start = performance.now();
    const dur = Math.min(1100, 350 + chars.length * 28);
    function frame(now) {
      const p = clamp01((now - start) / dur);
      const k = Math.floor(p * chars.length);
      let out = chars.slice(0, k).join('');
      for (let i = k; i < chars.length; i++) {
        out += /\s/.test(chars[i]) || chars[i].length > 1 ? chars[i] : SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];
      }
      el.textContent = out;
      if (p < 1) requestAnimationFrame(frame); else el.classList.remove('decoding');
    }
    requestAnimationFrame(frame);
  }
  document.addEventListener('ascii:redecode', () => {
    document.querySelectorAll('.sidebar-name, .display-name, .section-title, .card-title').forEach(el => decode(el));
    setTimeout(() => document.dispatchEvent(new Event('ascii:textchanged')), 1300);
  });
  const decoder = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { decoder.unobserve(e.target); decode(e.target); } });
  }, { threshold: 0.6 });

  // ── boot ─────────────────────────────────────────────────────────
  // scenes that live in the main column: run on load and again after an
  // in-place page swap (nav.js replaces .main-col and fires ascii:page-enter)
  function initPage() {
    const l = document.getElementById('ascii-landscape'); if (l) landscape(l);
    const h = document.getElementById('ascii-hills');     if (h) hills(h);
    const cl = document.getElementById('ascii-clouds');   if (cl) clouds(cl);
    const hs = document.getElementById('hero-scene');     if (hs) storm(hs, { cloud: 0.36, boltEvery: 9 });
    document.querySelectorAll('[data-scene="storm-small"]').forEach(c => storm(c, { cloud: 0.3, boltEvery: 14, rain: 1.2 }));
    document.querySelectorAll('[data-scene="orrery"]').forEach(c => orrery(c));
    document.querySelectorAll('.feat-card-link').forEach(hoverAscii);
    document.querySelectorAll('.display-name, .section-title, .card-title').forEach(el => decoder.observe(el));
    fluxDial();
    document.dispatchEvent(new Event('ascii:textchanged'));
  }
  function init() {
    const d = document.getElementById('bg-drift');        if (d) drift(d);
    const navEntries = (performance.getEntriesByType && performance.getEntriesByType('navigation')) || [];
    const isReload = navEntries.length && navEntries[0].type === 'reload';
    let nameSeen = false;
    try { nameSeen = !isReload && sessionStorage.getItem('ascii-name-seen') === '1'; sessionStorage.setItem('ascii-name-seen', '1'); } catch (_) {}
    if (!nameSeen) document.querySelectorAll('.sidebar-name').forEach(el => decoder.observe(el));
    initPage();
  }
  document.addEventListener('ascii:page-enter', initPage);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  // with motion reduced nothing animates, so draw each scene once more after
  // layout and fonts have settled
  window.addEventListener('load', () => {
    document.querySelectorAll('canvas').forEach(c => { if (c._frame) c._frame(performance.now() / 1000); });
  });
})();
