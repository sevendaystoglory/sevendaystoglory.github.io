// Edge-aware ASCII reveal of the profile Live Photo.
//
// The hidden <video> plays the iPhone Live Photo in real time. Each
// requestAnimationFrame we draw the current frame onto a 144×144
// sampling canvas, partition it into square cells, and for each cell:
//
//   1. Compute mean RGB and mean luminance.
//   2. Compute a one-pixel-wide Sobel-style gradient (gx, gy) using
//      the cell's left/right column means and top/bottom row means.
//   3. If the gradient magnitude exceeds a threshold, the cell is on a
//      visible edge → render a *directional* glyph perpendicular to the
//      gradient, chosen from {|, /, −, \}. Otherwise the cell is in a
//      flat region → render a *density* glyph from a luminance ramp.
//   4. Boost the cell's chroma so colors carry more punch, then paint
//      the glyph in that color on a near-black background.
//
// Cell size shrinks 8 → 6 → 4 → 3 in 4 discrete steps across the video
// timeline, so glyph density grows as the photo materializes.  When the
// video ends we crossfade to the crisp <img> (the video's last frame).

(function () {
  if (!window.requestAnimationFrame) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const video  = document.querySelector('.sidebar-photo-video');
  const canvas = document.querySelector('.sidebar-photo-canvas');
  const img    = document.querySelector('.sidebar-photo');
  if (!video || !canvas || !img) return;

  // 70-glyph luminance ramp, light → dense.
  const RAMP = " .'`^\",:;Il!i><~+_-?][}{1)(tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
  const RAMP_LEN = RAMP.length;

  // Bin index → directional glyph perpendicular to the gradient direction.
  // bin 0: gradient ≈ horizontal     → vertical edge       → '|'
  // bin 1: gradient ≈ +45° / −45°    → '/' diagonal edge   → '/'
  // bin 2: gradient ≈ vertical       → horizontal edge     → '-'
  // bin 3: gradient ≈ −45° / +135°   → '\' diagonal edge   → '\'
  const DIRGLYPH = ['|', '/', '-', '\\'];

  // Cell side per timeline phase.  Internal grid is 144 px so all cells fit.
  function cellSizeAt(t) {
    if (t < 0.22) return 8;
    if (t < 0.45) return 6;
    if (t < 0.72) return 4;
    return 3;
  }

  function start() {
    const W = 144, H = 144;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = '100%';
    canvas.style.height = '100%';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const sample = document.createElement('canvas');
    sample.width = W;
    sample.height = H;
    const sCtx = sample.getContext('2d', { willReadFrequently: true });

    img.classList.add('is-hidden');

    let started = false;
    let imgFadeStarted = false;
    let t0 = 0;
    let duration = 2780;
    let lastCellSize = -1;

    const SAT_EARLY = 1.30;    // chroma punch at the start
    const SAT_END   = 1.00;    // exact match to source by the end
    const BRIGHT_EARLY = 1.06;
    const BRIGHT_END   = 1.00;
    const PI8 = Math.PI / 8;
    const PI4 = Math.PI / 4;

    // Smoothstep — used for the easing the chars dissolve into pixels.
    function smoothstep(edge0, edge1, x) {
      let v = (x - edge0) / (edge1 - edge0);
      if (v <= 0) return 0;
      if (v >= 1) return 1;
      return v * v * (3 - 2 * v);
    }

    function frame(now) {
      const elapsed = now - t0;
      const t = Math.min(elapsed / duration, 1);

      // Sequencing:
      //   t ∈ [0.00, 0.55] — pure ASCII reveal (chars on near-black).
      //   t ∈ [0.55, 0.85] — cells fill with their mean color and the
      //                      sat/bright boost relaxes to identity, so
      //                      the canvas converges to the photo's pixels.
      //   t ∈ [0.85, 1.00] — <img> crossfades over the now-solid canvas.
      // The img CSS transition (0.55s) lines up so img reaches full
      // opacity right at t≈1 and never covers the live ASCII phase.
      if (!imgFadeStarted && t >= 0.85) {
        imgFadeStarted = true;
        img.classList.remove('is-hidden');
      }

      const bgFill    = smoothstep(0.55, 0.85, t);
      const colorEase = smoothstep(0.55, 0.85, t);
      const SAT    = SAT_EARLY    + (SAT_END    - SAT_EARLY)    * colorEase;
      const BRIGHT = BRIGHT_EARLY + (BRIGHT_END - BRIGHT_EARLY) * colorEase;

      // Cover-crop the current video frame onto the 144×144 sample buffer.
      const vw = video.videoWidth  || W;
      const vh = video.videoHeight || H;
      const scale = Math.max(W / vw, H / vh);
      const dw = vw * scale;
      const dh = vh * scale;
      const dx = (W - dw) / 2;
      const dy = (H - dh) / 2;

      sCtx.fillStyle = '#000';
      sCtx.fillRect(0, 0, W, H);
      try {
        sCtx.drawImage(video, dx, dy, dw, dh);
      } catch (e) {
        requestAnimationFrame(frame);
        return;
      }
      const data = sCtx.getImageData(0, 0, W, H).data;

      const cs   = cellSizeAt(t);
      const cols = (W / cs) | 0;
      const rows = (H / cs) | 0;
      const cellPx = cs * cs;
      // Edge threshold scales with cell side: each pixel on the edge
      // contributes up to ±255, so 38·cs ≈ 15% relative gradient.
      const edgeThresh = 38 * cs;

      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, W, H);

      if (cs !== lastCellSize) {
        ctx.font = '600 ' + (cs + 2) + 'px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
        lastCellSize = cs;
      }

      for (let r = 0; r < rows; r++) {
        const y0 = r * cs;
        for (let c = 0; c < cols; c++) {
          const x0 = c * cs;

          // Pass 1: accumulate per-cell totals AND per-edge luminance sums
          // so we can derive both mean color and a gradient cheaply.
          let rs = 0, gs = 0, bs = 0;
          let topL = 0, botL = 0, leftL = 0, rightL = 0;
          const lastY = cs - 1;
          const lastX = cs - 1;

          for (let yy = 0; yy < cs; yy++) {
            const rowOff = (y0 + yy) * W;
            const isTop = (yy === 0);
            const isBot = (yy === lastY);
            for (let xx = 0; xx < cs; xx++) {
              const px = (rowOff + x0 + xx) << 2;
              const pr = data[px], pg = data[px + 1], pb = data[px + 2];
              rs += pr; gs += pg; bs += pb;
              const lum = 0.299 * pr + 0.587 * pg + 0.114 * pb;
              if (isTop) topL  += lum;
              if (isBot) botL  += lum;
              if (xx === 0)     leftL  += lum;
              if (xx === lastX) rightL += lum;
            }
          }

          const ra = rs / cellPx;
          const ga = gs / cellPx;
          const ba = bs / cellPx;
          const lumAvg = 0.299 * ra + 0.587 * ga + 0.114 * ba;

          // Gradient (Manhattan magnitude is cheaper than √)
          const gx = rightL - leftL;
          const gy = botL   - topL;
          const gMag = (gx < 0 ? -gx : gx) + (gy < 0 ? -gy : gy);

          let ch;
          if (gMag > edgeThresh) {
            // Edge cell: pick directional glyph perpendicular to gradient
            let ang = Math.atan2(gy, gx);
            if (ang < 0) ang += Math.PI;
            const bin = (((ang + PI8) % Math.PI) / PI4) | 0;
            ch = DIRGLYPH[bin];
          } else {
            // Flat cell: pick by luminance from density ramp
            ch = RAMP[((lumAvg / 255) * (RAMP_LEN - 1)) | 0];
          }

          // Saturation boost around per-cell luminance, then a touch of
          // overall brightness — colors on near-black bg need help.
          let r2 = lumAvg + (ra - lumAvg) * SAT;
          let g2 = lumAvg + (ga - lumAvg) * SAT;
          let b2 = lumAvg + (ba - lumAvg) * SAT;
          r2 *= BRIGHT; g2 *= BRIGHT; b2 *= BRIGHT;
          if (r2 < 0) r2 = 0; else if (r2 > 255) r2 = 255;
          if (g2 < 0) g2 = 0; else if (g2 > 255) g2 = 255;
          if (b2 < 0) b2 = 0; else if (b2 > 255) b2 = 255;

          const ri = r2 | 0, gi = g2 | 0, bi = b2 | 0;

          // Fill cell with its mean color (alpha = bgFill). At t≈1 each
          // cell becomes a solid colored square, so the chars appear to
          // "settle into" the underlying photo rather than being painted
          // over. We composite over the existing #0a0a0a so partial
          // bgFill blends cleanly.
          if (bgFill > 0.005) {
            ctx.fillStyle = 'rgba(' + ri + ',' + gi + ',' + bi + ',' + bgFill + ')';
            ctx.fillRect(x0, y0, cs, cs);
          }

          ctx.fillStyle = 'rgb(' + ri + ',' + gi + ',' + bi + ')';
          ctx.fillText(ch, x0 + cs * 0.5, y0 + cs * 0.5);
        }
      }

      if (t < 1) {
        requestAnimationFrame(frame);
      }
      // (img fade-in was triggered earlier at t=0.72; nothing more to do.)
    }

    function begin() {
      if (started) return;
      started = true;
      duration = (video.duration && isFinite(video.duration)) ? video.duration * 1000 : 2780;
      t0 = performance.now();
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(function () { img.classList.remove('is-hidden'); });
      }
      requestAnimationFrame(frame);
    }

    if (video.readyState >= 2) {
      begin();
    } else {
      video.addEventListener('loadeddata', begin, { once: true });
      video.addEventListener('canplay',   begin, { once: true });
      setTimeout(function () { if (!started) img.classList.remove('is-hidden'); }, 6000);
    }
  }

  if (img.complete && img.naturalWidth > 0) {
    start();
  } else {
    img.addEventListener('load', start, { once: true });
    img.addEventListener('error', function () { img.classList.remove('is-hidden'); }, { once: true });
  }
})();
