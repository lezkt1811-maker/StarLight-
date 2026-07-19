/* ==========================================================================
   StarChart13 — Tropical Comparison Mode
   STAGE 2: Tropical wheel rendering + tab switching only.
   No Compare tab, no comparison table, no PNG export yet.

   This file never calls, edits, or reads from the existing draw() function.
   It builds its own canvas inside #tropicalWheel and draws independently,
   using only longitudes already computed by Stage 1 (tropical.js) and the
   existing chart calculation in index.html's _doGenerate().

   Relies on these globals that are already declared in index.html's main
   inline <script> block (all classic <script> tags on a page share one
   global scope, so these are readable here by name once the page has run):
     mod, GLYPHS, PLANET_COLOR, TEXT_VS, drawEveGlyph
   Relies on these globals from tropical.js (Stage 1):
     window.buildTropicalChart, window.getTropicalPlacement, etc. (not
     directly needed here since Stage 1 already stored results on
     window.combinedChart, but tropical.js must be loaded first).
   ========================================================================== */

/* Standard tropical zodiac glyphs, index-matched to TROPICAL_SIGNS in tropical.js. */
const SC13T_GLYPHS = ["♈","♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓"];

/* One color per tropical sign, purely a visual choice for this new wheel —
   independent of the existing IAU-constellation color set used by draw(),
   so nothing here can be confused with, or accidentally reuse, StarChart13
   styling. */
const SC13T_SIGN_COLORS = [
  "#ff3b3b", "#c98a3c", "#ffe14d", "#7fd8ff", "#ff8a3d", "#8fd694",
  "#ffb3e0", "#a83232", "#c07bff", "#7ea6ff", "#4ddbff", "#9fffb0"
];

/* renderTropicalWheel(combinedChart, targetElement)
   combinedChart: the object built in Stage 1's _doGenerate() hook
                  (window.combinedChart), containing .tropical.placements,
                  .tropical.ascendant, .tropical.midheaven.
   targetElement: the DOM container to draw into (e.g. #tropicalWheel).
                  This function owns everything inside targetElement; it
                  never reaches outside of it. */
