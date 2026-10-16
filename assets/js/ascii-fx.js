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
  // alpha to three places from a table: this runs thousands of times a frame
  const A3 = Array.from({ length: 1001 }, (_, i) => (i / 1000).toFixed(3));
  const rgba = (c, a) => 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + A3[a <= 0 ? 0 : a >= 1 ? 1000 : (a * 1000 + 0.5) | 0] + ')';
  const rampChar = (lum) => RAMP[(clamp01(lum) * (RAMP.length - 1)) | 0];
  const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const parseColor = (s) => {
    const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(s);
    return m ? [+m[1], +m[2], +m[3]] : C.navy;
  };

  // Shared ticker: every live canvas gets a frame at ~15 fps (or its own
  // rate, set as fn.__every in ms), and only while it is on screen and the
  // tab is visible. The small tolerance lets a cadence land on whole display
  // refreshes instead of alternating between four and five of them.
  const live = new Set();
  const FRAME_MS = 1000 / 15;
  function tick(now) {
    const t = now / 1000;
    live.forEach(fn => {
      if (now - (fn.__last || 0) >= (fn.__every || FRAME_MS) - 2) { fn.__last = now; fn(t); }
    });
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
  // `prep(t, cols, rows)` runs once per frame before the cells; returning true
  // keeps the previous paint (the canvas is left as it is, which costs nothing).
  // With an `overlay(ctx, t, cols, rows, cell, rowH, font)` the grid is painted
  // into a layer that is laid under the overlay every frame, so slow scenery
  // can be repainted rarely while things moving over it are drawn each frame.
  function makeGrid(canvas, cellPx, paint, prep, overlay) {
    const ctx = canvas.getContext('2d');
    let cols = 0, rows = 0, cell = cellPx, dpr = 1;
    let baseFont = '';
    const layer = overlay ? document.createElement('canvas') : null;
    const lctx = layer ? layer.getContext('2d') : null;

    function resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      if (layer) { layer.width = canvas.width; layer.height = canvas.height; }
      cols = Math.max(1, Math.round(w / cellPx));
      rows = Math.max(1, Math.round(h / cellPx));
      cell = w / cols;
      baseFont = '600 ' + Math.round(cell + 1) + 'px ' + MONO;
      for (const c of (layer ? [ctx, lctx] : [ctx])) {
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.font = baseFont;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
      }
    }

    function frame(t) {
      if (!cols) resize();
      const W = canvas.clientWidth, H = canvas.clientHeight, rowH = H / rows;
      const keep = prep ? prep(t, cols, rows) === true : false;
      if (keep && !layer) return;
      const g = layer ? lctx : ctx;
      if (!keep) {
        g.clearRect(0, 0, W, H);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const v = paint(c / cols, r / rows, t, c, r);
            if (!v || v[0] <= 0.02) continue;
            g.fillStyle = v[1];
            if (v[3]) g.font = '700 ' + Math.round(cell * v[3]) + 'px ' + MONO;
            g.fillText(v[2] || rampChar(v[0]), (c + 0.5) * cell, (r + 0.5) * rowH);
            if (v[3]) g.font = baseFont;
          }
        }
      }
      if (layer) {
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(layer, 0, 0, W, H);
        overlay(ctx, t, cols, rows, cell, rowH, baseFont);
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
    // where each bump is this frame (they drift with time); set once per frame
    const bcx = new Float64Array(bumps.length), bcy = new Float64Array(bumps.length);
    function centres(t) {
      for (let i = 0; i < bumps.length; i++) {
        const b = bumps[i];
        bcx[i] = b[0] + Math.sin(t * 0.17 + b[4] * 40) * b[4];
        bcy[i] = b[1] + Math.cos(t * 0.13 + b[5] * 40) * b[5];
      }
    }
    centres(0);
    function height(x, y) {
      const bx = (x - 0.5) * 2, by = (y - 0.5) * 2;
      let h = 1.1 * (bx * bx + by * by);                    // the bowl
      for (let i = 0; i < bumps.length; i++) {
        const b = bumps[i];
        const dx = (x - bcx[i]) / 0.42, dy = (y - bcy[i]) / 0.36;
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
        const x = 0.2 + Math.random() * 0.6, y = 0.2 + Math.random() * 0.6, h = height(x, y);
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
        const gx = (height(b.x + e, b.y) - height(b.x - e, b.y)) / (2 * e);
        const gy = (height(b.x, b.y + e) - height(b.x, b.y - e)) / (2 * e);
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
    // Per frame: the surface sampled once per cell (with a one-cell margin so
    // the slope can be read from neighbours), and the points and trails
    // rasterised into a map of cells. Per resize: the vignette and the
    // thinning pattern, which never change.
    let gc = 0, gr = 0, HG = null, vigA = null, thinA = null, dirty = true, lastPaint = -1;
    pageOn(document, 'ascii:thunder', () => { dirty = true; });
    function prep(t, cols, rows) {
      if (cols !== gc || rows !== gr) {
        gc = cols; gr = rows; dirty = true;
        HG = new Float32Array((cols + 2) * (rows + 2));
        vigA = new Float32Array(cols * rows); thinA = new Float32Array(cols * rows);
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const u = c / cols, v = r / rows;
          vigA[r * cols + c] = clamp01(2.2 - Math.hypot((u - 0.5) * 2, (v - 0.5) * 2) * 1.6);
          thinA[r * cols + c] = hash(c, r, 9);
        }
      }
      if (t !== lastT) { lastT = t; centres(t); step(t); }
      // the surface is repainted while the pointer is shaping it, after a
      // thunderclap, and otherwise every fourth frame: the hills drift about a
      // pixel in that time
      const active = cursor.on || cursor.k > 0.001;
      if (!dirty && !active && t - lastPaint < 0.25) return true;
      dirty = false; lastPaint = t;
      const S = cols + 2;
      for (let r = -1; r <= rows; r++) {
        const v = r / rows, row = (r + 1) * S;
        for (let c = -1; c <= cols; c++) HG[row + c + 1] = height(c / cols, v);
      }
      return false;
    }
    // the points and their trails, drawn over the surface every frame: each
    // takes its cell (trails oldest to newest, then the points, so the newest
    // mark wins a shared cell)
    function overlay(ctx, t, cols, rows, cell, rowH, font) {
      const put = (x, y, dx, dy, lum, color, ch, scale) => {
        const c0 = Math.max(0, Math.ceil((x - dx) * cols)), c1 = Math.min(cols - 1, Math.floor((x + dx) * cols));
        const r0 = Math.max(0, Math.ceil((y - dy) * rows)), r1 = Math.min(rows - 1, Math.floor((y + dy) * rows));
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
          if (Math.abs(c / cols - x) >= dx || Math.abs(r / rows - y) >= dy || vigA[r * cols + c] <= 0) continue;
          ctx.clearRect(c * cell, r * rowH, cell, rowH);
          ctx.fillStyle = color;
          if (scale) ctx.font = '700 ' + Math.round(cell * scale) + 'px ' + MONO;
          ctx.fillText(ch, (c + 0.5) * cell, (r + 0.5) * rowH);
          if (scale) ctx.font = font;
        }
      };
      for (let k = balls.length - 1; k >= 0; k--) {
        const b = balls[k], n = b.trail.length;
        for (let i = 0; i < n; i++) put(b.trail[i][0], b.trail[i][1], 0.012, 0.016, 0.7, rgba(C.clay, 0.3 + 0.65 * i / n), i > n - 4 ? '*' : '·', 0);
      }
      for (let k = balls.length - 1; k >= 0; k--) put(balls[k].x, balls[k].y, 0.013, 0.017, 1, rgba(C.clay, 1), '@', 2.4);
    }
    const grid = makeGrid(canvas, 7, (u, v, t, c, r) => {
      const i = r * gc + c, vig = vigA[i];
      if (vig <= 0) return null;                            // a round, feathered edge rather than a box
      const S = gc + 2, g = (r + 1) * S + c + 1;
      const h = clamp01((HG[g] + 0.6) / 2.2);              // hollows ~0, inner hills ~0.5, rim ~1
      // slope: lit from the upper left, shaded on the far side (central differences over the neighbours)
      const hx = (HG[g + 1] - HG[g - 1]) * 0.012 * gc, hy = (HG[g + S] - HG[g - S]) * 0.012 * gr;
      const lit = clamp01(0.5 - (hx + hy) * 2.2);
      // contour bands: a bright line every level, a faint band between
      const lv = (h * 7) % 1;
      const line = lv < 0.16 ? 1 : 0;
      if (h < 0.16 && !line) return null;                  // the floor of a hollow is open
      // between the lines the fill thins toward the valleys so the terrain breathes
      if (!line && thinA[i] > 0.55 + h * 0.45) return null;
      const lum = line ? (0.6 + h * 0.4) * vig : (0.1 + h * 0.45 + lit * 0.2) * vig;
      const col = line ? mix(C.navy, C.clay, Math.pow(h, 1.2)) : mix(mix(C.pale, C.midblue, 0.55 + lit * 0.3), C.amber, h * 0.8);
      return [lum, rgba(col, (line ? 0.6 + h * 0.4 : 0.28 + h * 0.4) * vig)];
    }, prep, overlay);

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
      if (reduced) { const tn = performance.now() / 1000; centres(tn); step(tn); grid.frame(tn); }
    });
  }

  // ── footer: Game of Life ──────────────────────────────────────────
  // Conway's Life on a torus, twelve generations a second: births flash
  // amber and settle into navy, the recently dead fade. A click paints a
  // clump, a super wave reseeds, and a still or empty board reseeds itself.
  function life(canvas) {
    let gc = 0, gr = 0, cur = null, nxt = null, age = null, died = null, frames = 0, lastT = 0, quiet = 0, gen = 0;
    const GUN = [[0,4],[0,5],[1,4],[1,5],[10,4],[10,5],[10,6],[11,3],[11,7],[12,2],[12,8],[13,2],[13,8],[14,5],[15,3],[15,7],[16,4],[16,5],[16,6],[17,5],[20,2],[20,3],[20,4],[21,2],[21,3],[21,4],[22,1],[22,5],[24,0],[24,1],[24,5],[24,6],[34,2],[34,3],[35,2],[35,3]];
    function seed() {
      cur.fill(0); age.fill(0); died.fill(0); gen = 0; quiet = 0;
      for (let i = 0; i < cur.length; i++) if (Math.random() < 0.1) cur[i] = 1;
      if (gc > 50 && gr > 14) for (const [x, y] of GUN) cur[(y + 2) * gc + x + 3] = 1;
      for (let g = 0; g < 3; g++) { const x = (Math.random() * (gc - 6)) | 0, y = (Math.random() * (gr - 6)) | 0; for (const [dx, dy] of [[1,0],[2,1],[0,2],[1,2],[2,2]]) cur[(y + dy) * gc + x + dx] = 1; }
    }
    function step() {
      let changed = 0, pop = 0;
      for (let r = 0; r < gr; r++) {
        const up = ((r - 1 + gr) % gr) * gc, row = r * gc, dn = ((r + 1) % gr) * gc;
        for (let c = 0; c < gc; c++) {
          const cl = (c - 1 + gc) % gc, cr = (c + 1) % gc;
          const n = cur[up + cl] + cur[up + c] + cur[up + cr] + cur[row + cl] + cur[row + cr] + cur[dn + cl] + cur[dn + c] + cur[dn + cr];
          const a = cur[row + c], b = a ? (n === 2 || n === 3 ? 1 : 0) : (n === 3 ? 1 : 0);
          nxt[row + c] = b;
          if (b) { age[row + c] = a ? Math.min(250, age[row + c] + 1) : 0; pop++; } else if (a) died[row + c] = 4;
          if (a !== b) changed++;
        }
      }
      const tmp = cur; cur = nxt; nxt = tmp;
      for (let i = 0; i < died.length; i++) if (died[i] && !cur[i]) died[i]--;
      gen++;
      quiet = changed < 4 ? quiet + 1 : 0;
      if (quiet > 36 || pop < cur.length * 0.015) seed();
    }
    pageOn(document, 'ascii:thunder', () => { if (cur) seed(); });
    canvas.addEventListener('pointerdown', (e) => {
      e.stopPropagation();                                   // a click here sows cells; it is not a press on blank paper
      const b = canvas.getBoundingClientRect(), c = ((e.clientX - b.left) / (b.width / gc)) | 0, r = ((e.clientY - b.top) / (b.height / gr)) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (Math.random() < 0.75) cur[((r + dy + gr) % gr) * gc + (c + dx + gc) % gc] = 1;
    });
    const grid = makeGrid(canvas, 8, (u, v, t, c, r) => {
      const i = r * gc + c;
      if (cur[i]) {
        const a = age[i];
        if (a === 0) return [1, rgba(C.amber, 0.95), '*'];
        if (a < 4) return [1, rgba(mix(C.amber, C.navy, a / 4), 0.85), '#'];
        return [1, rgba(C.navy, 0.72), '@'];
      }
      if (died[i]) return [1, rgba(C.midblue, 0.12 * died[i]), '.'];
      return null;
    }, (t, cols, rows) => {
      if (cols !== gc || rows !== gr) { gc = cols; gr = rows; cur = new Uint8Array(cols * rows); nxt = new Uint8Array(cols * rows); age = new Uint8Array(cols * rows); died = new Uint8Array(cols * rows); seed(); }
      if (lastT && t !== lastT) step();
      lastT = t;
    }, (ctx) => {
      // the generation count, on a cleared patch so it never overprints live cells
      ctx.textAlign = 'left'; ctx.font = '600 10px ' + MONO;
      const label = 'gen ' + gen, w = ctx.measureText(label).width;
      ctx.clearRect(4, 2, w + 12, 18);
      ctx.fillStyle = rgba(C.navy, 0.45); ctx.fillText(label, 10, 12);
    });
    grid.frame.__every = 1000 / 12;   // twelve generations a second
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

  // ── chaos game: fractals grown from one random rule ──────────────
  // Pick a corner at random, jump halfway toward it, and repeat: the points
  // land on the Sierpinski triangle and nowhere else. Other sets of
  // shrinking maps grow other fractals the same way (a fern, a dragon, the
  // Koch curve, a carpet), and the scene drifts from one to the next by
  // blending their maps, so every frame in between is a fractal too.
  // Thousands of points play at once and a cell's glyph counts how many land
  // in it; its colour says which map put the last one there, so each colour
  // is a smaller copy of the whole. One point plays slowly in the open, its
  // jump drawn as a dotted line toward the fixed point of the map it drew.
  // The whole thing turns slowly about its upright axis like a sign on a
  // turntable, with a little perspective and a gentle nod, while the game
  // goes on in its own flat plane. It lingers while it faces the reader and
  // swings quickly through edge-on. A click moves on to the next fractal (a
  // quicker blend than the timed one), and a super wave scatters the points
  // into noise, from which they fall back one generation at a time.
  function chaos(canvas) {
    const R3 = Math.sqrt(3) / 2, PR = (3 - Math.sqrt(5)) / 2;
    // a similarity: scale s, turn a, then shift (e, f); maps are [a, b, c, d, e, f]
    // for x' = a x + b y + e, y' = c x + d y + f, with y up
    const sim = (s, a, e, f) => [s * Math.cos(a), -s * Math.sin(a), s * Math.sin(a), s * Math.cos(a), e, f];
    const pent = [], carpet = [];
    for (let i = 0; i < 5; i++) { const a = Math.PI / 2 + i * 2 * Math.PI / 5; pent.push(sim(PR, 0, (1 - PR) * Math.cos(a), (1 - PR) * Math.sin(a))); }
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== 1 || j !== 1) carpet.push(sim(1 / 3, 0, i / 3, j / 3));
    const SETS = [
      { name: 'sierpinski triangle · dim 1.585', maps: [sim(0.5, 0, 0, 0), sim(0.5, 0, 0.5, 0), sim(0.5, 0, 0.25, R3 / 2)] },
      { name: 'barnsley fern', turn: -Math.PI / 2, mirror: true, cols: [C.amber, C.sage, C.clay, C.midblue],
        maps: [[0, 0, 0, 0.16, 0, 0], [0.85, 0.04, -0.04, 0.85, 0, 1.6], [0.2, -0.26, 0.23, 0.22, 0, 1.6], [-0.15, 0.28, 0.26, 0.24, 0, 0.44]], w: [0.01, 0.85, 0.07, 0.07] },
      { name: 'heighway dragon · dim 2', maps: [[0.5, -0.5, 0.5, 0.5, 0, 0], [-0.5, -0.5, 0.5, -0.5, 1, 0]] },
      { name: 'koch curve · dim 1.262', maps: [sim(1 / 3, 0, 0, 0), sim(1 / 3, Math.PI / 3, 1 / 3, 0), sim(1 / 3, -Math.PI / 3, 0.5, R3 / 3), sim(1 / 3, 0, 2 / 3, 0)] },
      { name: 'sierpinski carpet · dim 1.893', maps: carpet },
      { name: 'lévy c curve · dim 2', maps: [[0.5, -0.5, 0.5, 0.5, 0, 0], [0.5, 0.5, -0.5, 0.5, 0.5, 0.5]] },
      { name: 'sierpinski pentagon · dim 1.672', maps: pent }
    ];
    const PAL = [C.navy, C.clay, C.midblue, C.amber, C.sage, mix(C.navy, C.clay, 0.5), mix(C.midblue, C.sage, 0.5), mix(C.clay, C.amber, 0.5)];
    // Every set is padded to K maps by repeating its own maps with their
    // weight shared out, which leaves its fractal unchanged, so any two sets
    // can be blended map by map. Each is turned (and mirrored, if asked) and
    // flipped into screen axes (y down) once, and its extent there measured
    // by playing the game.
    const K = 8;
    for (const S of SETS) {
      const n = S.maps.length, w = S.w || S.maps.map(() => 1 / n);
      S.src = []; S.pw = [];
      for (let j = 0; j < K; j++) { const i = j % n; S.src.push(i); S.pw.push(w[i] / (Math.floor((K - 1 - i) / n) + 1)); }
      const c = Math.cos(S.turn || 0), s = Math.sin(S.turn || 0), mx = S.mirror ? -1 : 1;
      S.R = [c * mx, -s, -s * mx, -c];                     // flip · turn · mirror: rigid, so its inverse is its transpose
      let x = 0, y = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let k = 0; k < 30000; k++) {
        let r = Math.random(), i = 0;
        while (i < n - 1 && (r -= w[i]) > 0) i++;
        const M = S.maps[i], nx = M[0] * x + M[1] * y + M[4], ny = M[2] * x + M[3] * y + M[5];
        x = nx; y = ny;
        if (k < 20) continue;
        const sx = S.R[0] * x + S.R[1] * y, sy = S.R[2] * x + S.R[3] * y;
        if (sx < x0) x0 = sx; if (sx > x1) x1 = sx; if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
      }
      S.box = [x0, x1, y0, y1];
      S.m = new Float64Array(K * 6);
    }
    // the maps in canvas pixels for a W x H box: T(x) = s R x + t fits the
    // set's extent with a margin, and each map becomes T f T^-1
    function fit(W, H) {
      DEPTH = 4.5 * W;
      for (const S of SETS) {
        const [x0, x1, y0, y1] = S.box, R = S.R;
        const s = Math.min((W * 0.92) / (x1 - x0), (H * 0.8) / (y1 - y0));
        const tx = W / 2 - s * (x0 + x1) / 2, ty = H / 2 - s * (y0 + y1) / 2 + H * 0.03;
        for (let j = 0; j < K; j++) {
          const M = S.maps[S.src[j]], o = j * 6;
          // R M R^T
          const p = R[0] * M[0] + R[1] * M[2], q = R[0] * M[1] + R[1] * M[3];
          const u = R[2] * M[0] + R[3] * M[2], v = R[2] * M[1] + R[3] * M[3];
          const a = p * R[0] + q * R[1], b = p * R[2] + q * R[3], c = u * R[0] + v * R[1], d = u * R[2] + v * R[3];
          S.m[o] = a; S.m[o + 1] = b; S.m[o + 2] = c; S.m[o + 3] = d;
          S.m[o + 4] = tx - (a * tx + b * ty) + s * (R[0] * M[4] + R[1] * M[5]);
          S.m[o + 5] = ty - (c * tx + d * ty) + s * (R[2] * M[4] + R[3] * M[5]);
        }
      }
    }

    // ── the game in play ─────────────────────────────────────────────
    const N = 4000, HOLD = 9, MORPH = 3.2, MORPH_CLICK = 1.4, GEN = 0.34, PLAY = 0.5, SPIN = 2 * Math.PI / 22;
    const ptx = new Float32Array(N), pty = new Float32Array(N), ptm = new Uint8Array(N);
    const M = new Float64Array(K * 6), CW = new Float64Array(K), FX = new Float64Array(K), FY = new Float64Array(K);
    const COL = [];
    let from = 0, to = 0, morphAt = 0, morphLen = MORPH, nextAt = 0, slowUntil = 0, nextGen = 0, opening = !reduced;
    let W = 0, H = 0, gc = 0, gr = 0, dens = null, last = null, level = 1, lastT = -1;
    const player = { x: 0, y: 0, ox: 0, oy: 0, j: 0, at: -1 };
    let turn = 0, cosA = 1, sinA = 0, cosB = 1, sinB = 0, DEPTH = 1;
    // the plane of the game seen turned by `turn` about the upright axis
    // through the middle of the box and nodded about the level one, in
    // perspective from 4.5 box widths away
    function proj(x, y) {
      const X = x - W / 2, Y = y - H / 2, Z = X * sinA;
      const yy = Y * cosB - Z * sinB, k = DEPTH / (DEPTH + Y * sinB + Z * cosB);
      return [W / 2 + X * cosA * k, H / 2 + yy * k];
    }
    const ease = (m) => m * m * (3 - 2 * m);
    const pick = () => { const r = Math.random() * CW[K - 1]; let j = 0; while (j < K - 1 && CW[j] < r) j++; return j; };
    // the maps of this frame: the two sets blended, and each map's fixed point
    function blend(m) {
      const A = SETS[from], B = SETS[to], e = ease(m);
      let acc = 0;
      for (let j = 0; j < K; j++) {
        const o = j * 6;
        for (let q = 0; q < 6; q++) M[o + q] = A.m[o + q] + (B.m[o + q] - A.m[o + q]) * e;
        acc += A.pw[j] + (B.pw[j] - A.pw[j]) * e; CW[j] = acc;
        COL[j] = mix((A.cols || PAL)[A.src[j]], (B.cols || PAL)[B.src[j]], e);
        const a = M[o], b = M[o + 1], c = M[o + 2], d = M[o + 3], det = (1 - a) * (1 - d) - b * c;
        FX[j] = ((1 - d) * M[o + 4] + b * M[o + 5]) / det; FY[j] = (c * M[o + 4] + (1 - a) * M[o + 5]) / det;
      }
    }
    function jump(n) {
      for (let k = 0; k < n; k++) for (let i = 0; i < N; i++) {
        const j = pick(), o = j * 6, x = ptx[i], y = pty[i];
        ptx[i] = M[o] * x + M[o + 1] * y + M[o + 4]; pty[i] = M[o + 2] * x + M[o + 3] * y + M[o + 5]; ptm[i] = j;
      }
    }
    function scatter() { for (let i = 0; i < N; i++) { ptx[i] = Math.random() * W; pty[i] = Math.random() * H; ptm[i] = (Math.random() * K) | 0; } }
    // a cell's count decays each frame and gains every point that lands in it
    function deposit(decay) {
      const cw = W / gc, rh = H / gr, cx = W / 2, cy = H / 2;
      for (let i = 0; i < dens.length; i++) dens[i] *= decay;
      for (let i = 0; i < N; i++) {
        const X = ptx[i] - cx, Y = pty[i] - cy, Z = X * sinA, k = DEPTH / (DEPTH + Y * sinB + Z * cosB);
        const c = Math.floor((cx + X * cosA * k) / cw), r = Math.floor((cy + (Y * cosB - Z * sinB) * k) / rh);
        if (c < 0 || r < 0 || c >= gc || r >= gr) continue;
        dens[r * gc + c] += 1; last[r * gc + c] = ptm[i];
      }
      let sum = 0, n = 0;
      for (let i = 0; i < dens.length; i++) if (dens[i] > 0.5) { sum += dens[i]; n++; }
      level = n ? 1.1 * sum / n : 1;
    }
    // straight onto the fractal, for a still frame
    function settle() { blend(0); scatter(); jump(30); dens.fill(0); for (let k = 0; k < 4; k++) { jump(1); deposit(1); } }
    function next(t, len) { if (from === to) { to = (from + 1) % SETS.length; morphAt = t; morphLen = len; } }
    function shake(t) { scatter(); slowUntil = t + GEN * 8; nextGen = t + GEN; }

    function prep(t, cols, rows) {
      if (cols !== gc || rows !== gr) {
        gc = cols; gr = rows; W = canvas.clientWidth; H = canvas.clientHeight;
        fit(W, H);
        dens = new Float32Array(cols * rows); last = new Uint8Array(cols * rows);
        if (opening) { blend(0); scatter(); } else settle();
      }
      if (t === lastT) return true;
      if (!reduced && lastT > 0 && t > lastT) turn += SPIN * (0.45 + 1.1 * sinA * sinA) * Math.min(0.1, t - lastT);
      lastT = t;
      const nod = 0.2 * Math.sin(turn * 0.6);
      cosA = Math.cos(turn); sinA = Math.sin(turn); cosB = Math.cos(nod); sinB = Math.sin(nod);
      // the first real frame starts the opening: noise falling onto the triangle
      if (opening && t > 0) { opening = false; shake(t); nextAt = t + GEN * 8 + HOLD; }
      if (!reduced && !opening && from === to && t >= nextAt) next(t, MORPH);
      let m = 0;
      if (from !== to) {
        m = clamp01((t - morphAt) / morphLen);
        if (m >= 1) { from = to; m = 0; nextAt = t + HOLD; }
      }
      blend(m);
      const slow = t < slowUntil;
      if (!slow || t >= nextGen) { jump(1); if (slow) nextGen = t + GEN; }
      deposit(slow ? 0.35 : 0.72);
      if (!slow && t - player.at > PLAY) {
        if (player.at < 0) { player.x = ptx[0]; player.y = pty[0]; }
        const j = pick(), o = j * 6;
        player.ox = player.x; player.oy = player.y; player.j = j; player.at = t;
        player.x = M[o] * player.ox + M[o + 1] * player.oy + M[o + 4]; player.y = M[o + 2] * player.ox + M[o + 3] * player.oy + M[o + 5];
      }
      return false;
    }
    const G = '.:-=+*#%@';
    // the slow point, its last jump and where it was headed, and the name
    function overlay(ctx, t, cols, rows, cell, rowH, font) {
      const put = (x, y, ch, color, scale) => {
        [x, y] = proj(x, y);
        const c = Math.floor(x / cell), r = Math.floor(y / rowH);
        if (c < 0 || r < 0 || c >= cols || r >= rows) return;
        ctx.clearRect(c * cell, r * rowH, cell, rowH);
        ctx.fillStyle = color;
        if (scale) ctx.font = '700 ' + Math.round(cell * scale) + 'px ' + MONO;
        ctx.fillText(ch, (c + 0.5) * cell, (r + 0.5) * rowH);
        if (scale) ctx.font = font;
      };
      if (player.at >= 0 && t >= slowUntil) {
        const f = 1 - 0.6 * clamp01((t - player.at) / PLAY);
        const dx = player.x - player.ox, dy = player.y - player.oy, n = Math.floor(Math.hypot(dx * cosA, dy) / (cell * 1.6));
        for (let s = 1; s < n; s++) put(player.ox + dx * s / n, player.oy + dy * s / n, '·', rgba(C.clay, 0.75 * f), 0);
        put(FX[player.j], FY[player.j], '+', rgba(C.amber, 0.9 * f), 1.5);
        put(player.x, player.y, '@', rgba(C.clay, 1), 1.6);
      }
      const S = SETS[from !== to && ease(clamp01((t - morphAt) / morphLen)) > 0.5 ? to : from];
      ctx.textAlign = 'left'; ctx.font = '600 10px ' + MONO;
      const label = S.name, w = ctx.measureText(label).width;
      ctx.clearRect(4, 2, w + 12, 18);
      ctx.fillStyle = rgba(C.navy, 0.45); ctx.fillText(label, 10, 12);
      ctx.textAlign = 'center'; ctx.font = font;
    }
    const grid = makeGrid(canvas, 6, (u, v, t, c, r) => {
      const i = r * gc + c, d = dens[i];
      if (d < 0.3) return null;
      const L = 1 - Math.exp(-d / level);
      return [L, rgba(COL[last[i]], 0.3 + 0.65 * L), G[(L * 8.99) | 0]];
    }, prep, overlay);
    grid.frame.__every = 1000 / 20;

    canvas.addEventListener('pointerdown', (e) => {
      e.stopPropagation();                                   // a click here moves to the next fractal; it is not a press on blank paper
      const t = performance.now() / 1000;
      if (!reduced) { next(t, MORPH_CLICK); return; }
      from = to = (from + 1) % SETS.length; settle(); lastT = -1; grid.frame(t);
    });
    pageOn(document, 'ascii:thunder', () => { if (dens && !reduced) shake(performance.now() / 1000); });
  }

  // ── storm: cloud, rain in gusts, ridges, and lightning ───────────
  // A dark cloud mass billows out of the top of the box, lit from within
  // now and then by sheet lightning. Rain falls out of it in streaks that
  // lean with the gusts and dies on the front ridge with a splash. Three
  // ridges stand back to front, the far ones hazed, the near one solid
  // ink. Every so often a bolt forks down from the cloud base to a crest:
  // it flickers, lights the cloud's underside and the crests amber, and
  // throws a burst of sparks out into the page.
  function storm(canvas, opts) {
    opts = opts || {};
    const ctx = canvas.getContext('2d');
    const cellPx = 7;
    let W = 0, H = 0, cols = 0, rows = 0, lastT = 0;
    let ridges = [], tex = [];               // per layer: crest y (px) per column; a fixed texture per cell
    let CF = null, cRows = 0, cPhase = -1;   // the cloud field per cell, refreshed in rotation
    const rain = [], splashes = [];
    let bolt = null, flash = 0, sheet = 0, nextBolt = 0, nextSheet = 0, frenzyUntil = 0;
    let salvo = opts.salvo || 0;             // bolts still owed from the opening salvo
    const cloudBot = () => H * (opts.cloud || 0.36);
    const LAYERS = [[0.56, 0.42, 3, 0.16, 11], [0.72, 0.3, 4, 0.11, 23], [0.88, 0.2, 6, 0.08, 37]];   // base, height, peaks, width, seed
    const FRONTG = ':;=+*#%@';               // the front ridge by density: symbols, never letters
    // the ridges only change colour while a bolt lights them, so they are
    // painted into a layer that is laid down each frame and repainted while lit
    const ridgeLayer = document.createElement('canvas');
    const rctx = ridgeLayer.getContext('2d');
    let layerFlash = -1;
    const wantRain = (w, frenzy) => Math.round(cols * (opts.rain == null ? 1.5 : opts.rain) * (0.7 + 0.5 * w) * (frenzy ? 2 : 1));
    const CLOUDG = '.:;~=+*o%#@&';            // cloud glyphs by density: symbols, never letters

    function resize() {
      W = canvas.clientWidth; H = canvas.clientHeight;
      if (!W || !H) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ridgeLayer.width = canvas.width; ridgeLayer.height = canvas.height;
      for (const c of [ctx, rctx]) { c.setTransform(dpr, 0, 0, dpr, 0, 0); c.textAlign = 'center'; c.textBaseline = 'middle'; }
      cols = Math.round(W / cellPx); rows = Math.round(H / cellPx);
      // each ridge is a few peaks of fixed random height and width (the
      // highest wins at every column, so the line is a range of sharp
      // summits) with a little raggedness on top; the back ridge high and
      // broad, the front low and busy
      ridges = LAYERS.map(([base, amp, nPeaks, width, seed]) => {
        const peaks = [];
        for (let i = 0; i < nPeaks; i++) peaks.push([hash(i, seed, 1) * 1.1 - 0.05, 0.45 + hash(i, seed, 2) * 0.55, 0.05 + hash(i, seed, 3) * width]);
        const ys = [];
        for (let c = 0; c <= cols; c++) {
          const u = c / cols;
          let h = 0;
          for (const [pu, ph, pw] of peaks) h = Math.max(h, ph * Math.pow(Math.max(0, 1 - Math.abs(u - pu) / pw), 1.15));
          h += (noise(u * 18 + seed, seed, 0) - 0.5) * 0.08;
          ys.push(H * (base - amp * h));
        }
        return ys;
      });
      tex = [0, 1, 2].map(L => {
        const a = new Float32Array(cols * rows);
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) a[r * cols + c] = noise(c * 0.45, r * 0.45, L * 7 + 3);
        return a;
      });
      cRows = Math.min(rows, Math.ceil(cloudBot() / cellPx) + 2);
      CF = new Float32Array((cols + 1) * cRows); cPhase = -1;
      const want = wantRain(0.6, false);
      while (rain.length < want) rain.push(newDrop(true));
      rain.length = want;
      layerFlash = -1;
    }
    function newDrop(anywhere) {
      const cb = cloudBot();
      return {
        x: Math.random() * W * 1.4 - W * 0.1,
        y: anywhere ? cb * 0.6 + Math.random() * (H - cb * 0.6) : cb * (0.55 + Math.random() * 0.45),
        s: 250 + Math.random() * 220, len: 3 + Math.floor(Math.random() * 3), a: 0.3 + Math.random() * 0.45
      };
    }
    const wind = (t) => 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * 0.21), 2) + (noise(t * 0.5, 9, 0) - 0.5) * 0.6;

    function makeBolt(t) {
      // from the cloud base down to the front ridge, wandering one way then jagging the other
      const x0 = W * (0.2 + Math.random() * 0.7);
      const c0 = Math.min(cols, Math.max(0, Math.round(x0 / cellPx)));
      const yEnd = ridges[2][c0];
      const main = [];
      const cb = cloudBot();
      let x = x0, y = cb * (0.65 + Math.random() * 0.2), drift = (Math.random() - 0.5) * 0.6;
      while (y < yEnd) {
        main.push([x, y]);
        if (Math.random() < 0.2) drift = (Math.random() - 0.5) * 1.2;
        x += drift * 9 + (Math.random() - 0.5) * 14;
        y += 6 + Math.random() * 9;
      }
      main.push([x, yEnd]);
      const branches = [];
      const nb = 1 + Math.floor(Math.random() * 3);
      for (let b = 0; b < nb; b++) {
        const from = main[Math.floor(Math.random() * main.length * 0.75)];
        const dir = Math.random() < 0.5 ? -1 : 1;
        let bx = from[0], by = from[1];
        const seg = [];
        const n = 3 + Math.floor(Math.random() * 6);
        for (let k = 0; k < n; k++) { seg.push([bx, by]); bx += dir * (3 + Math.random() * 12); by += 3 + Math.random() * 9; }
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
      if (salvo > 0 && --salvo > 0) nextBolt = t + 0.55 + Math.random() * 0.6;
      else nextBolt = t + (opts.boltEvery || 9) * (0.6 + Math.random() * 0.9);
    }

    function paintRidges() {
      rctx.clearRect(0, 0, W, H);
      const cols3 = [mix(C.sage, C.pale, 0.5), mix(C.sage, C.navy, 0.45), mix(C.navy, [10, 16, 30], 0.3)];
      const alpha3 = [0.5, 0.7, 0.92];
      let font = '';
      const setFont = (f) => { if (f !== font) rctx.font = font = f; };
      for (let L = 0; L < 3; L++) {
        const ys = ridges[L], tx = tex[L];
        const body = mix(cols3[L], C.amber, flash * 0.45);
        const edge = mix(mix(cols3[L], C.pale, 0.35), C.amber, flash * 0.9);
        for (let c = 0; c < cols; c++) {
          const crest = ys[c], limit = L < 2 ? ridges[L + 1][c] : H;   // hidden behind the next ridge forward
          const slope = (ys[c + 1] - ys[c]) / cellPx;
          const r0 = Math.ceil(crest / cellPx), r1 = Math.min(rows, Math.ceil(limit / cellPx));
          for (let r = r0; r < r1; r++) {
            const y = (r + 0.5) * cellPx, depth = r - r0;
            if (depth === 0) {
              // the crest: an edge lit by the sky, amber in a flash
              setFont('700 9px ' + MONO);
              rctx.fillStyle = rgba(edge, Math.min(1, alpha3[L] + 0.15));
              rctx.fillText(slope > 0.3 ? '\\' : slope < -0.3 ? '/' : '^', (c + 0.5) * cellPx, y);
              continue;
            }
            // the mass: hatching that fades with depth on the far ridges, a dark textured ink in front
            const t0 = tx[r * cols + c];
            const dens = clamp01(1 - depth / [7, 12, 9][L]) * (L === 2 ? 0.7 + t0 * 0.3 : 0.55 + t0 * 0.45);
            if (dens < 0.12 || t0 > [0.25, 0.35, 0.2][L] + dens * 0.8) continue;   // gaps in the hatch
            setFont('600 9px ' + MONO);
            rctx.fillStyle = rgba(mix(body, C.amber, flash * 0.6 * clamp01(1 - depth / 6)), alpha3[L] * (0.45 + dens * 0.55));
            rctx.fillText(L === 2 ? FRONTG[(dens * 7.99) | 0] : rampChar(0.06 + dens * 0.3), (c + 0.5) * cellPx, y);
          }
        }
      }
      layerFlash = flash;
    }

    function frame(t) {
      if (!W) resize();
      const dt = lastT ? Math.min(t - lastT, 0.2) : 0; lastT = t;
      ctx.clearRect(0, 0, W, H);
      // the first bolt is scheduled from the first live frame (t = 0 is the
      // still draw); a page opened with a salvo gets it right away, then settles
      if (!nextBolt && t > 0) nextBolt = t + (salvo > 0 ? 0.45 : 3 + Math.random() * 4);
      if (!nextSheet && t > 0) nextSheet = t + 2 + Math.random() * 5;
      const frenzy = t < frenzyUntil;
      if (dt && t > nextBolt && !reduced) { makeBolt(t); if (frenzy) nextBolt = t + 0.5; }
      if (dt && t > nextSheet && !reduced) { sheet = 0.6 + Math.random() * 0.4; nextSheet = t + 4 + Math.random() * 9; }
      flash *= Math.pow(0.02, dt); sheet *= Math.pow(0.004, dt);
      const w = frenzy ? 1.3 : wind(t);
      const lean = w * 0.9;
      const cb = cloudBot();

      // the cloud: a dense navy base billowing out of a lighter top; sheet
      // lightning lights it from within, a strike from below
      const all = cPhase < 0; cPhase = (cPhase + 1) & 1;
      const top = mix(C.midblue, C.pale, 0.45);
      const stride = cols + 1;
      ctx.font = '600 8px ' + MONO;
      for (let r = 0; r < cRows; r++) {
        const v = r / (cRows - 1);
        if (all || (r & 1) === cPhase) for (let c = 0; c <= cols; c++) CF[r * stride + c] = fbm((c / cols) * 2.8 + t * 0.045, v * 2.4 + 0.5, t * 0.03);
        let col = mix(top, C.navy, clamp01(v * 1.5 - 0.1));
        col = mix(col, C.amber, Math.min(1, flash * (0.35 + 0.65 * v) + sheet * 0.5));
        for (let c = 0; c < cols; c++) {
          const n = CF[r * stride + c], t0 = tex[0][r * cols + c];
          const d = clamp01((n - 0.5 + (1 - v) * 0.18) / 0.22);
          if (d < 0.08 || t0 > 0.3 + d * 0.5) continue;                      // holes, fewer where the mass is dense
          const up = CF[(r > 0 ? r - 1 : 0) * stride + (c > 0 ? c - 1 : 0)];
          const lit = clamp01(0.5 + (n - up) * 5);                          // a billow facing the light is a lighter glyph
          ctx.fillStyle = rgba(mix(col, top, lit * 0.35 * (1 - v)), 0.18 + d * 0.5);
          ctx.fillText(CLOUDG[(clamp01(d + (t0 - 0.5) * 0.2) * 11.99) | 0], (c + 0.5) * cellPx, (r + 0.5) * cellPx);
        }
      }

      // the ridges, from the layer; repainted while a flash is changing their colour
      if (layerFlash < 0 || Math.abs(flash - layerFlash) > 0.015) paintRidges();
      ctx.drawImage(ridgeLayer, 0, 0, W, H);

      // the glow of a strike on the paper and the slopes
      if (bolt && t - bolt.born < 0.55) {
        const a = clamp01(1 - (t - bolt.born) / 0.5);
        const [gx, gy] = bolt.strike;
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, 90);
        g.addColorStop(0, rgba(C.amber, 0.35 * a)); g.addColorStop(1, rgba(C.amber, 0));
        ctx.fillStyle = g; ctx.fillRect(gx - 90, gy - 90, 180, 180);
      }

      // rain: streaks that lean with the gusts, dying on the front ridge, some with a splash
      const want = wantRain(w, frenzy);
      while (rain.length < want) rain.push(newDrop(false));
      if (!frenzy && rain.length > want + 10) rain.length = want;
      const ux = -lean * 0.5, un = Math.hypot(ux, 1);
      const ch = lean > 0.55 ? '/' : '|';
      const rainCol = mix(mix(C.midblue, C.navy, 0.35), C.amber, flash * 0.6);
      ctx.font = '600 10px ' + MONO;
      for (const d of rain) {
        d.y += d.s * dt; d.x += d.s * ux * dt;
        const c = Math.min(cols, Math.max(0, Math.round(d.x / cellPx)));
        const floor = ridges[2][c];
        if (d.y > floor + 3 || d.y > H || d.x < -30) {
          if (d.y > floor && d.x > 0 && d.x < W && Math.random() < 0.35) splashes.push({ x: d.x, y: floor - 3, born: t });
          Object.assign(d, newDrop(false)); continue;
        }
        if (d.x < -10 || d.x > W + 10) continue;
        for (let k = 0; k < d.len; k++) {
          const x = d.x - ux / un * k * 6, y = d.y - k * 6 / un;
          if (y < cb * 0.5) break;
          ctx.fillStyle = rgba(rainCol, d.a * (0.4 + w * 0.6) * (1 - k / (d.len + 1)));
          ctx.fillText(ch, x, y);
        }
      }
      ctx.font = '600 8px ' + MONO;
      for (let i = splashes.length - 1; i >= 0; i--) {
        const s = splashes[i], age = t - s.born;
        if (age > 0.18) { splashes.splice(i, 1); continue; }
        ctx.fillStyle = rgba(rainCol, 0.6 * (1 - age / 0.18));
        ctx.fillText(age < 0.09 ? "'" : '.', s.x, s.y - age * 30);
      }

      // lightning: a halo along the channel, then the channel in glyphs, flickering as it fades
      if (bolt) {
        const age = t - bolt.born;
        if (age < 0.55) {
          const a = (age < 0.07 ? 1 : clamp01(1 - (age - 0.07) / 0.45)) * (0.6 + 0.4 * Math.abs(Math.sin(age * 45)));
          const path = (seg) => { ctx.beginPath(); ctx.moveTo(seg[0][0], seg[0][1]); for (let i = 1; i < seg.length; i++) ctx.lineTo(seg[i][0], seg[i][1]); ctx.stroke(); };
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.strokeStyle = rgba(C.amber, 0.3 * a);
          ctx.lineWidth = 14; path(bolt.main);
          ctx.lineWidth = 9; bolt.branches.forEach(path);
          ctx.strokeStyle = rgba(C.clay, 0.85 * a);
          ctx.lineWidth = 2.2; path(bolt.main);
          ctx.lineWidth = 1.5; bolt.branches.forEach(path);
          const drawSeg = (seg, size) => {
            ctx.font = '700 ' + size + 'px ' + MONO;
            ctx.fillStyle = rgba(C.clay, a);
            for (let i = 0; i < seg.length; i++) {
              const [x, y] = seg[i];
              const nx = seg[i + 1] ? seg[i + 1][0] - x : 0;
              ctx.fillText(nx > 3 ? '\\' : nx < -3 ? '/' : '|', x, y);
            }
          };
          drawSeg(bolt.main, 15);
          bolt.branches.forEach(b => drawSeg(b, 12));
        } else bolt = null;
      }
    }

    pageOn(document, 'ascii:thunder', () => { nextBolt = performance.now() / 1000; frenzyUntil = performance.now() / 1000 + 2.5; });
    resize();
    frame(0);
    canvas._frame = frame; frame.__canvas = canvas;
    frame.__every = 1000 / 30;   // rain reads as streaks at 30 fps and as hops at 15
    canvas._onScreen = true;
    if (!reduced) seen.observe(canvas);
    pageCanvases.push(canvas);
    // resizing resets the canvas; redraw so a still (reduced-motion) scene is not left blank
    pageOn(window, 'resize', () => { resize(); frame(performance.now() / 1000); });
  }

  // ── flock: a murmuration of glyph birds ──────────────────────────
  // Boids with separation, alignment and cohesion, a little wander and a
  // soft pull toward the middle so the flock stays in frame. Each bird is
  // a wing glyph that beats v - ^ and turns with its heading; far birds
  // are smaller and fainter. A passing wave scatters them.
  function flock(canvas) {
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, lastT = 0;
    const N = 72, birds = [];
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      birds.push({ x: 0, y: 0, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, phase: Math.random() * 7, depth: 0.5 + Math.random() * 0.5, hot: i % 11 === 0 });
    }
    function resize() {
      W = canvas.clientWidth; H = canvas.clientHeight;
      if (!W || !H) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const b of birds) if (!b.x) { b.x = W * (0.5 + Math.random() * 0.4); b.y = H * (0.25 + Math.random() * 0.5); }
    }
    let box = null;
    const boxNow = () => box || (box = { left: canvas.getBoundingClientRect().left + window.scrollX, top: canvas.getBoundingClientRect().top + window.scrollY });   // the layout, read once per frame, in page coordinates
    const QA = Math.PI / 12;                                              // heading step for drawing
    function step(t, dt) {
      box = null;
      for (const b of birds) {
        let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, na = 0, nc = 0;
        for (const o of birds) {
          if (o === b) continue;
          const dx = o.x - b.x, dy = o.y - b.y, d2 = dx * dx + dy * dy;
          if (d2 < 14 * 14) { sx -= dx / (d2 + 1) * 40; sy -= dy / (d2 + 1) * 40; }
          if (d2 < 60 * 60) { ax += o.vx; ay += o.vy; na++; }
          if (d2 < 110 * 110) { cx += o.x; cy += o.y; nc++; }
        }
        let fx = sx * 140, fy = sy * 140;
        if (na) { fx += (ax / na - b.vx) * 2.2; fy += (ay / na - b.vy) * 2.2; }
        if (nc) { fx += (cx / nc - b.x) * 1.6; fy += (cy / nc - b.y) * 1.6; }
        // stay in frame, around an anchor that roams the width so the flock cruises
        // the anchor favours the right side and now and then sweeps across the left
        const tx = W * (0.62 + 0.3 * Math.sin(t * 0.09)), ty = H * (0.5 + 0.16 * Math.sin(t * 0.13 + 1.7));
        fx += (tx - b.x) * 0.35; fy += (ty - b.y) * 0.5;
        // soft walls: turn back before leaving the region
        if (b.x < 40) fx += (40 - b.x) * 8; else if (b.x > W - 40) fx -= (b.x - W + 40) * 8;
        if (b.y < 30) fy += (30 - b.y) * 8; else if (b.y > H - 30) fy -= (b.y - H + 30) * 8;
        fx += (noise(b.x * 0.01, b.y * 0.01, t * 0.5 + b.phase) - 0.5) * 260;      // wander
        fy += (noise(b.y * 0.01 + 7, b.x * 0.01, t * 0.5 + b.phase) - 0.5) * 260;
        // a wave front passing through scatters them
        for (const rp of ripples) {
          const age = t - rp.born; if (age < 0 || age > rp.life) continue;
          const box = boxNow();
          const dx = box.left + b.x - rp.px, dy = box.top + b.y - rp.py, d = Math.hypot(dx, dy) || 1;
          const Rt = frontR(rp, Math.atan2(dy, dx), age);
          if (Math.abs(d - Rt) < 60) { fx += dx / d * 900 * (0.5 + rp.k); fy += dy / d * 900 * (0.5 + rp.k); }
        }
        b.vx += fx * dt; b.vy += fy * dt;
        const sp = Math.hypot(b.vx, b.vy), lo = 45, hi = 120;
        if (sp > hi) { b.vx *= hi / sp; b.vy *= hi / sp; } else if (sp < lo && sp > 0) { b.vx *= lo / sp; b.vy *= lo / sp; }
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.x < -12) b.x = W + 12; else if (b.x > W + 12) b.x = -12;
        if (b.y < -12) b.y = H + 12; else if (b.y > H + 12) b.y = -12;
        b.phase += dt * (7 + sp * 0.06);
      }
    }
    function frame(t) {
      if (!W) resize();
      const dt = lastT ? Math.min(t - lastT, 0.2) : 0; lastT = t;
      if (dt) step(t, dt);
      ctx.clearRect(0, 0, W, H);
      // far birds first
      const order = birds.slice().sort((a, b) => a.depth - b.depth);
      for (const b of order) {
        const f = Math.sin(b.phase);
        const wing = f > 0.4 ? 'v' : f > -0.4 ? '~' : '^';
        ctx.save();
        ctx.translate(b.x, b.y);
        // heading snapped to 15 degrees and size to whole pixels: every distinct
        // rotation of a glyph is a new entry in the browser's glyph cache, and
        // continuous angles at 30 fps filled it until it purged with a long hitch
        ctx.rotate(Math.round((Math.atan2(b.vy, b.vx) + Math.PI / 2) / QA) * QA);
        ctx.font = '700 ' + Math.round(7 + b.depth * 7) + 'px ' + MONO;
        ctx.fillStyle = rgba(b.hot ? C.clay : C.navy, 0.35 + b.depth * 0.6);
        ctx.fillText(wing, 0, 0);
        ctx.restore();
      }
    }
    resize();
    frame(0);
    canvas._frame = frame; frame.__canvas = canvas;
    frame.__every = 1000 / 30;   // birds move fast enough that 15 fps reads as stutter
    canvas._onScreen = true;
    if (!reduced) seen.observe(canvas);
    pageCanvases.push(canvas);
    pageOn(window, 'resize', () => { resize(); frame(performance.now() / 1000); });
  }

  // ── attractor: the Lorenz butterfly in glyphs, with moths ─────────
  // The trajectory is integrated live and its last ~1800 points are drawn
  // as a trail: faint and far at the tail, dense and clay at the head,
  // the whole thing slowly turning. A few moths chase the head as if it
  // were a lamp, flutter about it and never quite catch it.
  function attractor(canvas) {
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, lastT = 0;
    const SIG = 10, RHO = 28, BET = 8 / 3, DT = 0.004, N = 3200;
    let x = 0.1, y = 0, z = 0;
    const pts = new Float32Array(N * 3);
    let head = 0, filled = 0;
    function step(n) {
      for (let i = 0; i < n; i++) {
        const dx = SIG * (y - x), dy = x * (RHO - z) - y, dz = x * y - BET * z;
        x += dx * DT; y += dy * DT; z += dz * DT;
        pts[head * 3] = x; pts[head * 3 + 1] = y; pts[head * 3 + 2] = z;
        head = (head + 1) % N; if (filled < N) filled++;
      }
    }
    // warm up off-screen so the opening frame is already on the butterfly
    // (the first few thousand steps from the origin are a thin spiral)
    step(6000); filled = 0; head = 0;
    step(N);
    // Moths. Each one cruises to a spot it has taken an interest in (usually
    // the bright head of the trajectory, sometimes a point along the trail),
    // hovers there inspecting it with quick little flaps, then picks a new
    // spot. Wings beat through open / half / closed frames, faster while
    // hovering, and the body turns into the direction of flight.
    const moths = [];
    for (let i = 0; i < 5; i++) moths.push({ x: 0, y: 0, vx: 0, vy: 0, phase: Math.random() * 7, hot: i === 0, seed: i * 3.1, state: 'cruise', follow: true, tx: 0, ty: 0, until: 0, heading: 0 });
    function pickTarget(m, t) {
      m.follow = Math.random() < 0.6;
      if (!m.follow) {
        const k = Math.floor(Math.random() * filled), i = (head - filled + k + N) % N;
        const [px, py] = project(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2], t);
        m.tx = px + (Math.random() - 0.5) * 30; m.ty = py + (Math.random() - 0.5) * 30;
      }
      m.state = 'cruise'; m.until = t + 2.5 + Math.random() * 2.5;
    }
    function moveMoth(m, t, dt, lx, ly) {
      if (m.follow) { m.tx = lx + Math.cos(t * 2.6 + m.seed) * 20; m.ty = ly + Math.sin(t * 2.1 + m.seed) * 20; }
      const dx = m.tx - m.x, dy = m.ty - m.y, d = Math.hypot(dx, dy) || 1;
      if (m.state === 'cruise') {
        m.vx += (dx / d * 420 + (noise(m.x * 0.02, m.y * 0.02, t * 1.5 + m.seed) - 0.5) * 700) * dt;
        m.vy += (dy / d * 420 + (noise(m.y * 0.02 + 5, m.x * 0.02, t * 1.5 + m.seed) - 0.5) * 700) * dt;
        const sp = Math.hypot(m.vx, m.vy), cap = 170;
        if (sp > cap) { m.vx *= cap / sp; m.vy *= cap / sp; }
        if (d < 16 || t > m.until) { m.state = 'hover'; m.until = t + 0.7 + Math.random() * 1.6; }
      } else {
        // hover: held near the spot by a soft spring, jittering, speed bleeding off
        m.vx += (dx * 9 + (noise(t * 4, m.seed, 0) - 0.5) * 900) * dt;
        m.vy += (dy * 9 + (noise(m.seed, t * 4, 0) - 0.5) * 900) * dt;
        m.vx *= Math.pow(0.08, dt); m.vy *= Math.pow(0.08, dt);
        if (t > m.until) pickTarget(m, t);
      }
      m.x += m.vx * dt; m.y += m.vy * dt;
      if (m.x < 8) { m.x = 8; m.vx = Math.abs(m.vx); } if (m.x > W - 8) { m.x = W - 8; m.vx = -Math.abs(m.vx); }
      if (m.y < 8) { m.y = 8; m.vy = Math.abs(m.vy); } if (m.y > H - 8) { m.y = H - 8; m.vy = -Math.abs(m.vy); }
      // the body turns toward the flight direction while cruising; hovering it sits upright and wobbles
      const want = m.state === 'cruise' && Math.hypot(m.vx, m.vy) > 30 ? Math.atan2(m.vy, m.vx) + Math.PI / 2 : (noise(t * 2, m.seed + 9, 0) - 0.5) * 0.8;
      let diff = want - m.heading; while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
      m.heading += diff * Math.min(1, dt * 8);
      m.phase += dt * (m.state === 'hover' ? 34 : 20);
    }
    function drawMoth(m) {
      // one beat: open -> half -> closed -> half; wings also narrow as they fold
      const f = Math.sin(m.phase);
      const wings = f > 0.45 ? '}{' : f > -0.45 ? ')(' : '||';
      ctx.save();
      ctx.translate(m.x, m.y);
      // heading and wing width stepped, so rotated glyphs repeat and stay cached
      ctx.rotate(Math.round(m.heading / (Math.PI / 12)) * (Math.PI / 12));
      ctx.scale(0.72 + 0.07 * Math.round(4 * (f + 1) / 2), 1);
      ctx.font = '700 11px ' + MONO;
      ctx.fillStyle = rgba(m.hot ? C.clay : C.navy, 0.9);
      ctx.fillText(wings, 0, 0);
      ctx.fillStyle = rgba(m.hot ? C.clay : C.navy, 0.6);
      ctx.font = '700 7px ' + MONO;
      ctx.fillText('·', 0, -7);                       // the head
      ctx.restore();
    }
    function resize() {
      W = canvas.clientWidth; H = canvas.clientHeight;
      if (!W || !H) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const m of moths) if (!m.x) { m.x = W * (0.2 + Math.random() * 0.6); m.y = H * (0.2 + Math.random() * 0.6); }
    }
    // sway about the vertical axis, never far from the classic x-z view
    // (seen edge-on the butterfly collapses to a band); depth is the rotated y
    function project(px, py, pz, t) {
      const a = 0.2 * Math.sin(t * 0.1), c = Math.cos(a), sn = Math.sin(a);     // ~12 degrees either way
      const rx = px * c - py * sn, depth = px * sn + py * c;
      const sc = Math.min(W, H) / 55;
      return [W * 0.5 + rx * sc, H * 0.52 - (pz - 26) * sc, depth];
    }
    // Trail points snap to a 6 px grid and most cells collect several of them.
    // Each cell is drawn once, as its newest point, at the opacity the stacked
    // draws would have added up to: a third of the glyph draws for the same
    // picture. Sizes are whole pixels and the font is set only when it changes.
    let lastK = new Int32Array(0), rem = new Float32Array(0);
    const KC = new Int32Array(N), KN = new Float32Array(N);
    function frame(t) {
      if (!W) resize();
      const dt = lastT ? Math.min(t - lastT, 0.2) : 0; lastT = t;
      if (dt) step(Math.max(1, Math.round(dt * 220)));
      ctx.clearRect(0, 0, W, H);
      const cell = 6, gw = Math.ceil(W / cell) + 1, gh = Math.ceil(H / cell) + 1;
      if (lastK.length !== gw * gh) { lastK = new Int32Array(gw * gh); rem = new Float32Array(gw * gh); }
      lastK.fill(-1); rem.fill(1);
      const a0 = 0.2 * Math.sin(t * 0.1), ca = Math.cos(a0), sa = Math.sin(a0), sc = Math.min(W, H) / 55;
      // which point owns each cell, and what the stacked opacity comes to
      for (let k = 0; k < filled; k += 2) {
        const i = (head - filled + k + N) % N;
        const px = pts[i * 3], py = pts[i * 3 + 1], pz = pts[i * 3 + 2];
        const rx = px * ca - py * sa, depth = px * sa + py * ca;
        const cx = Math.round((W * 0.5 + rx * sc) / cell), cy = Math.round((H * 0.52 - (pz - 26) * sc) / cell);
        if (cx < 0 || cy < 0 || cx >= gw || cy >= gh) { KC[k] = -1; continue; }
        const g = cy * gw + cx, age = k / filled, near = clamp01(0.5 + depth / 50);
        KC[k] = g; KN[k] = near;
        lastK[g] = k; rem[g] *= 1 - (0.3 + age * 0.6) * (0.55 + near * 0.45);
      }
      // the trail, oldest first so the head draws on top
      let curFont = '';
      for (let k = 0; k < filled; k += 2) {
        const g = KC[k];
        if (g < 0 || lastK[g] !== k) continue;
        const age = k / filled, near = KN[k];                     // 0 tail .. 1 head; 0 far .. 1 near
        const col = mix(mix(C.navy, C.midblue, 1 - near), C.clay, Math.pow(age, 7));   // clay only near the head
        ctx.fillStyle = rgba(col, 1 - rem[g]);
        const f = '600 ' + Math.round(6 + near * 2 + age * 3) + 'px ' + MONO;
        if (f !== curFont) ctx.font = curFont = f;
        const ch = age > 0.97 ? '@' : age > 0.85 ? (near > 0.5 ? '#' : '*') : age > 0.5 ? (near > 0.5 ? '+' : '·') : (near > 0.5 ? ':' : '.');
        ctx.fillText(ch, (g % gw) * cell, Math.floor(g / gw) * cell);
      }
      // the lamp: the head of the trajectory
      const hi = (head - 1 + N) % N;
      const [lx, ly] = project(pts[hi * 3], pts[hi * 3 + 1], pts[hi * 3 + 2], t);
      ctx.fillStyle = rgba(C.clay, 1); ctx.font = '700 13px ' + MONO; ctx.fillText('@', lx, ly);
      // moths
      for (const m of moths) { if (dt) moveMoth(m, t, dt, lx, ly); drawMoth(m); }
    }
    resize();
    frame(0);
    canvas._frame = frame; frame.__canvas = canvas;
    canvas._onScreen = true;
    if (!reduced) seen.observe(canvas);
    pageCanvases.push(canvas);
    pageOn(window, 'resize', () => { resize(); frame(performance.now() / 1000); });
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
    // The field, sampled at every cell corner. The noise drifts about a third
    // of a pixel per frame, so each frame refreshes only every fourth row and
    // nobody can tell; waves and the shade sample read it bilinearly.
    let D = null, Dc = 0, Dr = 0, phase = -1, lastPaint = -1;
    function refresh(t, cols, rows) {
      const all = phase < 0; phase = (phase + 1) & 1;
      for (let r = 0; r < Dr; r++) {
        if (!all && (r & 1) !== phase) continue;
        const v = r / rows, row = r * Dc;
        for (let c = 0; c < Dc; c++) D[row + c] = density(c / cols, v, t);
      }
    }
    function sample(u, v) {
      let x = u * (Dc - 1), y = v * (Dr - 1);
      if (x < 0) x = 0; else if (x > Dc - 1) x = Dc - 1;
      if (y < 0) y = 0; else if (y > Dr - 1) y = Dr - 1;
      const x0 = x | 0, y0 = y | 0, x1 = x0 < Dc - 1 ? x0 + 1 : x0, y1 = y0 < Dr - 1 ? y0 + 1 : y0, fx = x - x0, fy = y - y0;
      return (D[y0 * Dc + x0] * (1 - fx) + D[y0 * Dc + x1] * fx) * (1 - fy) + (D[y1 * Dc + x0] * (1 - fx) + D[y1 * Dc + x1] * fx) * fy;
    }
    // where a wave front is crossing the cloud, the field is pushed outward
    // along the ring and thinned a little, so the billows bulge away from it
    let wu = 0, wv = 0, wthin = 1;
    function waved(u, v, t) {
      wu = u; wv = v; wthin = 1;
      if (!ripples.length && !(window.__rays && window.__rays.length)) return false;
      if (t !== boxT) { boxT = t; const r = canvas.getBoundingClientRect(); box = { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height, sx: window.scrollX, sy: window.scrollY }; }
      const X = box.x + u * box.w, Y = box.y + v * box.h;
      let du = 0, dv = 0, thin = 1;
      for (const r of (window.__rays || [])) {
        const dx = X - (r.x + box.sx), dy = Y - (r.y + box.sy), dd = Math.hypot(dx, dy) || 1;
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
      wu = u + du; wv = v + dv; wthin = thin;
      return du !== 0 || dv !== 0;
    }
    let blast = 1;
    makeGrid(canvas, 7, (u0, v0, t, c, r) => {
      const moved = waved(u0, v0, t);
      const d = (moved ? sample(wu, wv) : D[r * Dc + c]) * wthin * blast;
      if (d <= 0.02) return null;
      const u = wu, v = wv;
      // light from the upper left: a cell is in shadow where density rises toward the light
      const shade = clamp01(0.5 + (sample(u - 0.014, v - 0.02) - d) * 7) * d;
      // lit tops stay almost empty amber; shaded undersides are dense sage, deepest to navy
      let col = mix(mix(C.amber, IVORY, 0.4), C.sage, clamp01(shade * 1.6));
      col = mix(col, C.navy, clamp01(shade - 0.45) * 0.9);
      const edge = clamp01(u0 / 0.38) * clamp01((1 - v0) / 0.1) * clamp01(v0 / 0.08);
      const lum = (0.06 + d * 0.2 + shade * 0.9) * edge;
      return [lum, rgba(col, (0.2 + d * 0.3 + shade * 0.5) * edge)];
    }, (t, cols, rows) => {
      let sized = false;
      if (Dc !== cols + 1 || Dr !== rows + 1) { Dc = cols + 1; Dr = rows + 1; D = new Float32Array(Dc * Dr); phase = -1; sized = true; }
      const stirred = ripples.length > 0 || (window.__rays && window.__rays.length > 0) || t - blastAt < 6;
      // the field drifts a third of a pixel a frame: between waves every other frame is kept as it is
      if (!sized && !stirred && t - lastPaint < 0.12) return true;
      lastPaint = t;
      refresh(t, cols, rows);
      blast = 1 - 0.92 * Math.exp(-Math.max(0, t - blastAt) * 0.9);   // thinned by the thunder, growing back
      return false;
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
    // sample it in idle time once the image is in, so first contact costs nothing
    const warm = () => { if (grid) return; (window.requestIdleCallback || setTimeout)(() => { if (!grid) build(); }); };
    if (img.complete && img.naturalWidth) warm(); else img.addEventListener('load', warm, { once: true });
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
    const LIFE = 15;                      // seconds a thrown glyph, or a struck dot turned glyph, stays
    function spawn(x, y) {
      const isGlyph = Math.random() < 0.5;
      return {
        x, y, isGlyph, vx: 0, vy: 0, flash: 0, boost: 0, lastHit: -9, launched: false,
        born: performance.now() / 1000, revertAt: 0,
        ch: SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0],
        size: isGlyph ? 10 + Math.random() * 5 : 1 + Math.random() * 1.4,
        base: (isGlyph ? 0.16 + Math.random() * 0.16 : 0.18 + Math.random() * 0.2) * 0.8,
        phase: Math.random() * Math.PI * 2,
        col: Math.random() < 0.75 ? C.navy : [C.clay, C.midblue, C.sage, C.amber][(Math.random() * 4) | 0]
      };
    }
    // a slowly turning flow: the direction at a point is a sum of long waves
    function angle(x, y, t) {
      return Math.sin(x * 0.0035 + t * 0.08) * 1.4 + Math.cos(y * 0.003 - t * 0.06) * 1.4 + Math.sin((x + y) * 0.0015 + t * 0.04);
    }
    // The scroll position, read once at the top of each frame (and when a ray
    // is launched from a timer). Reading it again after a glitch run has
    // swapped its text node forces the browser to lay the page out there and
    // then, and a super wave swaps hundreds of runs a frame.
    let SX = 0, SY = 0;
    const snapScroll = () => { SX = window.scrollX || 0; SY = window.scrollY || 0; };
    const shift = () => SY * 0.06;

    // Keeps the field from growing without bound: once it is a batch over its
    // cap the oldest thrown glyphs are retired in one pass (a super wave sheds
    // hundreds a frame, and retiring one at a time was a scan per shed).
    function trimDebris(cap) {
      if (parts.length <= cap + 40) return;
      let drop = parts.length - cap, k = 0;
      for (let i = 0; i < parts.length; i++) {
        const q = parts[i];
        if (drop > 0 && q.launched) { drop--; continue; }
        parts[k++] = q;
      }
      parts.length = k;
    }
    document.addEventListener('ascii:launch', (e) => {
      const d = e.detail;
      const p = spawn(d.x, d.y + SY);
      p.isGlyph = true; p.ch = d.ch || p.ch; p.size = 12; p.base = 0.3; p.boost = 1; p.launched = true; p.page = true;
      p.vx = d.vx; p.vy = d.vy;
      p.col = d.color && d.color[0] === '#' ? hex(d.color) : C.navy;
      parts.push(p);
      trimDebris(want + 60);
    });

    // a particle's on-screen y (page-space debris scrolls; ambient ones parallax),
    // worked out once per frame into p.sy for the collision, front and ray tests
    function placeAll() {
      const sh = shift(), hh = h + 20;
      for (const p of parts) p.sy = p.page ? p.y - SY : ((p.y - sh) % hh + hh) % hh - 10;
    }

    // ── ripples: press to charge, release to send a ring out through the
    // field. The ring is a thick front; every letter it is passing over
    // flips to a glyph (a few in colour) and heals once it has gone by, and
    // the band of the photo under it turns to ASCII. How long you hold sets
    // how big, fast, thick and disruptive the wave is. ──
    const TINTS = ['#C8623A', '#DE934D', '#5E84B9', '#5B7F6E', '#CD8F7C', '#1B2A41'];
    let charge = null, textNodes = null;
    document.addEventListener('ascii:textchanged', () => { textNodes = null; scheduleWarm(); });
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
    // Measuring every run of the page is the slow part of starting a wave or a
    // ray (tens of ms on a long post), so positions are kept on the run and
    // dropped whenever the layout can have moved: a resize, fonts or images
    // arriving, anything that changes the page's size, or text changing.
    const posOf = (w) => w.pos || (w.pos = charPositions(w));
    // a few milliseconds of idle time at a go, until every run is measured
    let warmId = 0;
    function warm(deadline) {
      warmId = 0;
      if (reduced) return;
      if (!textNodes) collectText();
      const end = performance.now() + (deadline && deadline.timeRemaining ? Math.min(6, deadline.timeRemaining()) : 4);
      let i = 0;
      for (; i < textNodes.length; i++) {
        const w = textNodes[i];
        if (w.pos || !w.node.parentNode) continue;
        posOf(w);
        if (performance.now() > end) { i++; break; }
      }
      if (i < textNodes.length) scheduleWarm();
    }
    function scheduleWarm() {
      if (warmId) return;
      warmId = window.requestIdleCallback ? requestIdleCallback(warm, { timeout: 2000 }) : setTimeout(warm, 300);
    }
    const dropPositions = () => { if (textNodes) for (const w of textNodes) w.pos = null; scheduleWarm(); };
    window.addEventListener('resize', dropPositions);
    window.addEventListener('load', dropPositions);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(dropPositions);
    if (window.ResizeObserver) new ResizeObserver(dropPositions).observe(document.body);
    const SUPER_HOLD = 2.25;                    // seconds of holding for the super wave
    // content the super front crosses sheds into the background field: a glyph
    // (or a coloured cell of the photo) that flies on outward with the wave
    function shed(x, y, rp, ch, color) {
      const dx = x - rp.px, dy = y - rp.py, d = Math.hypot(dx, dy) || 1;
      const sp = 220 + Math.random() * 180;
      const p = spawn(x - SX, y);                                   // y in page space
      p.isGlyph = true; p.ch = ch; p.size = 11; p.base = 0.3; p.boost = 1; p.launched = true; p.flash = 0.8; p.page = true;
      p.vx = dx / d * sp + (Math.random() - 0.5) * 60; p.vy = dy / d * sp + (Math.random() - 0.5) * 60;
      p.col = color || C.navy;
      parts.push(p);
      trimDebris(want + 160);
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
        const pos = posOf(w);
        if (!pos) continue;
        let dmin = Infinity, dmax = 0;
        const dist = pos.map(([x, y]) => { const d = Math.hypot(x - px, y - py); if (d < dmin) dmin = d; if (d > dmax) dmax = d; return d; });
        if (dmin > reach * 1.3) continue;
        const ang = pos.map(([x, y]) => Math.atan2(y - py, x - px));
        rp.near.push({ w, pos, dist, ang, roll: w.chars.map(() => Math.random()), dmin, dmax, hit: false });
      }
      ripples.push(rp);
    }
    // Is the pointer actually on glyphs (or on something clickable)? A press
    // on blank paper is a wave, so the browser must not start a text
    // selection from it; a press on text is left alone so it still selects.
    function overText(x, y) {
      const el = document.elementFromPoint(x, y);
      if (!el) return false;
      if (el.closest('a, button, input, textarea, select, label, [contenteditable], pre, code, .flux, .sidebar-email, img, video')) return true;
      const r = document.createRange();
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 0;
      for (const n of el.childNodes) {
        if (n.nodeType !== 3 || !n.nodeValue.trim()) continue;
        r.selectNodeContents(n);
        for (const b of r.getClientRects()) {
          const pad = Math.max(0, (lh - b.height) / 2);   // the leading between two lines still counts as text
          if (x >= b.left - 2 && x <= b.right + 2 && y >= b.top - pad && y <= b.bottom + pad) return true;
        }
      }
      return false;
    }
    let blankPress = false;
    document.addEventListener('pointerdown', (e) => {
      if (reduced || e.button > 0) return;
      blankPress = !overText(e.clientX, e.clientY);
      if (blankPress && e.pointerType === 'mouse') e.preventDefault();   // no selection drag from blank paper
      charge = { px: e.clientX + window.scrollX, py: e.clientY + window.scrollY, start: performance.now() / 1000 };
    });
    document.addEventListener('selectstart', (e) => { if (blankPress && charge) e.preventDefault(); });
    const release = () => {
      if (!charge) return;
      const now = performance.now() / 1000;
      const held = now - charge.start;
      const k = Math.max(0.1, clamp01(held / 0.55));
      if (charge.near) { for (const e of charge.near) healRun(e); charge.near = null; }
      if (charge.images) clearImageSet(charge.images);
      if (charge.thumbs) thumbClear(charge.thumbs);
      if (held >= SUPER_HOLD) {
        // the super wave: three fronts, a thunderclap, and the rest of the page hears it
        startRipple(charge.px, charge.py, now, k, true);
        startRipple(charge.px, charge.py, now + 0.14, k, true);
        startRipple(charge.px, charge.py, now + 0.28, k, true);
        document.dispatchEvent(new CustomEvent('ascii:thunder', { detail: { x: charge.px, y: charge.py } }));
        shatter = { start: now, px: charge.px, py: charge.py, hit: new Map() };
        burst = { marks: trackTargets(), start: now, until: now + 3.5 };   // the debris it throws leaves tracks on photos
        // every thumbnail goes ASCII for a couple of seconds
        document.querySelectorAll('.feat-card-link').forEach(card => { card.dispatchEvent(new Event('mouseenter')); setTimeout(() => card.classList.remove('ascii-on'), 2200 + Math.random() * 800); });
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
      const x = e.clientX + window.scrollX, y = e.clientY + window.scrollY;
      if (blankPress) { charge.tx = x; charge.ty = y; return; }   // the ball rides along with the pointer
      if (Math.hypot(x - charge.px, y - charge.py) > 12) dropCharge();   // a drag on text is a selection
    });
    document.addEventListener('selectionchange', () => {
      const sel = window.getSelection();
      if (charge && !blankPress && sel && !sel.isCollapsed) dropCharge();
    });

    // The profile photo: inside the band the ring is crossing, the photo turns
    // to ASCII the way the reveal renders it (dark cells, colour-sampled
    // glyphs), sampling through a lens that pushes outward then pulls back
    // along the radius, tinted warm at the leading edge and cool at the
    // trailing edge. Nothing is drawn outside the band.
    const PN = 256, PAD = 0.14;                 // photo grid size; the ripple canvas overhangs the photo by PAD
    const PC = Math.round(PN * (1 + 2 * PAD));   // ripple canvas size
    let photoPix = null, photoCanvas = null, shatter = null;
    const PAPER = [246, 246, 244];
    const idle = (fn) => (window.requestIdleCallback || setTimeout)(fn);
    function photoTarget() {
      const link = document.querySelector('.ascii-photo-link');
      const wrap = link && link.querySelector('.ascii-photo-wrap');
      const img = wrap && wrap.querySelector('.ascii-photo');
      if (!img || !img.naturalWidth) return null;
      if (!photoCanvas) {
        photoCanvas = document.createElement('canvas');
        photoCanvas.className = 'ascii-photo-ripple';
        photoCanvas.width = photoCanvas.height = PC;
        link.appendChild(photoCanvas);              // outside the photo's clip, so the edge can be bent
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
    {
      const img = document.querySelector('.ascii-photo-link .ascii-photo');
      const warmPhoto = () => idle(() => { if (!photoCanvas) photoTarget(); });
      if (img) { if (img.complete && img.naturalWidth) warmPhoto(); else img.addEventListener('load', warmPhoto, { once: true }); }
    }
    // Images in posts get the same treatment as the photo: a canvas laid over
    // each (inside the post body) carries the band of ASCII tiles the wave
    // is crossing. Pixels are sampled once per image; images the browser
    // will not let us read (hot-linked) are skipped.
    const imgCache = new WeakMap();
    function sampleImage(body, img) {
      let c = imgCache.get(img);
      if (c) return c;
      const r = img.getBoundingClientRect();
      if (!r.width) return null;
      const w = Math.round(r.width), h = Math.round(r.height);
      const off = document.createElement('canvas');
      off.width = w; off.height = h;
      const o = off.getContext('2d', { willReadFrequently: true });
      o.drawImage(img, 0, 0, w, h);
      let pix = null;
      try { pix = o.getImageData(0, 0, w, h).data; } catch (_) { c = { bad: true }; imgCache.set(img, c); return c; }
      const cv = document.createElement('canvas');
      cv.className = 'ascii-img-ripple';
      cv.width = w; cv.height = h;
      body.appendChild(cv);
      c = { pix, w, h, canvas: cv, linger: new Map() };
      imgCache.set(img, c);
      return c;
    }
    function warmImages() {
      const body = document.querySelector('.post-body');
      if (!body || reduced) return;
      body.querySelectorAll('img').forEach(img => {
        const go = () => idle(() => { if (img.isConnected && img.naturalWidth && !imgCache.has(img)) sampleImage(body, img); });
        if (img.complete && img.naturalWidth) go(); else img.addEventListener('load', go, { once: true });
      });
    }
    warmImages();
    document.addEventListener('ascii:page-enter', warmImages);
    function imageTargets() {
      const body = document.querySelector('.post-body');
      if (!body) return [];
      const bodyRect = body.getBoundingClientRect();
      const list = [];
      body.querySelectorAll('img').forEach(img => {
        if (!img.complete || !img.naturalWidth) return;
        const r = img.getBoundingClientRect();
        if (!r.width) return;
        const c = sampleImage(body, img);
        if (!c || c.bad) return;
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
      // only the cells the band and its falloff can reach: a box of cells, then a radial test
      const Rmax = R * 1.1 + rp.thick * 2.8, Rmin = Math.max(0, R * 0.9 - rp.thick * 2.8);
      const q0 = Math.max(0, Math.floor((rp.px - Rmax - tg.x) * tg.sx / cell)), q1 = Math.min(cols - 1, Math.ceil((rp.px + Rmax - tg.x) * tg.sx / cell));
      const r0 = Math.max(0, Math.floor((rp.py - Rmax - tg.y) * tg.sy / cell)), r1 = Math.min(rows - 1, Math.ceil((rp.py + Rmax - tg.y) * tg.sy / cell));
      for (let r = r0; r <= r1; r++) for (let q = q0; q <= q1; q++) {
        const x = (q + 0.5) * cell, y = (r + 0.5) * cell;               // canvas px (scale ~1)
        const X = tg.x + x / tg.sx, Y = tg.y + y / tg.sy;               // page px
        const dx = X - rp.px, dy = Y - rp.py, d = Math.hypot(dx, dy) || 1;
        if (d > Rmax || d < Rmin) continue;
        const Rt = frontR(rp, Math.atan2(dy, dx), age);
        const T = rp.thick * (0.6 + 0.8 * hash(q, r, 5)) * (0.4 + 0.6 * a);
        let ph, wgt;
        if (d <= Rt && d >= Rt - T) { ph = (d - (Rt - T)) / T; wgt = Math.min(1, Math.sin(ph * Math.PI) * 3); }
        else { const out = d > Rt ? d - Rt : (Rt - T) - d; wgt = clamp01(1 - out / (T * 0.9)); ph = d > Rt ? 1 : 0; }
        if (wgt <= 0.04 || hash(q, r, tick) < 0.05 + (1 - wgt) * 0.5 + (1 - a) * 0.4) continue;
        const bump = Math.sin(ph * Math.PI);
        const disp = amp * Math.sin(ph * Math.PI * 2);
        const sx = Math.round(x + dx / d * disp), sy = Math.round(y + dy / d * disp);
        const swap = hash(q, r, tick + 3) < 0.1;
        const tint = swap ? hexToRgb(TINTS[(hash(q, r, tick + 4) * TINTS.length) | 0]) : (ph > 0.5 ? C.amber : C.midblue);
        const px = tileAt(pc, c.pix, c.w, q, r, cell, sx, Math.min(c.h - 1, sy), tint, swap ? 0.8 : bump * 0.25 * a, false, wgt * Math.min(1, a * 1.4));
        if (rp.sup && wgt > 0.5) {
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
    function clearImageSet(list) { for (const tg of list) tg.c.canvas.getContext('2d').clearRect(0, 0, tg.c.w, tg.c.h); }
    function clearImages() { clearImageSet(imageList); }
    function imagePatch(tg, pxPage, pyPage, radiusPage, hot) {
      const { c } = tg, pc = c.canvas.getContext('2d'), cell = 6;
      const px = (pxPage - tg.x) * tg.sx, py = (pyPage - tg.y) * tg.sy, rad = radiusPage * tg.sx;
      if (px < -rad || py < -rad || px > c.w + rad || py > c.h + rad) return false;
      pc.setTransform(1, 0, 0, 1, 0, 0);
      pc.textAlign = 'center'; pc.textBaseline = 'middle';
      pc.font = '700 ' + (cell + 1) + 'px ' + MONO;
      for (let r = Math.floor((py - rad) / cell); r <= Math.ceil((py + rad) / cell); r++) for (let q = Math.floor((px - rad) / cell); q <= Math.ceil((px + rad) / cell); q++) {
        const x = (q + 0.5) * cell, y = (r + 0.5) * cell;
        if (x < 0 || y < 0 || x >= c.w || y >= c.h || Math.hypot(x - px, y - py) > rad) continue;
        tileAt(pc, c.pix, c.w, q, r, cell, Math.round(x), Math.min(c.h - 1, Math.round(y)), hot ? C.clay : null, hot ? 0.6 : 0, hot);
      }
      return true;
    }
    // a point hit on a project thumbnail flips it to ASCII for a moment
    function thumbHit(list, pxPage, pyPage, t) {
      for (const th of list) {
        if (pxPage >= th.x0 && pxPage <= th.x1 && pyPage >= th.y0 && pyPage <= th.y1) { th.card.dispatchEvent(new Event('mouseenter')); th.card._asciiUntil = t + 0.35; }
      }
    }
    function thumbCool(list, t) {
      for (const th of list) if (th.card._asciiUntil && t > th.card._asciiUntil) { th.card.classList.remove('ascii-on'); th.card._asciiUntil = 0; }
    }
    function thumbClear(list) {
      for (const th of list) { th.card.classList.remove('ascii-on'); th.card._asciiUntil = 0; th.on = false; }
    }
    // the thumbnails and where they are on the page, measured once when a wave, ray or charge is armed
    function thumbTargets() {
      const sx = window.scrollX, sy = window.scrollY;
      return Array.from(document.querySelectorAll('.feat-card-link')).map(card => {
        const r = card.querySelector('.feat-thumb').getBoundingClientRect();
        return { card, cx: r.left + sx + r.width / 2, cy: r.top + sy + r.height / 2, x0: r.left + sx, y0: r.top + sy, x1: r.right + sx, y1: r.bottom + sy, on: false };
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
      const cx = PC / 2, cy = PC / 2, rim = PN / 2;           // the photo's square: half its side
      const Rmax = R * scale * 1.1 + Tp * 2.8, Rmin = R * scale * 0.9 - Tp * 2.8;   // the band and its falloff
      for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
        const x = (c + 0.5) * cell, y = (r + 0.5) * cell;
        const dx = x - ox, dy = y - oy, d = Math.hypot(dx, dy) || 1;
        if (d > Rmax || d < Rmin) continue;
        const Rt = frontR(rp, Math.atan2(dy, dx), age) * scale;
        const T = Tp * (0.6 + 0.8 * hash(c, r, 5)) * (0.4 + 0.6 * a);   // ragged band, narrowing as the wave dies
        // the band is fully ASCII; a zone either side of it falls off gradually
        let ph, wgt;
        if (d <= Rt && d >= Rt - T) { ph = (d - (Rt - T)) / T; wgt = Math.min(1, Math.sin(ph * Math.PI) * 3); }
        else { const out = d > Rt ? d - Rt : (Rt - T) - d; wgt = clamp01(1 - out / (T * 0.9)); ph = d > Rt ? 1 : 0; }
        if (wgt <= 0.04 || hash(c, r, tick) < 0.05 + (1 - wgt) * 0.5 + (1 - a) * 0.4) continue;   // holes, more as it fades
        const bump = Math.sin(ph * Math.PI);
        const disp = amp * Math.sin(ph * Math.PI * 2);           // out then in: a lens
        // where the band crosses the rim, the rim bends: out with the lens, plus a ragged tear
        const ex = x - cx, ey = y - cy, er = Math.max(Math.abs(ex), Math.abs(ey));
        const tear = (hash(Math.round(Math.atan2(ey, ex) * 6), 43, tick) - 0.5) * 10 * a;
        const rimHere = rim + bump * (disp * 1.2 + tear) * (0.5 + rp.k);
        if (er > rimHere) continue;                              // outside the bent rim: nothing
        if (rp.sup && er <= rim - 2 && wgt > 0.5 && !rp.lingerCells.has(r * 1000 + c)) {
          rp.lingerCells.set(r * 1000 + c, hash(c, r, 71) < 0.1 ? age + rp.born + 0.6 + hash(c, r, 73) * 2.6 : 0);
          if (hash(c, r, 77) < 0.05) {
            const si0 = (Math.max(0, Math.min(PN - 1, Math.round(y - o))) * PN + Math.max(0, Math.min(PN - 1, Math.round(x - o)))) * 4;
            shed(rp.photo.x + (x - o) / scale, rp.photo.y + (y - o) / scale, rp, rampChar(1 - (0.299 * photoPix[si0] + 0.587 * photoPix[si0 + 1] + 0.114 * photoPix[si0 + 2]) / 255), [photoPix[si0], photoPix[si0 + 1], photoPix[si0 + 2]]);
          }
        }
        const alpha = wgt * Math.min(1, a * 1.4);
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
        const ex = x - cx, ey = y - cy, er = Math.max(Math.abs(ex), Math.abs(ey));
        if (er > rim || er < rim - 14) continue;
        const dx = x - ox, dy = y - oy, d = Math.hypot(dx, dy) || 1;
        if (d > R * scale * 1.1 || d < R * scale * 0.9 - Tp) continue;
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
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) > rim + 4 || Math.hypot(x - px, y - py) > rad) continue;
        const sx = Math.max(0, Math.min(PN - 1, Math.round(x - o))), sy = Math.max(0, Math.min(PN - 1, Math.round(y - o)));
        const si = (sy * PN + sx) * 4, pr = photoPix[si], pg = photoPix[si + 1], pb = photoPix[si + 2];
        const lum = (0.299 * pr + 0.587 * pg + 0.114 * pb) / 255;
        pc.fillStyle = rgba([pr * 0.18 + 12, pg * 0.18 + 16, pb * 0.18 + 28], 0.9);
        pc.fillRect(c * cell, r * cell, cell, cell);
        pc.fillStyle = hot ? rgba(C.clay, 0.95) : rgba([lum * 255 + (pr - lum * 255) * 1.3, lum * 255 + (pg - lum * 255) * 1.3, lum * 255 + (pb - lum * 255) * 1.3].map(v => Math.max(0, Math.min(255, v))), 0.95);
        pc.fillText(rampChar(lum), x, y);
      }
    }
    // what the orb and its particles can hit: letters within reach, the photo,
    // images and project thumbnails. Called every frame; it only does work the
    // first time and again after the orb has been dragged a long way.
    function armNear() {
      if (!textNodes) collectText();
      if (!charge.near) {
        charge.near = [];
        charge.photo = photoTarget();
        charge.images = imageTargets();
        charge.thumbs = thumbTargets();
      } else if (Math.hypot(charge.px - charge.nearX, charge.py - charge.nearY) < 500) return;
      charge.nearX = charge.px; charge.nearY = charge.py;
      const have = new Set(charge.near.map(en => en.w));
      for (const w of textNodes) {
        if (have.has(w) || !w.node.parentNode) continue;
        const pos = posOf(w);
        if (!pos) continue;
        let close = false;
        for (const [x, y] of pos) if (Math.hypot(x - charge.px, y - charge.py) < 1200) { close = true; break; }
        if (close) charge.near.push({ w, pos, hitUntil: new Float64Array(pos.length), hot: new Uint8Array(pos.length), hit: false, hitMax: 0 });
      }
    }
    // Put a run on the page with the flagged letters flipped: each stays in
    // the flow (invisible) with its glyph painted over it by CSS, so the line
    // never reflows. When the same letters were flipped last time, only the
    // glyphs and colours are refreshed in place, which is most frames of a
    // lingering run; otherwise the span is rebuilt. The span and its state
    // belong to the run, since several waves may write the same run.
    function applyRun(e, flag, glyph, colr) { e.hit = renderRun(e.w, flag, glyph, colr); }
    // the stuck letters of a run are laid over whatever a wave or ray is doing to it
    function mergeStuck(w, flag, glyph, colr, cls, life) {
      if (!w.stuck) return;
      for (const s of w.stuck) if (s.until > tNow) { flag[s.i] = 1; glyph[s.i] = s.glyph; colr[s.i] = s.col; cls[s.i] = 'g stuck'; life[s.i] = s.life.toFixed(2) + 's'; }
    }
    function renderRun(w, flag, glyph, colr) {
      const n = flag.length, cls = new Array(n), life = new Array(n);
      mergeStuck(w, flag, glyph, colr, cls, life);
      let any = false, same = w.shown && !!w.flag;
      for (let i = 0; i < n; i++) { if (flag[i]) any = true; if (same && flag[i] !== w.flag[i]) same = false; }
      if (!any) { unshowRun(w); return false; }
      if (same) {
        for (let i = 0, k = 0; i < n; i++) if (flag[i]) {
          const g = w.gEls[k++], c = colr[i] || '', cl = cls[i] || 'g';
          if (g.dataset.g !== glyph[i]) g.dataset.g = glyph[i];
          if (g.className !== cl) { g.className = cl; if (life[i]) g.style.setProperty('--life', life[i]); else g.style.removeProperty('--life'); }
          if (g.style.getPropertyValue('--gc') !== c) { if (c) g.style.setProperty('--gc', c); else g.style.removeProperty('--gc'); }
        }
        return true;
      }
      const span = w.span || (w.span = document.createElement('span'));
      span.className = 'glitch-run';
      while (span.firstChild) span.removeChild(span.firstChild);
      const els = [];
      let plain = '';
      const flush = () => { if (plain) { span.appendChild(document.createTextNode(plain)); plain = ''; } };
      for (let i = 0; i < n; i++) {
        if (flag[i]) {
          flush();
          const g = document.createElement('span');
          g.className = cls[i] || 'g';
          g.dataset.g = glyph[i];
          if (colr[i]) g.style.setProperty('--gc', colr[i]);
          if (life[i]) g.style.setProperty('--life', life[i]);
          g.textContent = w.chars[i];
          span.appendChild(g); els.push(g);
        } else plain += w.chars[i];
      }
      flush();
      w.flag = flag; w.gEls = els;
      if (!w.shown) { w.node.replaceWith(span); w.shown = true; }
      return true;
    }
    function unshowRun(w) {
      if (w.shown) { w.span.replaceWith(w.node); w.shown = false; w.flag = null; w.gEls = null; }
    }

    // ── stuck bits: now and then a ray strike flips a letter for good, or as
    // good as five seconds. It is held as an inverted block (the glyph in paper
    // on a bar of ink) so it reads as damage rather than a flicker, and comes
    // back with a stutter. The list lives apart from the rays and waves, whose
    // runs come and go underneath it. ──
    const STUCK_LIFE = 2, STUCK_VAR = 4;                                  // 2 to 6 s, uniform
    const stuck = [];
    let tNow = 0, nextStuckTick = 0;
    function stickLetter(w, i, t, hot) {
      if (!w.stuck) w.stuck = [];
      if (w.stuck.some(s => s.i === i)) return;
      const life = STUCK_LIFE + Math.random() * STUCK_VAR;
      const s = { w, i, until: t + life, life, glyph: SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0], col: hot ? '#C8623A' : (Math.random() < 0.25 ? TINTS[(Math.random() * TINTS.length) | 0] : '') };
      w.stuck.push(s); stuck.push(s);
    }
    function tickStuck(t) {
      tNow = t;
      if (!stuck.length || t < nextStuckTick) return;
      nextStuckTick = t + 0.1;
      for (let k = stuck.length - 1; k >= 0; k--) {
        const s = stuck[k];
        if (s.until > t) continue;
        stuck.splice(k, 1);
        const w = s.w, j = w.stuck.indexOf(s);
        if (j >= 0) w.stuck.splice(j, 1);
        if (!w.stuck.length) w.stuck = null;
        // whatever else is on the run will paint itself again next frame
        if (w.shown && w.flag) { const f = w.flag.slice(); f[s.i] = 0; renderRun(w, f, w.gEls ? glyphsOf(w) : new Array(f.length), new Array(f.length)); }
      }
    }
    function glyphsOf(w) {
      const out = new Array(w.flag.length);
      for (let i = 0, k = 0; i < w.flag.length; i++) if (w.flag[i]) out[i] = w.gEls[k++].dataset.g;
      return out;
    }
    // letters hit by a particle flip for a moment (the charge's own glitch runs)
    const hitAt = (e, q, until, hot) => { e.hitUntil[q] = until; e.hot[q] = hot; if (until > e.hitMax) e.hitMax = until; };
    function glitchHits(e, t) {
      if (!(e.hitMax > t)) { if (e.hit) healRun(e); return; }
      const n = e.w.chars.length, tick = Math.floor(t * 15);
      const flag = new Uint8Array(n), glyph = new Array(n), colr = new Array(n);
      for (let i = 0; i < n; i++) {
        const ch = e.w.chars[i];
        if (ch !== ' ' && ch.length === 1 && e.hitUntil[i] > t) {
          flag[i] = 1;
          glyph[i] = SCRAMBLE[(hash(i, 51, tick) * SCRAMBLE.length) | 0];
          if (e.hot[i]) colr[i] = '#C8623A'; else if (hash(i, 53, tick) < 0.2) colr[i] = TINTS[(hash(i, 55, tick) * TINTS.length) | 0];
        }
      }
      applyRun(e, flag, glyph, colr);
    }
    function dropCharge() {
      if (charge && charge.near) for (const e of charge.near) healRun(e);
      if (charge && charge.photo) clearPhoto();
      if (charge && charge.images) clearImageSet(charge.images);
      if (charge && charge.thumbs) thumbClear(charge.thumbs);
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
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) > rim - 2) continue;      // never outside the photo
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
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) > rim - 2) continue;
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
      const n = e.w.chars.length, t = rp.born + age;
      if (rp.sup && !e.linger) { e.linger = new Float64Array(n); e.lingerMax = 0; }
      const fade = Math.pow(1 - clamp01(age / rp.life), 1.6);                   // the wave's strength here
      const pf = rp.prob * fade, passed = age >= rp.life;                       // once the wave has died nothing is in the band
      const flag = new Uint8Array(n), glyph = new Array(n), colr = new Array(n);
      for (let i = 0; i < n; i++) {
        const ch = e.w.chars[i], d = e.dist[i];
        let inBand = false, Rt = 0;
        if (!passed && ch !== ' ' && ch.length === 1 && e.roll[i] < pf) {
          Rt = frontR(rp, e.ang[i], age);
          const thick = rp.thick * (0.6 + 0.8 * hash(i, 11, 0)) * (0.4 + 0.6 * fade);   // ragged band, narrowing as the wave dies
          inBand = d <= Rt && d >= Rt - thick;
        }
        // a super wave leaves some letters damaged after it has passed; they recover on their own clock
        if (inBand && rp.sup && e.linger[i] === 0) {
          e.linger[i] = hash(i, 61, 0) < 0.3 ? t + 0.8 + Math.pow(hash(i, 63, 0), 1.5) * 4.5 : -1;
          if (e.linger[i] > e.lingerMax) e.lingerMax = e.linger[i];
          if (hash(i, 67, 0) < 0.14) shed(e.pos[i][0], e.pos[i][1], rp, ch, null);
        }
        const lingering = rp.sup && e.linger[i] > t;
        if (inBand || lingering) {
          flag[i] = 1;
          const jitter = lingering ? Math.floor(t * 3 + hash(i, 65, 0) * 9) : (hash(i, 13, 0) < 0.3 ? Math.floor(age * 20) : Math.floor(Rt / 9));   // some letters keep re-rolling
          glyph[i] = SCRAMBLE[(hash(i, Math.floor(d), jitter) * SCRAMBLE.length) | 0];
          if (hash(i, 17, jitter) < 0.35) colr[i] = TINTS[(hash(i, 19, jitter) * TINTS.length) | 0];
        }
      }
      applyRun(e, flag, glyph, colr);
    }
    function healRun(e) {
      const w = e.w;
      e.hit = false;
      if (!w.shown) return;
      if (w.stuck) renderRun(w, new Uint8Array(w.chars.length), new Array(w.chars.length), new Array(w.chars.length));
      else unshowRun(w);
    }
    function restoreRipple(rp) {
      for (const e of rp.near) healRun(e);
      if (ripples.length <= 1) { clearImages(); for (const tg of imageList) tg.c.linger.clear(); }
      thumbClear(rp.thumbs);
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
        // a dragged ball trails the pointer a little, like something with mass
        if (charge.tx != null) {
          const f = 1 - Math.pow(0.001, Math.min(0.1, t - (charge.lastT || t)));
          charge.px += (charge.tx - charge.px) * f; charge.py += (charge.ty - charge.py) * f;
        }
        charge.lastT = t;
        const e = clamp01(held / 1.6);                          // energy, 0 .. 1 over 1.6 s
        const dark = clamp01((held - SUPER_HOLD) / 0.2);        // 0 .. 1 in the 0.2 s after 2.25 s
        const INK = [22, 28, 44];
        const vx = charge.px - SX, vy = charge.py - SY;
        const rad = (6 + 44 * e * e) * (1 - 0.68 * dark);       // the ball collapses as it goes dark
        const n = Math.round((6 + e * e * 40) * (1 - 0.45 * dark));
        const spin = 1 + e * 7 + dark * 9;
        const shake = (1.5 + e * 9) * (1 - 0.7 * dark);
        const reroll = Math.floor(t * (6 + e * 24));
        let warm = e < 0.35 ? mix(C.navy, C.midblue, e / 0.35) : e < 0.7 ? mix(C.midblue, C.amber, (e - 0.35) / 0.35) : mix(C.amber, C.clay, (e - 0.7) / 0.3);
        warm = mix(warm, INK, dark);
        const hotCol = mix(C.clay, INK, dark);
        ctx.font = '600 ' + Math.round(9 + e * 5 - dark * 3) + 'px ' + MONO;
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
        }
        // The orb touches things too: dragged across letters, the photo, an
        // image or a thumbnail it disturbs whatever sits under it, lightly
        // while energising and hard once it is dark. The set of nearby text
        // follows the orb as it is dragged.
        if (dark > 0 || charge.tx != null) {
          armNear();
          clearPhoto();
          clearImageSet(charge.images);
          const R = rad + 12, slot = Math.floor(t * 8), hotOrb = dark > 0 && slot % 3 === 0;
          for (const en of charge.near) {
            for (let q = 0; q < en.pos.length; q++) {
              const x = en.pos[q][0], y = en.pos[q][1];
              if (Math.abs(x - charge.px) > R || Math.abs(y - charge.py) > R || Math.hypot(x - charge.px, y - charge.py) > R) continue;
              if (hash(q, 71, slot) < 0.3 + 0.7 * e) hitAt(en, q, t + 0.25 + 0.3 * e, hash(q, 73, slot) < 0.3 ? 1 : 0);
            }
          }
          if (charge.photo) {
            const ph = charge.photo, cxp = ph.x + ph.size / 2, cyp = ph.y + ph.size / 2;
            if (Math.max(Math.abs(charge.px - cxp), Math.abs(charge.py - cyp)) < ph.size / 2 + R) photoPatch(charge.px, charge.py, R, hotOrb);
          }
          for (const tg of charge.images) imagePatch(tg, charge.px, charge.py, R, hotOrb);
          thumbHit(charge.thumbs, charge.px, charge.py, t);
          if (dark > 0) {
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
              // each particle streaks the photos it crosses (the photos measured once, as the ball goes dark)
              if (!charge.marks) charge.marks = trackTargets();
              if (!tr.track) { tr.track = new Map(); tr.marks = charge.marks; }
              markTracks(tr, hx, hy, t);
              const ha = Math.atan2(hoy - at(Math.max(0, dist - 8))[1], hox - at(Math.max(0, dist - 8))[0]);
              for (const e of charge.near) {
                for (let q = 0; q < e.pos.length; q++) {
                  if (Math.abs(e.pos[q][0] - hx) < 10 && Math.abs(e.pos[q][1] - hy) < 10) hitAt(e, q, t + 0.35, tr.hot ? 1 : 0);
                }
              }
              if (charge.photo) {
                const ph = charge.photo, cxp = ph.x + ph.size / 2, cyp = ph.y + ph.size / 2;
                if (Math.max(Math.abs(hx - cxp), Math.abs(hy - cyp)) < ph.size / 2 + 8) photoPatch(hx, hy, 14, tr.hot);
              }
              for (const tg of charge.images) imagePatch(tg, hx, hy, 16, tr.hot);
              thumbHit(charge.thumbs, hx, hy, t);
              for (const pp of parts) {
                if (Math.abs(pp.x - (hx - SX)) < 12 && Math.abs(pp.sy - (hy - SY)) < 12 && t - pp.lastHit > 0.3) {
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
          }
          for (const en of charge.near) glitchHits(en, t);
          thumbCool(charge.thumbs, t);
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
            for (const e of rp.near) { if (e.linger && e.lingerMax > t) glitchRun(e, rp, age); else if (e.hit) healRun(e); }
            drawPhotoLinger(rp, t);
            for (const tg of imageList) drawImageLinger(tg.c, t);
            continue;
          }
          restoreRipple(rp); ripples.splice(i, 1); continue;
        }
        const R = age * rp.speed, a = Math.pow(1 - age / rp.life, 2.2) * rp.alpha;   // eases out, never cuts off
        const vx = rp.px - SX, vy = rp.py - SY;
        // the front: rows of glyphs filling the band, brightest at the leading edge
        const rows = Math.max(1, Math.round(rp.thick / 11));
        ctx.font = '600 10px ' + MONO;
        const n = Math.max(10, Math.round((2 * Math.PI * R) / 15));
        const tick = Math.floor(age * 12);
        const M = 16;                                                        // margin around the viewport
        for (let q = 0; q < n; q++) {
          const ang = (q / n) * Math.PI * 2 + age * 0.3;
          const Rt = frontR(rp, ang, age);
          const ca = Math.cos(ang), sa = Math.sin(ang);
          // along this spoke the band runs from the sparks (Rt + 38) in to Rt - rows * 11:
          // when both ends are off the same side of the viewport, so is everything between
          const x1 = vx + ca * (Rt + 40), y1 = vy + sa * (Rt + 40), x0 = vx + ca * (Rt - rows * 11), y0 = vy + sa * (Rt - rows * 11);
          if ((x0 < -M && x1 < -M) || (x0 > w + M && x1 > w + M) || (y0 < -M && y1 < -M) || (y0 > h + M && y1 > h + M)) continue;
          for (let row = 0; row < rows; row++) {
            if (hash(q, row + i * 7, tick) < 0.14) continue;                 // gaps
            const r = Rt - row * 11 + (hash(q, row, tick) - 0.5) * 3;       // jitter
            if (r < 4) continue;
            const x = vx + ca * r, y = vy + sa * r;
            if (x < -M || x > w + M || y < -M || y > h + M) continue;
            const fade = 1 - row / rows;
            const g = SCRAMBLE[(hash(q, row + i * 7, tick + 1) * SCRAMBLE.length) | 0];
            const tinted = hash(q, row, tick + 2) < 0.12;
            ctx.fillStyle = tinted ? rgba(hexToRgb(TINTS[(hash(q, 23, tick) * TINTS.length) | 0]), 0.6 * a * fade) : rgba(C.navy, (0.18 + 0.25 * hash(q, row, 3)) * a * fade);
            ctx.fillText(g, x, y);
          }
          // sparks thrown ahead of the front
          if (hash(q, 29, tick) < 0.06) {
            const r = Rt + 8 + hash(q, 31, tick) * 30;
            const x = vx + ca * r, y = vy + sa * r;
            if (x < -M || x > w + M || y < -M || y > h + M) continue;
            ctx.fillStyle = rgba(hexToRgb(TINTS[(hash(q, 37, tick) * TINTS.length) | 0]), 0.5 * a);
            ctx.fillText(SCRAMBLE[(hash(q, 41, tick) * SCRAMBLE.length) | 0], x, y);
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
          const dx = p.x - vx, dy = p.sy - vy, d = Math.hypot(dx, dy) || 1;
          const Rt = frontR(rp, Math.atan2(dy, dx), age);
          if (d <= Rt && d >= Rt - 12 && t - p.lastHit > 0.5) {
            p.vx += dx / d * rp.shove * a; p.vy += dy / d * rp.shove * a; p.flash = 0.45; p.lastHit = t;
          }
        }
        // the letters under the front
        for (const e of rp.near) {
          if (!rp.sup && (e.dmin > R * 1.1 || e.dmax < R * 0.9 - rp.thick * 1.5)) { healRun(e); continue; }
          if (rp.sup && e.dmin > R * 1.1 && !e.linger) { healRun(e); continue; }
          if (rp.sup && e.linger && e.dmax < R * 0.9 - rp.thick * 2 && !(e.lingerMax > t)) { healRun(e); continue; }   // passed, nothing left to flicker
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
    // The layer is a hairline and a dot for a third of a second, so it is drawn
    // at one pixel per CSS pixel (at full resolution it was a 20 MB texture
    // blended over the page every frame) and it is hidden while no ray flies.
    const rayCanvas = document.createElement('canvas');
    rayCanvas.className = 'ray-layer';
    rayCanvas.setAttribute('aria-hidden', 'true');
    rayCanvas.style.visibility = 'hidden';
    document.body.appendChild(rayCanvas);
    const rctx = rayCanvas.getContext('2d');
    let rayShown = false;
    function sizeRayCanvas() {
      rayCanvas.width = w; rayCanvas.height = h;
      rctx.setTransform(1, 0, 0, 1, 0, 0);
      rctx.textAlign = 'center'; rctx.textBaseline = 'middle';
    }
    // a burst of glyphs thrown out into the field from a point, roughly along a direction
    function spew(x, y, dirx, diry, n, hot) {
      for (let i = 0; i < n; i++) {
        const p = spawn(x, y + SY);                                  // y in page space
        p.page = true;
        const a = Math.atan2(diry, dirx) + (Math.random() - 0.5) * 2.2;
        const sp = 160 + Math.random() * 320;
        p.isGlyph = true; p.ch = SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0]; p.size = 10 + Math.random() * 4;
        p.base = 0.3; p.boost = 1; p.flash = 1; p.launched = true;
        p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
        p.col = hot ? (Math.random() < 0.5 ? C.clay : C.amber) : (Math.random() < 0.3 ? C.midblue : C.navy);
        parts.push(p);
      }
      trimDebris(want + 200);
    }
    // ── tracks: a ray that passes through a photo leaves a faint streak on
    // it, the way cosmic rays mark a long camera exposure: a broken hairline
    // with knots of ionisation along it, and now and then a short curl where
    // it knocked an electron loose (they all curl the same way, as in a
    // cloud chamber's field). The particles the dark ball fires while it is
    // held, and the debris its burst throws for a few seconds after, leave
    // the same tracks. Each photo gets a canvas of
    // its own, drawn in negative like the rays, so a track sits on the photo
    // wherever it scrolls. Each track has a life of its own, between one and
    // TRACK_LIFE seconds (two more for the debris of a super burst), so a
    // shower of them goes out one by one.
    const TRACK_LIFE = 2.5;
    let burst = null;
    const trackHosts = new Map();            // photo element -> { cv, g, tracks }
    let lastTrackPaint = 0, tracksDirty = false;
    // the photos on screen now, with their boxes in page px
    function trackTargets() {
      const sx = window.scrollX, sy = window.scrollY, list = [];
      document.querySelectorAll('.ascii-photo-wrap, .feat-thumb, .post-body img').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > h) return;
        list.push({ el, x0: r.left + sx, y0: r.top + sy, w: r.width, h: r.height });
      });
      return list;
    }
    function trackHost(el) {
      let th = trackHosts.get(el);
      if (th) return th;
      const cv = document.createElement('canvas');
      cv.className = 'ray-tracks';
      cv.setAttribute('aria-hidden', 'true');
      // a post image has no box of its own to hold the canvas, so it sits in the post body over the image
      (el.tagName === 'IMG' ? el.closest('.post-body') : el).appendChild(cv);
      th = { cv, g: cv.getContext('2d'), tracks: [] };
      trackHosts.set(el, th);
      return th;
    }
    // the part of this frame's flight (page px) that lies inside each photo,
    // added to the mover's track on that photo (u, v run 0..1 across the
    // photo). The mover is a ray or a piece of debris: it carries the photos
    // it may cross (marks), its tracks so far, and its last position.
    function markTracks(r, px, py, t) {
      const ax = r.lpx == null ? px : r.lpx, ay = r.lpy == null ? py : r.lpy;
      r.lpx = px; r.lpy = py;
      if (Math.abs(px - ax) > 300) return;                       // debris wrapping round the screen edge
      for (const tg of r.marks) {
        // clip the segment to the box (Liang-Barsky)
        const dx = px - ax, dy = py - ay;
        let t0 = 0, t1 = 1, ok = true;
        for (const [p, q] of [[-dx, ax - tg.x0], [dx, tg.x0 + tg.w - ax], [-dy, ay - tg.y0], [dy, tg.y0 + tg.h - ay]]) {
          if (p === 0) { if (q < 0) { ok = false; break; } continue; }
          const s = q / p;
          if (p < 0) { if (s > t1) { ok = false; break; } if (s > t0) t0 = s; }
          else { if (s < t0) { ok = false; break; } if (s < t1) t1 = s; }
        }
        if (!ok || t1 - t0 < 1e-3) continue;
        const u0 = (ax + dx * t0 - tg.x0) / tg.w, v0 = (ay + dy * t0 - tg.y0) / tg.h;
        const u1 = (ax + dx * t1 - tg.x0) / tg.w, v1 = (ay + dy * t1 - tg.y0) / tg.h;
        // the track is a polyline, one point per frame, so a curving particle
        // leaves a curve; a gap (it left the photo and came back) starts a new run
        let tr = r.track.get(tg.el);
        if (!tr) {
          tr = { pts: [u0, v0, u1, v1], born: t, life: 1 + Math.random() * (TRACK_LIFE - 1) + (r.trackExtra || 0), seed: Math.random() * 1000, hot: r.hot, curl: Math.random() < 0.5 ? 1 : -1 };
          r.track.set(tg.el, tr);
          trackHost(tg.el).tracks.push(tr);
        } else {
          const n = tr.pts.length;
          if (Math.abs(tr.pts[n - 2] - u0) > 0.004 || Math.abs(tr.pts[n - 1] - v0) > 0.004) tr.pts.push(NaN, NaN, u0, v0);
          tr.pts.push(u1, v1);
        }
        tracksDirty = true;
      }
    }
    function drawTrack(g, tr, W, H, a) {
      const s = tr.seed, P = tr.pts;
      g.lineCap = 'round';
      let k = 0;                                                 // distance along the whole track, so the pattern runs through the joins
      for (let i = 2; i < P.length; i += 2) {
        if (P[i] !== P[i] || P[i - 2] !== P[i - 2]) continue;   // a gap
        const x0 = P[i - 2] * W, y0 = P[i - 1] * H, x1 = P[i] * W, y1 = P[i + 1] * H, L = Math.hypot(x1 - x0, y1 - y0);
        if (L < 0.5) continue;
        const ux = (x1 - x0) / L, uy = (y1 - y0) / L, kEnd = k + L;
        for (; k < kEnd; k += 2) {
          const d = k - (kEnd - L), x = x0 + ux * d, y = y0 + uy * d, d2 = Math.min(L, d + 2);
          drawBit(g, tr, s, k, x, y, x0 + ux * d2, y0 + uy * d2, ux, uy, a);
        }
      }
    }
    // one two-pixel bit of a track at distance k along it
    function drawBit(g, tr, s, k, x, y, x2, y2, ux, uy, a) {
      // the hairline, brighter and dimmer in runs of a few px, with gaps
      if (hash(k >> 1, s, 2) > 0.1) {
        g.strokeStyle = rgba([255, 255, 255], a * (0.3 + 0.7 * hash(k >> 3, s, 1)));
        g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
      }
      // a knot of ionisation
      if (hash(k, s, 3) < (tr.hot ? 0.09 : 0.06)) {
        g.fillStyle = rgba([255, 255, 255], a * 0.9);
        g.beginPath(); g.arc(x, y, 1.2 + hash(k, s, 4) * 1.2, 0, 2 * Math.PI); g.fill();
      }
      // a knocked-on electron: a short spiral off to one side, tightening as it slows
      if (hash(k, s, 5) < (tr.hot ? 0.02 : 0.012)) {
        let ang = Math.atan2(uy, ux) + (hash(k, s, 6) < 0.5 ? 1 : -1) * (0.6 + 0.8 * hash(k, s, 7)), cx = x, cy = y;
        const n = 8 + ((hash(k, s, 8) * 14) | 0);
        g.lineWidth = 1.05;
        for (let j = 0; j < n; j++) {
          const nx = cx + Math.cos(ang) * 1.6, ny = cy + Math.sin(ang) * 1.6;
          g.strokeStyle = rgba([255, 255, 255], a * 0.75 * (1 - j / n));
          g.beginPath(); g.moveTo(cx, cy); g.lineTo(nx, ny); g.stroke();
          cx = nx; cy = ny; ang += tr.curl * (0.1 + 0.035 * j);
        }
      }
    }
    // repaint the photos that carry tracks: every frame while a ray is
    // laying one down and four times a second while they fade; a photo's
    // canvas goes once its last track has faded (or the photo has left the page)
    function paintTracks(t) {
      if (!trackHosts.size || (!tracksDirty && t - lastTrackPaint < 0.25)) return;
      tracksDirty = false; lastTrackPaint = t;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (const [el, th] of trackHosts) {
        th.tracks = th.tracks.filter(tr => t - tr.born < tr.life);
        if (!el.isConnected || !th.tracks.length) { th.cv.remove(); trackHosts.delete(el); continue; }
        const W = el.offsetWidth, H = el.offsetHeight;
        if (el.tagName === 'IMG') {
          const st = th.cv.style;
          st.left = el.offsetLeft + 'px'; st.top = el.offsetTop + 'px'; st.width = W + 'px'; st.height = H + 'px';
        }
        if (th.cv.width !== Math.round(W * dpr) || th.cv.height !== Math.round(H * dpr)) { th.cv.width = Math.round(W * dpr); th.cv.height = Math.round(H * dpr); }
        const g = th.g;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, W, H);
        for (const tr of th.tracks) {
          const age = t - tr.born;
          // a moment's flash as it is struck, then faint, then gone over the last half of its life
          drawTrack(g, tr, W, H, 0.5 * clamp01((tr.life - age) / (tr.life * 0.5)) * (1 + 0.8 * clamp01(1 - age / 0.6)));
        }
      }
    }
    function launchRay(now) {
      const fromLeft = Math.random() < 0.5;
      const ang = (Math.random() < 0.5 ? 1 : -1) * (0.12 + Math.random() * 0.4);   // shallow diagonal
      const sp = 2250 + Math.random() * 1350;
      const y0 = h * (0.1 + Math.random() * 0.8);
      const ray = {
        x: fromLeft ? -40 : w + 40, y: y0,
        vx: (fromLeft ? 1 : -1) * Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        born: now, trail: [], hot: Math.random() < 0.4, near: null, lastSpew: 0,
        flips: Math.random() < 0.8 ? (Math.random() < 0.3 ? 2 : 1) : 0  // most rays carry a flip, some two
      };
      if (!textNodes) collectText();
      ray.near = [];
      // only the runs the ray's straight path comes near (a wide margin, since
      // the page may scroll a little while it flies)
      snapScroll();
      const ox = ray.x + SX, oy = ray.y + SY, nv = Math.hypot(ray.vx, ray.vy);
      for (const wn of textNodes) {
        if (!wn.node.parentNode) continue;
        const pos = posOf(wn);
        if (!pos) continue;
        let close = false;
        for (let i = 0; i < pos.length; i++) { if (Math.abs((pos[i][0] - ox) * ray.vy - (pos[i][1] - oy) * ray.vx) / nv < 160) { close = true; break; } }
        if (!close) continue;
        ray.near.push({ w: wn, pos, hitUntil: new Float64Array(pos.length), hot: new Uint8Array(pos.length), hit: false, hitMax: 0 });
      }
      ray.photo = photoTarget();
      ray.images = imageTargets();
      ray.thumbs = thumbTargets();
      ray.marks = trackTargets(); ray.track = new Map();
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
      if (!rays.length) {
        if (rayShown) { rctx.clearRect(0, 0, w, h); rayCanvas.style.visibility = 'hidden'; rayShown = false; }
        return;
      }
      if (rayCanvas.width !== w || rayCanvas.height !== h) sizeRayCanvas();
      if (!rayShown) { rayCanvas.style.visibility = 'visible'; rayShown = true; }
      rctx.clearRect(0, 0, w, h);
      for (const r of rays) clearImageSet(r.images);
      for (let i = rays.length - 1; i >= 0; i--) {
        const r = rays[i];
        r.x += r.vx * dt; r.y += r.vy * dt;
        r.trail.push([r.x, r.y]); if (r.trail.length > 14) r.trail.shift();
        const gone = r.x < -160 || r.x > w + 160 || r.y < -160 || r.y > h + 160;
        if (gone) { for (const e of r.near) healRun(e); clearImageSet(r.images); thumbClear(r.thumbs); rays.splice(i, 1); continue; }
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
          const dx = pp.x - r.x, dy = pp.sy - r.y, d = Math.hypot(dx, dy);
          if (d < 40 && t - pp.lastHit > 0.4) {
            pp.vx += dx / (d || 1) * 320 + r.vx * 0.12; pp.vy += dy / (d || 1) * 320 + r.vy * 0.12;
            pp.flash = 1; pp.lastHit = t;
            if (!pp.isGlyph) { pp.isGlyph = true; pp.size = 10 + Math.random() * 3; pp.base = 0.25; pp.revertAt = t + LIFE; }
            pp.ch = SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];
            hits++;
          }
        }
        if (hits && t - r.lastSpew > 0.08) { spew(r.x, r.y, -dirx, -diry, Math.min(4, hits), r.hot); r.lastSpew = t; }
        // letters under the head glitch, and spit out glyphs
        // the head in page px: the ray layer is fixed to the viewport, unshifted
        const px = r.x + SX, py = r.y + SY;
        markTracks(r, px, py, t);
        for (const e of r.near) {
          let any = false;
          for (let q = 0; q < e.pos.length; q++) {
            if (Math.abs(e.pos[q][0] - px) < 14 && Math.abs(e.pos[q][1] - py) < 14) {
              hitAt(e, q, t + 0.35, r.hot ? 1 : 0); any = true;
              const ch = e.w.chars[q];
              if (r.flips && ch !== ' ' && ch.length === 1 && Math.random() < 0.3) { r.flips--; stickLetter(e.w, q, t, r.hot); }
            }
          }
          if (any && t - r.lastSpew > 0.08) { spew(r.x, r.y, -dirx, -diry, 3, r.hot); r.lastSpew = t; }
          if (any || e.hit) glitchHits(e, t);
        }
        // the photo
        if (r.photo) {
          const ph = r.photo, cxp = ph.x + ph.size / 2, cyp = ph.y + ph.size / 2;
          if (Math.max(Math.abs(px - cxp), Math.abs(py - cyp)) < ph.size / 2 + 8) {
            const was = charge; charge = { photo: ph };      // photoPatch reads the photo from the charge
            photoPatch(px, py, 20, r.hot);
            charge = was;
            if (t - r.lastSpew > 0.08) { spew(r.x, r.y, -dirx, -diry, 5, true); r.lastSpew = t; }
          }
        }
        for (const tg of r.images) { if (imagePatch(tg, px, py, 18, r.hot) && t - r.lastSpew > 0.08) { spew(r.x, r.y, -dirx, -diry, 4, r.hot); r.lastSpew = t; } }
        thumbHit(r.thumbs, px, py, t); thumbCool(r.thumbs, t);
      }
    }

    function collide(t) {
      for (const m of parts) {
        if (Math.hypot(m.vx, m.vy) < 30) continue;
        const my = m.sy;
        for (const o of parts) {
          if (o === m || t - o.lastHit < 0.6) continue;
          const dx = o.x - m.x, dy = o.sy - my;
          if (dx * dx + dy * dy > 100) continue;
          // pass most of the momentum on, with a little scatter
          o.vx += m.vx * 0.6 + (Math.random() - 0.5) * 30;
          o.vy += m.vy * 0.6 + (Math.random() - 0.5) * 30;
          m.vx *= 0.45; m.vy *= 0.45;
          o.flash = 1; m.flash = 0.6; o.lastHit = m.lastHit = t;
          if (o.isGlyph) o.ch = SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];
          else if (Math.random() < 0.5) { o.isGlyph = true; o.ch = SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0]; o.size = 10 + Math.random() * 3; o.base = 0.2; o.revertAt = t + LIFE; }
          break;
        }
      }
    }

    function frame(t) {
      const dt = lastT ? Math.min(t - lastT, 0.2) : 0; lastT = t;
      const sh = shift();
      const keep = Math.pow(0.3, dt);      // momentum decays over a second or so
      ctx.clearRect(0, 0, w, h);
      snapScroll();
      placeAll();
      if (dt) collide(t);
      tickStuck(t);
      drawRipples(t);
      drawRays(t, dt);
      paintTracks(t);
      const scrollY = SY, pageH = document.documentElement.scrollHeight;
      let curFont = '';
      for (const p of parts) {
        const a = angle(p.x, p.y, t);
        p.x += (Math.cos(a) * 12 + p.vx) * dt; p.y += (Math.sin(a) * 12 + p.vy) * dt;
        p.vx *= keep; p.vy *= keep;
        p.flash *= Math.pow(0.05, dt); p.boost *= Math.pow(0.5, dt);
        // debris has a life: thrown glyphs fade out over their last four seconds
        // and are dropped from the field; a dot that was knocked into a glyph
        // fades the same way and goes back to being a dot
        let fade = 1;
        if (p.launched) {
          const left = LIFE - (t - p.born);
          if (left <= 0) { p.dead = true; continue; }
          fade = Math.min(1, left / 4);
        } else if (p.revertAt) {
          const left = p.revertAt - t;
          if (left <= 0) { p.isGlyph = false; p.size = 1 + Math.random() * 1.4; p.base = (0.18 + Math.random() * 0.2) * 0.8; p.flash = 0; p.revertAt = 0; }
          else fade = Math.min(1, left / 4);
        }
        if (p.x < -10) p.x = w + 10; else if (p.x > w + 10) p.x = -10;
        let y;
        if (p.page) {
          // thrown debris keeps its place on the page and scrolls with it
          y = p.y - scrollY;
          // debris from a super burst streaks the photos it crosses while it still flies
          if (burst && p.launched && p.born >= burst.start - 0.05) {
            if (t > burst.until) burst = null;
            else if (Math.hypot(p.vx, p.vy) > 90) {
              if (!p.track) { p.track = new Map(); p.marks = burst.marks; p.trackExtra = 2; p.hot = p.col === C.clay || p.col === C.amber; }
              markTracks(p, p.x + SX, p.y, t);
            }
          }
          if (p.y < -200 || p.y > pageH + 200) { p.dead = true; continue; }
          if (y < -40 || y > h + 40) continue;                        // off screen: skip the draw
        } else {
          if (p.y < -10) p.y = h + 10; else if (p.y > h + 10) p.y = -10;
          y = ((p.y - sh) % (h + 20) + (h + 20)) % (h + 20) - 10;
        }
        if (p.isGlyph && Math.random() < 0.004) p.ch = SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];
        const alpha = Math.min(1, p.base * (0.55 + 0.45 * Math.sin(t * 0.7 + p.phase)) + p.flash * 0.55 + p.boost * 0.35) * fade;
        ctx.fillStyle = rgba(p.col, alpha);
        if (p.isGlyph) {
          // whole pixel sizes, and the font set only when it changes: each size is its own glyph-cache entry
          const f = '600 ' + Math.round(p.size * (1 + p.flash * 0.5)) + 'px ' + MONO;
          if (f !== curFont) ctx.font = curFont = f;
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
    let COLS = 64;
    // size the bar to the box: as many columns as fit beside "[", "] 100%"
    function fitCols() {
      const probe = document.createElement('span');
      probe.textContent = '='.repeat(10); probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:inherit';
      meter.appendChild(probe); const chW = probe.getBoundingClientRect().width / 10; meter.removeChild(probe);
      const avail = meter.clientWidth / Math.max(1, chW) - 8;              // "[" + bar + "] 100%"
      COLS = Math.max(16, Math.min(64, Math.floor(avail)));
    }
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
      const mr = meter.getBoundingClientRect();
      if (r1.width > 4) { barLeft = r1.left - mr.left; barWidth = r1.width; }
      else { barLeft = r0.width || 7; barWidth = Math.max(1, mr.width - barLeft * 9); }
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
    meter.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); dragging = true;
      try { meter.setPointerCapture(e.pointerId); } catch (_) {}
      measure(); setFrom(e.clientX);
    });
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
    fitCols();
    render(0);
    pageOn(window, 'resize', () => { fitCols(); render(performance.now() / 1000); });
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
      if (p < 1) requestAnimationFrame(frame); else { el.classList.remove('decoding'); document.dispatchEvent(new Event('ascii:textchanged')); }
    }
    requestAnimationFrame(frame);
  }
  const decoder = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { decoder.unobserve(e.target); decode(e.target); } });
  }, { threshold: 0.6 });

  // ── boot ─────────────────────────────────────────────────────────
  // scenes that live in the main column: run on load and again after an
  // in-place page swap (nav.js replaces .main-col and fires ascii:page-enter)
  function initPage() {
    const l = document.getElementById('ascii-landscape'); if (l) landscape(l);
    const h = document.getElementById('ascii-hills');     if (h) life(h);
    const cl = document.getElementById('ascii-clouds');   if (cl) clouds(cl);
    const hs = document.getElementById('hero-scene');     if (hs) storm(hs, { cloud: 0.36, boltEvery: 9 });
    document.querySelectorAll('[data-scene="storm-small"]').forEach(c => storm(c, { cloud: 0.4, boltEvery: 12, rain: 2.2, salvo: 3 }));
    document.querySelectorAll('[data-scene="chaos"]').forEach(c => chaos(c));
    document.querySelectorAll('[data-scene="attractor"]').forEach(c => attractor(c));
    document.querySelectorAll('[data-scene="flock"]').forEach(c => flock(c));
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
