/* ==========================================================================
   StarChart13 — Tropical Comparison Mode
   RESTYLE PASS (after Stage 2): visual style only.

   No calculation changes. No tab-behavior changes. No Compare tab, no
   export. This file still exposes exactly the same two functions Stage 2
   exposed (renderTropicalWheel, sc13ShowChartTab) with the same
   signatures, so index.html's hooks from Stage 1/2 keep working unchanged.

   Style target: a plain, white-background, black-line, traditional
   tropical natal chart -- deliberately NOT visually related to the
   colorful StarChart13 wheel. No neon, no glow, no dark background.

   Relies on the same shared globals as before:
     mod, GLYPHS, TEXT_VS, drawEveGlyph, getAspects, getOrb, packAnglesOnRing
   (all declared top-level in index.html's main inline <script>, and thus
   visible here by bare name once the page has run -- draw() itself is
   never called or referenced).
   ========================================================================== */

const SC13T_GLYPHS = ["♈","♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓"];

/* Traditional, muted, non-neon planet palette -- intentionally different
   from the RAINBOW-derived PLANET_COLOR used by the StarChart13 wheel, so
   nothing here is visually copied from it. */
const SC13T_PLANET_COLOR = {
  Sun: "#b8860b",
  Moon: "#5a5a5a",
  Mercury: "#8a6d00",
  Venus: "#2e7d32",
  Mars: "#b02020",
  Jupiter: "#1a4fa0",
  Saturn: "#3a3a3a",
  Uranus: "#0f7d7d",
  Neptune: "#1a5f8a",
  Pluto: "#6a2c2c",
  NorthNode: "#555555",
  SouthNode: "#555555",
  Chiron: "#6a3fa0",
  BlackMoonLilith: "#5a2d6d",
  Eve: "#a04060",
  PartOfFortune: "#8a7000",
  PartOfSpirit: "#3a5a8a"
};

/* Traditional aspect coloring: blue = harmonious, red = challenging,
   neutral gray = conjunction (neither harmonious nor challenging). */
const SC13T_ASPECT_COLOR = {
  Conjunction: "#8a8a8a",
  Opposition: "#b03030",
  Square: "#b03030",
  Trine: "#2a4fa0",
  Sextile: "#2a4fa0"
};

/* renderTropicalWheel(combinedChart, targetElement)
   Same signature as Stage 2. Draws a plain, white, traditional-style
   tropical wheel into targetElement, using only longitudes already
   computed by tropical.js / index.html's existing chart calculation. */