function renderTropicalWheel(combinedChart, targetElement) {
  try {
    if (!targetElement) return;

    if (!combinedChart || !combinedChart.tropical || !combinedChart.tropical.ascendant) {
      targetElement.innerHTML =
        '<div style="padding:24px 12px;color:#f3f3f3;font-family:Arial,sans-serif;' +
        'font-size:14px;text-align:center;">Tropical chart data is not available yet. ' +
        'Tap "Generate Chart" first.</div>';
      return;
    }

    /* Fresh canvas every render — simplest way to guarantee no stale state
       leaks between StarChart13-birth-data changes. */
    targetElement.innerHTML = '<canvas id="cvTropical" style="width:100%;height:auto;display:block;"></canvas>';
    const cv = document.getElementById("cvTropical");
    const dpr = Math.min(4, window.devicePixelRatio || 1);
    const css = targetElement.clientWidth || 900;
    cv.style.width = css + "px";
    cv.style.height = css + "px";
    cv.width = Math.round(css * dpr);
    cv.height = Math.round(css * dpr);
    const ctx = cv.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    const W = css, cx = W / 2, cy = W / 2;

    /* Local-only angle helpers, namespaced with an sc13t prefix so they can
       never collide with draw()'s own local ca()/ptCW() (those live inside
       draw()'s function scope and are untouched by this file). Same visual
       convention as the existing wheel: cw=0 (the Ascendant) is drawn on
       the left, matching Part 5 of the spec. */
    const sc13tCA = cw => Math.PI - cw * (Math.PI / 180);
    const sc13tPt = (r, cw) => ({ x: cx + r * Math.cos(sc13tCA(cw)), y: cy + r * Math.sin(sc13tCA(cw)) });

    const Rmax = W * 0.34;
    const houseTh = W * 0.030;
    const RhO = Rmax, RhI = Rmax - houseTh;
    const signTh = W * 0.108;
    const RsO = RhI, RsI = RsO - signTh;
    const Rin = RsI * 0.95;

    ctx.clearRect(0, 0, W, W);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, W);

    const ascInfo = combinedChart.tropical.ascendant;
    const mcInfo = combinedChart.tropical.midheaven;
    const ascLon = ascInfo.longitude;
    const mcLon = mcInfo.longitude;

    /* cw = clockwise angle from the tropical Ascendant longitude.
       Rotation here only ever affects the VISUAL layout of this canvas —
       the underlying longitudes (ascLon, mcLon, every placement) are never
       altered, per Part 5 of the spec. */
    const tCW = lon => mod(lon - ascLon);
    const mcCW = tCW(mcLon);

    /* ---------- 12 equal houses (equal-house system, house 1 = Ascendant) ---------- */
    for (let hi = 0; hi < 12; hi++) {
      const hS = hi * 30, hE = hS + 30;
      const a1 = sc13tCA(hS), a2 = sc13tCA(hE);
      ctx.beginPath();
      ctx.arc(cx, cy, RhO, a1, a2, true);
      ctx.arc(cx, cy, RhI, a2, a1, false);
      ctx.closePath();
      ctx.fillStyle = (hi % 2 === 0) ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)";
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a1) * RhI, cy + Math.sin(a1) * RhI);
      ctx.lineTo(cx + Math.cos(a1) * RhO, cy + Math.sin(a1) * RhO);
      ctx.strokeStyle = "rgba(0,0,0,.85)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      const pH = sc13tPt((RhO + RhI) / 2, hS + 15);
      ctx.font = "900 " + (W / 55) + "px Arial Black,Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 1.05;
      ctx.strokeStyle = "rgba(0,0,0,.75)";
      ctx.strokeText(String(hi + 1), pH.x, pH.y);
      ctx.fillStyle = "#fff";
      ctx.fillText(String(hi + 1), pH.x, pH.y);
    }
    [RhO, RhI].forEach(function (r) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,.35)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    /* ---------- 12 equal 30° tropical signs, placed by real ecliptic longitude ---------- */
    for (let si = 0; si < 12; si++) {
      const signStart = si * 30, signEnd = signStart + 30;
      const a1 = sc13tCA(tCW(signStart)), a2 = sc13tCA(tCW(signEnd));
      ctx.beginPath();
      ctx.arc(cx, cy, RsO, a1, a2, true);
      ctx.arc(cx, cy, RsI, a2, a1, false);
      ctx.closePath();
      ctx.fillStyle = "#000";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.18)";
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a1) * RsI, cy + Math.sin(a1) * RsI);
      ctx.lineTo(cx + Math.cos(a1) * RsO, cy + Math.sin(a1) * RsO);
      ctx.strokeStyle = "rgba(255,255,255,.55)";
      ctx.lineWidth = Math.max(1.4, W * 0.0026);
      ctx.stroke();

      const pMid = sc13tPt((RsO + RsI) / 2, tCW(signStart + 15));
      const col = SC13T_SIGN_COLORS[si];
      ctx.font = "900 " + (W / 40) + "px 'Segoe UI Symbol','Apple Symbols','DejaVu Sans',serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = Math.max(3, W * 0.006);
      ctx.strokeStyle = "rgba(0,0,0,.90)";
      ctx.strokeText(SC13T_GLYPHS[si], pMid.x, pMid.y);
      ctx.fillStyle = col;
      ctx.fillText(SC13T_GLYPHS[si], pMid.x, pMid.y);
    }
    [RsO, RsI].forEach(function (r) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,.35)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    /* ---------- horizon line + Ascendant marker (always drawn on the left) ---------- */
    ctx.beginPath();
    ctx.moveTo(cx - RhO, cy);
    ctx.lineTo(cx + RhO, cy);
    ctx.strokeStyle = "rgba(255,255,255,.35)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const aLx = cx - (RhO + W * 0.028);
    ctx.font = "900 " + W / 14 + "px Arial Black,Arial";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "rgba(0,0,0,.70)";
    ctx.lineWidth = 2.5;
    ctx.strokeText("As", aLx, cy - W * 0.018);
    ctx.fillText("As", aLx, cy - W * 0.018);
    ctx.font = "900 " + W / 26 + "px Arial,sans-serif";
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.strokeStyle = "rgba(0,0,0,.70)";
    ctx.lineWidth = 2;
    const ascLabel = ascInfo.sign + " " + Math.floor(ascInfo.degree) + "°";
    ctx.strokeText(ascLabel, aLx, cy + W * 0.022);
    ctx.fillText(ascLabel, aLx, cy + W * 0.022);

    /* ---------- Midheaven marker ---------- */
    const mA = sc13tCA(mcCW);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(mA) * Rin, cy + Math.sin(mA) * Rin);
    ctx.lineTo(cx + Math.cos(mA) * RhO, cy + Math.sin(mA) * RhO);
    ctx.strokeStyle = "rgba(255,255,255,.30)";
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    const mLr = RhO + W * 0.028;
    const mLx = cx + Math.cos(mA) * mLr, mLy = cy + Math.sin(mA) * mLr;
    ctx.font = "700 " + W / 22 + "px Arial,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "rgba(0,0,0,.70)";
    ctx.lineWidth = 1.5;
    ctx.strokeText("Mc", mLx, mLy);
    ctx.fillText("Mc", mLx, mLy);
    const mDegR = RhO + W * 0.072;
    const mDegX = cx + Math.cos(mA) * mDegR, mDegY = cy + Math.sin(mA) * mDegR;
    ctx.font = "700 " + W / 36 + "px Arial,sans-serif";
    ctx.fillStyle = "rgba(255,255,255,.80)";
    ctx.strokeText(Math.floor(mcInfo.degree) + "°", mDegX, mDegY);
    ctx.fillText(Math.floor(mcInfo.degree) + "°", mDegX, mDegY);

    /* ---------- planet glyphs + degree labels (Stage 1 tropical data only) ---------- */
    const placements = combinedChart.tropical.placements || {};
    const bodyNames = Object.keys(placements).filter(function (n) {
      return n !== "Ascendant" && n !== "MC" && n !== "IC";
    });

    bodyNames.forEach(function (name) {
      const p = placements[name];
      if (typeof p.longitude !== "number") return;
      const a = sc13tCA(tCW(p.longitude));
      const symSz = W / 16;
      const dotX = cx + Math.cos(a) * RhI, dotY = cy + Math.sin(a) * RhI;
      const tickX = cx + Math.cos(a) * RhO, tickY = cy + Math.sin(a) * RhO;
      const lx = cx + Math.cos(a) * (RhO + W * 0.075), ly = cy + Math.sin(a) * (RhO + W * 0.09);
      const col = (typeof PLANET_COLOR !== "undefined" && PLANET_COLOR[name]) || "#fff";

      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.0;
      ctx.beginPath(); ctx.moveTo(dotX, dotY); ctx.lineTo(tickX, tickY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(tickX, tickY); ctx.lineTo(lx, ly); ctx.stroke();
      ctx.globalAlpha = 1;

      const glyph = (typeof GLYPHS !== "undefined" && GLYPHS[name]) || name[0];
      const vs = (typeof TEXT_VS !== "undefined") ? TEXT_VS : "";
      if (name === "Eve" && typeof drawEveGlyph === "function") {
        drawEveGlyph(ctx, lx, ly, symSz * 0.62, col);
      } else {
        ctx.font = "900 " + symSz + "px 'Segoe UI Symbol','Apple Symbols','DejaVu Sans',serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(0,0,0,.85)";
        ctx.strokeText(glyph + vs, lx, ly);
        ctx.fillStyle = col;
        ctx.fillText(glyph + vs, lx, ly);
      }

      const rxLabel = p.rx ? " R" : "";
      const degLabel = Math.floor(p.degree) + "°" + rxLabel;
      ctx.font = "900 " + W / 44 + "px Arial Black,Arial";
      ctx.fillStyle = col;
      ctx.strokeStyle = "rgba(0,0,0,.80)";
      ctx.lineWidth = 1.5;
      ctx.textAlign = "center";
      ctx.strokeText(degLabel, lx, ly + symSz * 0.62);
      ctx.fillText(degLabel, lx, ly + symSz * 0.62);
    });

    /* ---------- clear center + labels ---------- */
    ctx.beginPath();
    ctx.arc(cx, cy, Rin, 0, Math.PI * 2);
    ctx.fillStyle = "#000";
    ctx.fill();

    ctx.font = "700 " + (W / 22) + "px Arial,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.fillText("Tropical", cx, cy);

    /* Required label per spec: never say Placidus unless it's actually implemented. */
    ctx.font = "700 " + Math.max(8, W * 0.016) + "px Arial,sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 0.85;
    ctx.fillText("Tropical Equal-House Chart", W * 0.018, W * 0.01);
    ctx.globalAlpha = 1;
  } catch (renderErr) {
    console.error("renderTropicalWheel failed — StarChart13 wheel is unaffected:", renderErr);
    if (targetElement) {
      targetElement.innerHTML =
        '<div style="padding:24px 12px;color:#f88;font-family:Arial,sans-serif;' +
        'font-size:14px;text-align:center;">Could not render the Tropical wheel. ' +
        'Your StarChart13 chart is unaffected.</div>';
    }
  }
}

