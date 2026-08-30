/*!
 * StarChart13 — Gold Sparkle Starfield
 * A lightweight fixed canvas background: real per-star twinkle (not a static CSS pattern),
 * plus occasional 4-point glint flares for a genuine "glittering gold" feel.
 * High-DPI safe. No dependencies.
 */
(function () {
  "use strict";

  const canvas = document.createElement("canvas");
  canvas.id = "sc13SparkleCanvas";
  canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;z-index:-2;pointer-events:none;";
  document.body.insertBefore(canvas, document.body.firstChild);
  const ctx = canvas.getContext("2d");

  const GOLD_TONES = ["#d9a636", "#fad173", "#b06204", "#fff1b9", "#9a6721", "#fdecc1"];

  let stars = [];
  let W = 0, H = 0, dpr = 1;

  function rand(a, b) { return a + Math.random() * (b - a); }

  function buildStars() {
    const count = Math.round((W * H) / 6500); // density scales with screen size
    stars = [];
    for (let i = 0; i < count; i++) {
      const isGlint = Math.random() < 0.06; // ~6% of stars occasionally flare
      stars.push({
        x: rand(0, W),
        y: rand(0, H),
        r: isGlint ? rand(1.4, 2.2) : rand(0.5, 1.4),
        baseAlpha: rand(0.35, 0.9),
        phase: rand(0, Math.PI * 2),
        speed: rand(0.4, 1.3),
        color: GOLD_TONES[(Math.random() * GOLD_TONES.length) | 0],
        isGlint: isGlint,
        glintPhase: rand(0, Math.PI * 2),
        glintSpeed: rand(0.15, 0.35)
      });
    }
  }

  function resize() {
    dpr = Math.min(2.5, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildStars();
  }

  function drawGlint(s, x, y, alpha) {
    // 4-point sparkle cross for the "glitter" moments
    const len = s.r * 7 * alpha;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 0.8;
    ctx.shadowColor = s.color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(x - len, y); ctx.lineTo(x + len, y);
    ctx.moveTo(x, y - len); ctx.lineTo(x, y + len);
    ctx.stroke();
    ctx.restore();
  }

  let t0 = performance.now();
  function frame(now) {
    const dt = (now - t0) / 1000;
    t0 = now;
    ctx.clearRect(0, 0, W, H);
    for (const s of stars) {
      s.phase += dt * s.speed;
      const tw = (Math.sin(s.phase) + 1) / 2; // 0..1
      const alpha = s.baseAlpha * (0.45 + tw * 0.55);

      ctx.beginPath();
      ctx.fillStyle = s.color;
      ctx.globalAlpha = alpha;
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      if (s.isGlint) {
        s.glintPhase += dt * s.glintSpeed;
        const g = Math.pow((Math.sin(s.glintPhase) + 1) / 2, 6); // sharp occasional peak
        if (g > 0.35) drawGlint(s, s.x, s.y, g);
      }
    }
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(frame);
})();
