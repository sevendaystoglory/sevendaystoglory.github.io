// ASCII reveal of the profile Live Photo.
//
// The hidden <video> plays the iPhone Live Photo in real time. Each
// requestAnimationFrame we draw the current video frame onto a 128×128
// sampling canvas, partition it into square cells, average each cell's
// RGB → pick a glyph from a luminance ramp (light → dense) → paint that
// glyph in the cell's mean color on the visible canvas.
//
// "Density grows with time" = the cell side shrinks in 5 discrete steps
// across the video's duration: 16 → 12 → 8 → 6 → 4 px. So early frames
// look like ~8×8 colored chunks of glyph; later frames pack ~32×32 finer
// glyphs and start to resolve the actual photo. When the video ends we
// crossfade to the crisp <img>, which is exactly the video's last frame.

(function () {
  if (!window.requestAnimationFrame) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const video  = document.querySelector('.sidebar-photo-video');
  const canvas = document.querySelector('.sidebar-photo-canvas');
  const img    = document.querySelector('.sidebar-photo');
  if (!video || !canvas || !img) return;

  // Standard 70-glyph luminance ramp, light → dense.
  const CHARSET = " .'`^\",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
  const CHAR_LEN = CHARSET.length;

  // 5-step cell schedule across the video timeline.
  function cellSizeAt(t) {
    if (t < 0.20) return 16;
    if (t < 0.40) return 12;
    if (t < 0.60) return 8;
    if (t < 0.80) return 6;
    return 4;
  }

  function start() {
    const W = 128, H = 128;                                 // internal grid
    const dpr = Math.min(window.devicePixelRatio || 1, 2);  // crisper text
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = '100%';
    canvas.style.height = '100%';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Off-screen canvas used to read pixel data from the <video>.
    const sample = document.createElement('canvas');
    sample.width = W;
    sample.height = H;
    const sCtx = sample.getContext('2d', { willReadFrequently: true });

    img.classList.add('is-hidden');

    let started = false;
    let t0 = 0;
    let duration = 2780;
    let lastCellSize = -1;

    function frame(now) {
      const elapsed = now - t0;
      const t = Math.min(elapsed / duration, 1);

      // Cover-crop the current video frame onto the 128×128 sample buffer
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

      // Clear with the wrap's bg so glyph color carries the image
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, W, H);

      if (cs !== lastCellSize) {
        ctx.font = '600 ' + (cs + 2) + 'px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
        lastCellSize = cs;
      }

      const cellPx = cs * cs;

      for (let r = 0; r < rows; r++) {
        const y0 = r * cs;
        for (let c = 0; c < cols; c++) {
          const x0 = c * cs;

          // Average the cell's RGB
          let rs = 0, gs = 0, bs = 0;
          for (let yy = 0; yy < cs; yy++) {
            const rowOff = (y0 + yy) * W;
            for (let xx = 0; xx < cs; xx++) {
              const px = (rowOff + x0 + xx) << 2;
              rs += data[px];
              gs += data[px + 1];
              bs += data[px + 2];
            }
          }
          const ra = rs / cellPx;
          const ga = gs / cellPx;
          const ba = bs / cellPx;

          // Luminance → glyph index (light → dense ramp; bright pixel = denser glyph)
          const lum = 0.299 * ra + 0.587 * ga + 0.114 * ba;
          const ch  = CHARSET[((lum / 255) * (CHAR_LEN - 1)) | 0];

          ctx.fillStyle = 'rgb(' + (ra | 0) + ',' + (ga | 0) + ',' + (ba | 0) + ')';
          ctx.fillText(ch, x0 + cs * 0.5, y0 + cs * 0.5);
        }
      }

      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        // Crossfade to the crisp last frame.
        img.classList.remove('is-hidden');
      }
    }

    function begin() {
      if (started) return;
      started = true;
      duration = (video.duration && isFinite(video.duration)) ? video.duration * 1000 : 2780;
      t0 = performance.now();
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(function () {
          // Autoplay blocked: just reveal the static photo.
          img.classList.remove('is-hidden');
        });
      }
      requestAnimationFrame(frame);
    }

    if (video.readyState >= 2) {
      begin();
    } else {
      video.addEventListener('loadeddata', begin, { once: true });
      video.addEventListener('canplay',   begin, { once: true });
      // Safety net if the video never fires the events (network issue, etc.)
      setTimeout(function () {
        if (!started) {
          img.classList.remove('is-hidden');
        }
      }, 6000);
    }
  }

  if (img.complete && img.naturalWidth > 0) {
    start();
  } else {
    img.addEventListener('load', start, { once: true });
    img.addEventListener('error', function () { img.classList.remove('is-hidden'); }, { once: true });
  }
})();
