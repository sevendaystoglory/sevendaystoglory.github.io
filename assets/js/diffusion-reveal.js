// Phase-retrieval reveal of the profile photo.
//
// Setup: let X[k] = |X[k]| · e^{i θ_true[k]} be the 2D DFT of the photo.
// Pick a Hermitian-symmetric random phase field θ_rand[k] (so the inverse
// FFT stays real-valued).  Define the time-varying spectrum
//
//     X_t[k] = |X[k]| · exp( i · θ_t[k] ),
//     θ_t[k] = θ_rand[k] + s(t) · Δθ[k],   Δθ = shortest-arc(θ_true − θ_rand)
//
// where s(t) ∈ [0,1] is a smoothstep ease.  Then the displayed frame is
//
//     x(t) = Re{ F^{−1}{ X_t } }
//
// Endpoints: at s=0, magnitude is exactly |X[k]| but phases are random →
// "textured noise" with the photo's exact spatial-frequency statistics.
// At s=1, X_t = X exactly → photo.  In between, phases continuously rotate
// toward truth on the unit circle ("phasing into focus") — this is the
// classical phase-retrieval picture from optics / X-ray crystallography.
//
// Hermitian symmetry: θ_rand[−k] ≡ −θ_rand[k] (mod 2π), and self-conjugate
// bins (DC, Nyquist) keep their original real phase 0 or π.  Without this
// the inverse FFT would have a non-zero imaginary part.

(function () {
  if (!window.requestAnimationFrame) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const img = document.querySelector('.sidebar-photo');
  const canvas = document.querySelector('.sidebar-photo-canvas');
  if (!img || !canvas) return;

  const N = 128;
  const N2 = N * N;
  const HALF = N >> 1;
  const TWO_PI = 2 * Math.PI;

  // -------- in-place radix-2 Cooley–Tukey 1D FFT --------------------
  function fft1d(re, im, n, inverse) {
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
      const ang = sign * TWO_PI / len;
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

  function fft2d(re, im, w, h, inverse) {
    const lineRe = new Float64Array(Math.max(w, h));
    const lineIm = new Float64Array(Math.max(w, h));
    for (let y = 0; y < h; y++) {
      const off = y * w;
      for (let x = 0; x < w; x++) { lineRe[x] = re[off + x]; lineIm[x] = im[off + x]; }
      fft1d(lineRe, lineIm, w, inverse);
      for (let x = 0; x < w; x++) { re[off + x] = lineRe[x]; im[off + x] = lineIm[x]; }
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) { lineRe[y] = re[y * w + x]; lineIm[y] = im[y * w + x]; }
      fft1d(lineRe, lineIm, h, inverse);
      for (let y = 0; y < h; y++) { re[y * w + x] = lineRe[y]; im[y * w + x] = lineIm[y]; }
    }
  }

  function start() {
    const off = document.createElement('canvas');
    off.width = N;
    off.height = N;
    const offCtx = off.getContext('2d');

    let imgData;
    try {
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

    // ---- One-time prep: per channel compute |X|, θ_true, θ_rand, Δθ -----
    const magX       = [new Float64Array(N2), new Float64Array(N2), new Float64Array(N2)];
    const thetaStart = [new Float64Array(N2), new Float64Array(N2), new Float64Array(N2)];
    const thetaDelta = [new Float64Array(N2), new Float64Array(N2), new Float64Array(N2)];

    const tmpRe = new Float64Array(N2);
    const tmpIm = new Float64Array(N2);

    for (let c = 0; c < 3; c++) {
      // Load channel as real signal
      for (let i = 0; i < N2; i++) {
        tmpRe[i] = px[i * 4 + c] / 255;
        tmpIm[i] = 0;
      }
      // X = F{x_0}
      fft2d(tmpRe, tmpIm, N, N, false);

      // Cache magnitude and true phase
      const mag = magX[c];
      const tt = new Float64Array(N2);
      for (let i = 0; i < N2; i++) {
        const r = tmpRe[i], im = tmpIm[i];
        mag[i] = Math.sqrt(r * r + im * im);
        tt[i] = Math.atan2(im, r);
      }

      // Generate Hermitian-symmetric random phases.
      const tr = thetaStart[c];
      const visited = new Uint8Array(N2);
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const idx = y * N + x;
          if (visited[idx]) continue;
          const cy = (N - y) % N;
          const cx = (N - x) % N;
          const conj = cy * N + cx;
          if (idx === conj) {
            // Self-conjugate (DC, Nyquist) — phase must be 0 or π. Keep truth.
            tr[idx] = tt[idx];
          } else {
            const ang = (Math.random() * 2 - 1) * Math.PI;
            tr[idx] = ang;
            tr[conj] = -ang;
            visited[conj] = 1;
          }
          visited[idx] = 1;
        }
      }

      // Δθ = shortest-arc(θ_true − θ_rand) so phases rotate the short way
      const td = thetaDelta[c];
      for (let i = 0; i < N2; i++) {
        let d = tt[i] - tr[i];
        if (d > Math.PI) d -= TWO_PI;
        else if (d < -Math.PI) d += TWO_PI;
        td[i] = d;
      }
    }

    // ---- Display setup ---------------------------------------------------
    canvas.width = N;
    canvas.height = N;
    const ctx = canvas.getContext('2d');
    const out = ctx.createImageData(N, N);
    const outData = out.data;
    for (let i = 0; i < N2; i++) outData[i * 4 + 3] = 255;

    const wRe = new Float64Array(N2);
    const wIm = new Float64Array(N2);

    img.classList.add('is-hidden');

    const duration = 3500;
    const t0 = performance.now();

    function frame(now) {
      const p = Math.min((now - t0) / duration, 1);
      const s = p * p * (3 - 2 * p); // smoothstep

      for (let c = 0; c < 3; c++) {
        const mag = magX[c];
        const tr  = thetaStart[c];
        const td  = thetaDelta[c];
        for (let i = 0; i < N2; i++) {
          const theta = tr[i] + s * td[i];
          const m = mag[i];
          wRe[i] = m * Math.cos(theta);
          wIm[i] = m * Math.sin(theta);
        }
        fft2d(wRe, wIm, N, N, true);
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
