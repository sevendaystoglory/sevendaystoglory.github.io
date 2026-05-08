// Diffusion-style reveal of the profile photo.
//
// Math: at each animation frame we render the forward DDPM marginal
//
//   x_t = sqrt(α̅_t) · x_0  +  sqrt(1 − α̅_t) · ε,   ε ~ N(0, I)
//
// with x_0 the photo's pixels mapped to [-1, 1], and α̅_t given by the
// Nichol–Dhariwal cosine schedule:
//
//   α̅(u) = cos²((u + s) / (1 + s) · π/2) / cos²(s / (1 + s) · π/2),  s = 0.008
//
// We animate the diffusion timestep ratio u from 1 → 0 over ~3.5s.
// At u=1, α̅≈0 → image is pure Gaussian noise.
// At u=0, α̅≈1 → image equals x_0 (the original photo).
// Then we crossfade to the crisp <img> for accessibility / sharpness.

(function () {
  if (!window.requestAnimationFrame) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const img = document.querySelector('.sidebar-photo');
  const canvas = document.querySelector('.sidebar-photo-canvas');
  if (!img || !canvas) return;

  function start() {
    const w = img.clientWidth || 170;
    const h = img.clientHeight || 170;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Read x_0 from an offscreen canvas
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const offCtx = off.getContext('2d');
    try {
      offCtx.drawImage(img, 0, 0, w, h);
    } catch (e) {
      return; // tainted canvas — skip animation
    }
    let x0;
    try {
      x0 = offCtx.getImageData(0, 0, w, h);
    } catch (e) {
      return;
    }
    const x0Data = x0.data;
    const N = w * h;

    // Hide the <img>; let the canvas do the work
    img.classList.add('is-hidden');

    // Output buffer reused every frame
    const out = ctx.createImageData(w, h);
    const outData = out.data;

    // Cosine-schedule cumulative α̅(u), u = t/T ∈ [0,1]
    const sShift = 0.008;
    const f0 = Math.cos((sShift / (1 + sShift)) * Math.PI / 2);
    const f0sq = f0 * f0;
    function alphaBar(u) {
      const c = Math.cos(((u + sShift) / (1 + sShift)) * Math.PI / 2);
      return (c * c) / f0sq;
    }

    // Smoothstep ease for the time progression — feels nicer than linear
    function ease(p) { return p * p * (3 - 2 * p); }

    const duration = 3500;
    const t0 = performance.now();

    function frame(now) {
      const p = Math.min((now - t0) / duration, 1);
      const u = 1 - ease(p); // diffusion time goes T → 0
      const ab = alphaBar(u);
      const a = Math.sqrt(ab);
      const b = Math.sqrt(Math.max(0, 1 - ab));

      // Box–Muller produces two N(0,1) samples per pair of uniforms.
      // We sample fresh noise every frame so the image visibly "shimmers"
      // toward the clean photo, matching the marginal distribution at each t.
      let pending = 0, paired = 0;

      for (let i = 0; i < N; i++) {
        const j = i << 2;

        // Three independent N(0,1) per pixel (R,G,B)
        let n0, n1, n2;
        if (paired) {
          n0 = pending; paired = 0;
        } else {
          let u1 = Math.random(); if (u1 < 1e-7) u1 = 1e-7;
          const u2 = Math.random();
          const mag = Math.sqrt(-2 * Math.log(u1));
          const ang = 2 * Math.PI * u2;
          n0 = mag * Math.cos(ang);
          pending = mag * Math.sin(ang);
          paired = 1;
        }
        if (paired) {
          n1 = pending; paired = 0;
        } else {
          let u1 = Math.random(); if (u1 < 1e-7) u1 = 1e-7;
          const u2 = Math.random();
          const mag = Math.sqrt(-2 * Math.log(u1));
          const ang = 2 * Math.PI * u2;
          n1 = mag * Math.cos(ang);
          pending = mag * Math.sin(ang);
          paired = 1;
        }
        if (paired) {
          n2 = pending; paired = 0;
        } else {
          let u1 = Math.random(); if (u1 < 1e-7) u1 = 1e-7;
          const u2 = Math.random();
          const mag = Math.sqrt(-2 * Math.log(u1));
          const ang = 2 * Math.PI * u2;
          n2 = mag * Math.cos(ang);
          pending = mag * Math.sin(ang);
          paired = 1;
        }

        // x_0 in [-1, 1]
        const r0 = x0Data[j]     / 127.5 - 1;
        const g0 = x0Data[j + 1] / 127.5 - 1;
        const bl = x0Data[j + 2] / 127.5 - 1;

        // Forward marginal x_t
        const rt = a * r0 + b * n0;
        const gt = a * g0 + b * n1;
        const bt = a * bl + b * n2;

        // Map back to [0, 255] with clipping
        let rv = (rt + 1) * 127.5;  if (rv < 0) rv = 0; else if (rv > 255) rv = 255;
        let gv = (gt + 1) * 127.5;  if (gv < 0) gv = 0; else if (gv > 255) gv = 255;
        let bv = (bt + 1) * 127.5;  if (bv < 0) bv = 0; else if (bv > 255) bv = 255;

        outData[j]     = rv;
        outData[j + 1] = gv;
        outData[j + 2] = bv;
        outData[j + 3] = 255;
      }

      ctx.putImageData(out, 0, 0);

      if (p < 1) {
        requestAnimationFrame(frame);
      } else {
        // Crossfade to the original <img> for crisp final pixels
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
