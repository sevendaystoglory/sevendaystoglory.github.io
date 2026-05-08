// Frequency-domain reveal of the profile photo.
//
// Idea: render the partial Fourier reconstruction
//
//   x(t) = F^{-1}{ X · H_t },     H_t(k) = exp( -‖k‖² / (2 σ(t)²) )
//
// where X = F{x_0} is the 2D DFT of the photo and σ(t) is a Gaussian
// low-pass bandwidth that grows from a tiny value (only DC passes →
// uniform blob) to a large one (all frequencies pass → original photo)
// over ~3.5 s. The viewer sees coarse structure first (overall shape),
// then mid frequencies (face/silhouette), then fine detail (eyes, glasses,
// texture) — exactly because the Fourier basis orders detail by spatial
// frequency. A Gaussian mask avoids Gibbs ringing.
//
// We compute X once at init (one 2D FFT per channel), then each frame:
//   1. multiply X by the current Gaussian mask H_t  (pointwise),
//   2. apply 2D inverse FFT,
//   3. paint the real part to the canvas.

(function () {
  if (!window.requestAnimationFrame) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const img = document.querySelector('.sidebar-photo');
  const canvas = document.querySelector('.sidebar-photo-canvas');
  if (!img || !canvas) return;

  const N = 128;          // FFT side length — must be power of 2
  const N2 = N * N;
  const HALF = N >> 1;

  // -------- 1D in-place radix-2 Cooley–Tukey FFT --------------------
  function fft1d(re, im, n, inverse) {
    // bit-reversal permutation
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    const sign = inverse ? 1 : -1;
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const ang = sign * 2 * Math.PI / len;
      const wnRe = Math.cos(ang);
      const wnIm = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let wr = 1, wi = 0;
        for (let k = 0; k < half; k++) {
          const a = i + k;
          const b = a + half;
          const tRe = wr * re[b] - wi * im[b];
          const tIm = wr * im[b] + wi * re[b];
          re[b] = re[a] - tRe;
          im[b] = im[a] - tIm;
          re[a] += tRe;
          im[a] += tIm;
          const nwr = wr * wnRe - wi * wnIm;
          wi = wr * wnIm + wi * wnRe;
          wr = nwr;
        }
      }
    }
    if (inverse) {
      const inv = 1 / n;
      for (let i = 0; i < n; i++) { re[i] *= inv; im[i] *= inv; }
    }
  }

  // -------- 2D FFT (separable: rows then columns) ------------------
  function fft2d(re, im, w, h, inverse) {
    const lineRe = new Float64Array(Math.max(w, h));
    const lineIm = new Float64Array(Math.max(w, h));
    // rows
    for (let y = 0; y < h; y++) {
      const off = y * w;
      for (let x = 0; x < w; x++) { lineRe[x] = re[off + x]; lineIm[x] = im[off + x]; }
      fft1d(lineRe, lineIm, w, inverse);
      for (let x = 0; x < w; x++) { re[off + x] = lineRe[x]; im[off + x] = lineIm[x]; }
    }
    // columns
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) { lineRe[y] = re[y * w + x]; lineIm[y] = im[y * w + x]; }
      fft1d(lineRe, lineIm, h, inverse);
      for (let y = 0; y < h; y++) { re[y * w + x] = lineRe[y]; im[y * w + x] = lineIm[y]; }
    }
  }

  function start() {
    // Sample the photo into an N × N RGB grid (centered, cover-cropped via drawImage)
    const off = document.createElement('canvas');
    off.width = N;
    off.height = N;
    const offCtx = off.getContext('2d');

    let imgData;
    try {
      // Cover-crop: scale so the smaller dimension fits, center-crop the rest
      const iw = img.naturalWidth || N;
      const ih = img.naturalHeight || N;
      const scale = Math.max(N / iw, N / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      offCtx.drawImage(img, (N - dw) / 2, (N - dh) / 2, dw, dh);
      imgData = offCtx.getImageData(0, 0, N, N);
    } catch (e) {
      return;
    }
    const px = imgData.data;

    // Pre-compute FFT of each channel
    const Xre = [new Float64Array(N2), new Float64Array(N2), new Float64Array(N2)];
    const Xim = [new Float64Array(N2), new Float64Array(N2), new Float64Array(N2)];
    for (let i = 0; i < N2; i++) {
      Xre[0][i] = px[i * 4]     / 255;
      Xre[1][i] = px[i * 4 + 1] / 255;
      Xre[2][i] = px[i * 4 + 2] / 255;
    }
    for (let c = 0; c < 3; c++) fft2d(Xre[c], Xim[c], N, N, false);

    // Display canvas: render at N×N, CSS upscales to fill the 170px circle.
    canvas.width = N;
    canvas.height = N;
    const ctx = canvas.getContext('2d');
    const out = ctx.createImageData(N, N);
    const outData = out.data;
    for (let i = 0; i < N2; i++) outData[i * 4 + 3] = 255;

    // Working buffers (reused every frame)
    const wRe = new Float64Array(N2);
    const wIm = new Float64Array(N2);
    const mask = new Float64Array(N2);

    // Pre-compute |k|² for every (kx, ky) in FFT-shifted coords (DC at index 0,
    // negative frequencies wrap around). |kx| ∈ [0, N/2], |ky| ∈ [0, N/2].
    const k2 = new Float64Array(N2);
    for (let y = 0; y < N; y++) {
      const fy = (y <= HALF) ? y : y - N;
      for (let x = 0; x < N; x++) {
        const fx = (x <= HALF) ? x : x - N;
        k2[y * N + x] = fx * fx + fy * fy;
      }
    }

    // Hide the crisp <img>; the canvas takes over.
    img.classList.add('is-hidden');

    // σ(t) schedule — exponential growth from σ_min to σ_max (so each
    // doubling of σ doubles the radius of frequencies that pass, matching
    // the way detail "feels" like it's emerging exponentially).
    const SIGMA_MIN = 0.6;
    const SIGMA_MAX = 180;
    const LOG_RATIO = Math.log(SIGMA_MAX / SIGMA_MIN);

    const duration = 3500;
    const t0 = performance.now();

    function frame(now) {
      const p = Math.min((now - t0) / duration, 1);
      const eased = p * p * (3 - 2 * p);                  // smoothstep
      const sigma = SIGMA_MIN * Math.exp(LOG_RATIO * eased);
      const denom = 2 * sigma * sigma;

      // Build current Gaussian mask H_t once — shared across channels
      for (let i = 0; i < N2; i++) {
        mask[i] = Math.exp(-k2[i] / denom);
      }

      for (let c = 0; c < 3; c++) {
        // X · H_t
        for (let i = 0; i < N2; i++) {
          const m = mask[i];
          wRe[i] = Xre[c][i] * m;
          wIm[i] = Xim[c][i] * m;
        }
        // F^{-1}
        fft2d(wRe, wIm, N, N, true);
        // Real part to channel c (clip to [0,255])
        for (let i = 0; i < N2; i++) {
          let v = wRe[i] * 255;
          if (v < 0) v = 0; else if (v > 255) v = 255;
          outData[i * 4 + c] = v;
        }
      }

      ctx.putImageData(out, 0, 0);

      if (p < 1) {
        requestAnimationFrame(frame);
      } else {
        // Crossfade to the crisp <img> for pixel-accurate final state
        img.classList.remove('is-hidden');
      }
    }

    requestAnimationFrame(frame);
  }

  if (img.complete && img.naturalWidth > 0) {
    start();
  } else {
    img.addEventListener('load', start, { once: true });
    img.addEventListener('error', function () { img.classList.remove('is-hidden'); }, { once: true });
  }
})();