/* sc13ShowChartTab(which)
   which: "starchart13" | "tropical"
   Toggles which wheel container is visible. Never touches #out, #outAsp,
   #dbg, #big3, payment, or referral elements. */
function sc13ShowChartTab(which) {
  const wheelBox = document.getElementById("wheelBox");
  const tropicalDiv = document.getElementById("tropicalWheel");
  const btnSC13 = document.getElementById("sc13TabBtnStarChart13");
  const btnTrop = document.getElementById("sc13TabBtnTropical");
  if (!wheelBox || !tropicalDiv || !btnSC13 || !btnTrop) return;

  window.sc13ActiveChartTab = which;

  const activeStyle = { bg: "#ffe600", fg: "#000", border: "rgba(255,230,0,.5)" };
  const inactiveStyle = { bg: "transparent", fg: "#fff", border: "rgba(255,255,255,.3)" };

  function applyBtnStyle(btn, s) {
    btn.style.background = s.bg;
    btn.style.color = s.fg;
    btn.style.borderColor = s.border;
  }

  if (which === "tropical") {
    wheelBox.style.display = "none";
    tropicalDiv.style.display = "flex";
    applyBtnStyle(btnTrop, activeStyle);
    applyBtnStyle(btnSC13, inactiveStyle);

    if (window.combinedChart && window.combinedChart.tropical) {
      renderTropicalWheel(window.combinedChart, tropicalDiv);
    } else {
      tropicalDiv.innerHTML =
        '<div style="padding:24px 12px;color:#f3f3f3;font-family:Arial,sans-serif;' +
        'font-size:14px;text-align:center;">Tap "Generate Chart" first to see your Tropical wheel.</div>';
    }
  } else {
    tropicalDiv.style.display = "none";
    wheelBox.style.display = "flex";
    applyBtnStyle(btnSC13, activeStyle);
    applyBtnStyle(btnTrop, inactiveStyle);
  }
}

/* Optional hook: if the Tropical tab happens to already be open when the
   user regenerates the chart, refresh it. Index.html calls this function
   only if it exists (typeof check), so nothing breaks if this file isn't
   loaded for any reason. */
window.sc13OnChartGenerated = function () {
  if (window.sc13ActiveChartTab === "tropical") {
    const tropicalDiv = document.getElementById("tropicalWheel");
    if (tropicalDiv && window.combinedChart) {
      renderTropicalWheel(window.combinedChart, tropicalDiv);
    }
  }
};

if (typeof window !== "undefined") {
  window.renderTropicalWheel = renderTropicalWheel;
  window.sc13ShowChartTab = sc13ShowChartTab;
}