function renderTropicalWheel(combinedChart, targetElement) {
  try {
    if (!targetElement) return;

    if (!combinedChart || !combinedChart.tropical || !combinedChart.tropical.ascendant) {
      targetElement.innerHTML =
        '<div style="padding:24px 12px;color:#333;background:#fff;font-family:Arial,sans-serif;' +
        'font-size:14px;text-align:center;">Tropical chart data is not available yet. ' +
        'Tap "Generate Chart" first.</div>';
      return;
    }

    targetElement.innerHTML = '<canvas id="cvTropical" style="width:100%;height:auto;display:block;background:#fff;"></canvas>';
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

    const sc13tCA = cw => Math.PI - cw * (Math.PI / 180);
    const sc13tPt = (r, cw) => ({ x: cx + r * Math.cos(sc13tCA(cw)), y: cy + r * Math.sin(sc13tCA(cw)) });

    /* Smaller Rmax than Stage 2's neon version, to leave generous padding
       for outer labels/ticks so nothing gets cropped on small screens. */
    const Rmax = W * 0.30;
    const houseTh = W * 0.026;
    const RhO = Rmax, RhI = Rmax - houseTh;
    const signTh = W * 0.075;
    const RsO = RhI, RsI = RsO - signTh;
    const Rin = RsI * 0.90;

    ctx.clearRect(0, 0, W, W);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, W);

    const ascInfo = combinedChart.tropical.ascendant;
    const mcInfo = combinedChart.tropical.midheaven;
    const ascLon = ascInfo.longitude;
    const mcLon = mcInfo.longitude;

    const tCW = lon => mod(lon - ascLon);
    const mcCW = tCW(mcLon);

    /* ---------- 12 equal houses: thin black lines + black numbers ---------- */
    for (let hi = 0; hi < 12; hi++) {
      const hS = hi * 30, hE = hS + 30;
      const a1 = sc13tCA(hS);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a1) * RhI, cy + Math.sin(a1) * RhI);
      ctx.lineTo(cx + Math.cos(a1) * RhO, cy + Math.sin(a1) * RhO);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 0.9;
      ctx.stroke();

      const pH = sc13tPt((RhO + RhI) / 2, hS + 15);
      ctx.font = "600 " + (W / 60) + "px Arial,sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#000000";
      ctx.fillText(String(hi + 1), pH.x, pH.y);
    }
    [RhO, RhI].forEach(function (r) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    /* ---------- 12 equal 30° tropical signs: thin black boundaries, tick marks, black glyphs ---------- */
    for (let si = 0; si < 12; si++) {
      const signStart = si * 30, signEnd = signStart + 30;
      const a1 = sc13tCA(tCW(signStart));
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a1) * RsI, cy + Math.sin(a1) * RsI);
      ctx.lineTo(cx + Math.cos(a1) * RsO, cy + Math.sin(a1) * RsO);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 0.9;
      ctx.stroke();

      const pMid = sc13tPt((RsO + RsI) / 2, tCW(signStart + 15));
      ctx.font = "500 " + (W / 42) + "px 'Segoe UI Symbol','Apple Symbols','DejaVu Sans',serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#000000";
      ctx.fillText(SC13T_GLYPHS[si], pMid.x, pMid.y);
    }
    [RsO, RsI].forEach(function (r) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    /* small black degree ticks around the zodiac ring, every 5°, thicker every 10°/30° */
    for (let td = 0; td < 360; td += 5) {
      const a = sc13tCA(tCW(td));
      let tl, tw;
      if (td % 30 === 0) { tl = W * 0.014; tw = 1.1; }
      else if (td % 10 === 0) { tl = W * 0.009; tw = 0.8; }
      else { tl = W * 0.005; tw = 0.6; }
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * RsI, cy + Math.sin(a) * RsI);
      ctx.lineTo(cx + Math.cos(a) * (RsI - tl), cy + Math.sin(a) * (RsI - tl));
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = tw;
      ctx.stroke();
    }

    /* ---------- horizon line + Ascendant marker (left side, clamped to stay on-canvas) ---------- */
    ctx.beginPath();
    ctx.moveTo(cx - RhO, cy);
    ctx.lineTo(cx + RhO, cy);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;
    ctx.stroke();

    let aLx = cx - (RhO + W * 0.028);
    aLx = Math.max(aLx, W * 0.05);
    ctx.font = "700 " + (W / 20) + "px Arial,sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#000000";
    ctx.fillText("As", aLx, cy - W * 0.020);
    ctx.font = "500 " + (W / 34) + "px Arial,sans-serif";
    const ascLabel = ascInfo.sign + " " + Math.floor(ascInfo.degree) + "\u00B0";
    ctx.fillText(ascLabel, aLx, cy + W * 0.018);

    /* ---------- Midheaven marker ---------- */
    const mA = sc13tCA(mcCW);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(mA) * Rin, cy + Math.sin(mA) * Rin);
    ctx.lineTo(cx + Math.cos(mA) * RhO, cy + Math.sin(mA) * RhO);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 0.8;
    ctx.setLineDash([3, 2]);
    ctx.stroke();
    ctx.setLineDash([]);

    const mLr = RhO + W * 0.026;
    let mLx = cx + Math.cos(mA) * mLr, mLy = cy + Math.sin(mA) * mLr;
    mLx = Math.min(Math.max(mLx, W * 0.05), W * 0.95);
    ctx.font = "700 " + (W / 26) + "px Arial,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#000000";
    ctx.fillText("Mc", mLx, mLy);
    const mDegR = RhO + W * 0.062;
    let mDegX = cx + Math.cos(mA) * mDegR, mDegY = cy + Math.sin(mA) * mDegR;
    mDegX = Math.min(Math.max(mDegX, W * 0.05), W * 0.95);
    ctx.font = "500 " + (W / 40) + "px Arial,sans-serif";
    ctx.fillText(Math.floor(mcInfo.degree) + "\u00B0", mDegX, mDegY);

    /* ---------- traditional aspect lines (blue = harmonious, red = challenging) ----------
       Uses the same getAspects() logic already used by the existing StarChart13 chart --
       no new aspect math is introduced here, only a different color mapping for display. */
    const placements = combinedChart.tropical.placements || {};
    const aspectBodies = Object.keys(placements)
      .filter(function (n) { return n !== "IC"; })
      .map(function (n) { return { name: n, lon: placements[n].longitude }; });

    let aspectAll = [];
    if (typeof getAspects === "function" && aspectBodies.length > 1) {
      try { aspectAll = getAspects(aspectBodies) || []; } catch (aspErr) { aspectAll = []; }
    }

    if (aspectAll.length) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, Rin - 1, 0, Math.PI * 2);
      ctx.clip();
      const rE = Rin - 2;
      ctx.lineCap = "round";
      aspectAll.forEach(function (a) {
        const cw1 = tCW(a.p1.lon), cw2 = tCW(a.p2.lon);
        const a1 = sc13tCA(cw1), a2 = sc13tCA(cw2);
        const x1 = cx + Math.cos(a1) * rE, y1 = cy + Math.sin(a1) * rE;
        const x2 = cx + Math.cos(a2) * rE, y2 = cy + Math.sin(a2) * rE;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = SC13T_ASPECT_COLOR[a.asp.name] || "#999999";
        ctx.lineWidth = 0.7;
        ctx.globalAlpha = 0.75;
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    /* ---------- planet glyphs + degree labels, collision-avoided ----------
       Reuses the existing packAnglesOnRing() helper already used by the
       StarChart13 wheel for label placement -- same overlap-prevention
       technique, just applied to the tropical layout. */
    const bodyNames = Object.keys(placements).filter(function (n) {
      return n !== "Ascendant" && n !== "MC" && n !== "IC";
    });

    const sorted = bodyNames
      .map(function (name) {
        const p = placements[name];
        return { name: name, lon: p.longitude, rx: !!p.rx, degree: p.degree, cw: tCW(p.longitude) };
      })
      .sort(function (a, b) { return a.cw - b.cw; });

    let packed = sorted.map(function (p) { return p.cw; });
    if (typeof packAnglesOnRing === "function" && sorted.length > 1) {
      try { packed = packAnglesOnRing(sorted.map(function (p) { return p.cw; }), 9, 45); }
      catch (packErr) { packed = sorted.map(function (p) { return p.cw; }); }
    }

    sorted.forEach(function (p, idx) { p.disp = packed[idx]; });

    sorted.forEach(function (p) {
      const eA = sc13tCA(p.cw);
      const dA = sc13tCA(p.disp);
      const symSz = W / 22;
      const dotX = cx + Math.cos(eA) * RhI, dotY = cy + Math.sin(eA) * RhI;
      const tickX = cx + Math.cos(eA) * RhO, tickY = cy + Math.sin(eA) * RhO;
      let lx = cx + Math.cos(dA) * (RhO + W * 0.060), ly = cy + Math.sin(dA) * (RhO + W * 0.070);
      lx = Math.min(Math.max(lx, W * 0.06), W * 0.94);
      ly = Math.min(Math.max(ly, W * 0.06), W * 0.94);

      /* thin black leader line from ring to label -- traditional style, no glow */
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 0.6;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(dotX, dotY);
      ctx.lineTo(tickX, tickY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(tickX, tickY);
      ctx.lineTo(lx, ly);
      ctx.stroke();
      ctx.globalAlpha = 1;

      const col = SC13T_PLANET_COLOR[p.name] || "#000000";
      const glyph = (typeof GLYPHS !== "undefined" && GLYPHS[p.name]) || p.name[0];
      const vs = (typeof TEXT_VS !== "undefined") ? TEXT_VS : "";

      if (p.name === "Eve" && typeof drawEveGlyph === "function") {
        drawEveGlyph(ctx, lx, ly, symSz * 0.7, col);
      } else {
        ctx.font = "700 " + symSz + "px 'Segoe UI Symbol','Apple Symbols','DejaVu Sans',serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = col;
        ctx.fillText(glyph + vs, lx, ly);
      }

      const rxLabel = p.rx ? " R" : "";
      const degLabel = Math.floor(p.degree) + "\u00B0" + rxLabel;
      ctx.font = "500 " + (W / 60) + "px Arial,sans-serif";
      ctx.fillStyle = p.rx ? "#b03030" : "#333333";
      ctx.textAlign = "center";
      ctx.fillText(degLabel, lx, ly + symSz * 0.62);
    });

    /* ---------- clean white center + small chart-info text ---------- */
    ctx.beginPath();
    ctx.arc(cx, cy, Rin, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 0.8;
    ctx.stroke();

    const person = combinedChart.person || {};
    const infoLines = [];
    if (person.name) infoLines.push(person.name);
    const dateTimeLine = [person.birthDate, person.birthTime].filter(Boolean).join("  ");
    if (dateTimeLine) infoLines.push(dateTimeLine);
    if (person.birthplace) infoLines.push(person.birthplace);
    infoLines.push("Tropical Equal-House Chart");

    ctx.font = "600 " + Math.max(8, W * 0.018) + "px Arial,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#000000";
    const lineH = Math.max(10, W * 0.024);
    const startY = cy - ((infoLines.length - 1) * lineH) / 2;
    infoLines.forEach(function (ln, i) {
      if (i === infoLines.length - 1) {
        ctx.font = "400 " + Math.max(7, W * 0.014) + "px Arial,sans-serif";
        ctx.fillStyle = "#555555";
      } else if (i === 0) {
        ctx.font = "700 " + Math.max(9, W * 0.019) + "px Arial,sans-serif";
        ctx.fillStyle = "#000000";
      } else {
        ctx.font = "400 " + Math.max(8, W * 0.016) + "px Arial,sans-serif";
        ctx.fillStyle = "#333333";
      }
      ctx.fillText(ln, cx, startY + i * lineH);
    });
  } catch (renderErr) {
    console.error("renderTropicalWheel failed — StarChart13 wheel is unaffected:", renderErr);
    if (targetElement) {
      targetElement.innerHTML =
        '<div style="padding:24px 12px;color:#900;background:#fff;font-family:Arial,sans-serif;' +
        'font-size:14px;text-align:center;">Could not render the Tropical wheel. ' +
        'Your StarChart13 chart is unaffected.</div>';
    }
  }
}

/* sc13ShowChartTab(which) — unchanged behavior from Stage 2, same signature. */
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
        '<div style="padding:24px 12px;color:#333;background:#fff;font-family:Arial,sans-serif;' +
        'font-size:14px;text-align:center;">Tap "Generate Chart" first to see your Tropical wheel.</div>';
    }
  } else {
    tropicalDiv.style.display = "none";
    wheelBox.style.display = "flex";
    applyBtnStyle(btnSC13, activeStyle);
    applyBtnStyle(btnTrop, inactiveStyle);
  }
}

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
