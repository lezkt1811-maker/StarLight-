/*!
 * StarChart13 — Ecliptic Sky View
 * Modular, self-contained astronomy visualization component.
 * Depends on: astronomy-engine (window.Astronomy), loaded via CDN.
 * Exposes: window.SC13Ecliptic { init, setBirthData, highlightPlanet, centerOnSun, reset, destroy }
 *
 * Design intent: this is a horizontal strip of the ECLIPTIC ONLY — not a full sky dome.
 * No stars, no horizon grid, no non-zodiac constellations. Just the 13 real zodiac
 * constellations laid out along the ecliptic, with the Sun/Moon/planets placed at their
 * true astronomical longitude for a given moment.
 */
(function (global) {
  "use strict";

  // ---- Same 13-constellation IAU ecliptic boundaries used by the StarChart13 natal wheel ----
  // lo = starting ecliptic longitude (deg), span = width (deg). Kept in sync intentionally
  // so this view and the natal wheel always agree on where constellation lines fall.
  const IAU13 = [
    { n: "Aries",       s: "\u2648", lo: 29.32,  span: 24 },
    { n: "Taurus",      s: "\u2649", lo: 53.32,  span: 38 },
    { n: "Gemini",      s: "\u264A", lo: 91.32,  span: 27 },
    { n: "Cancer",      s: "\u264B", lo: 118.32, span: 21 },
    { n: "Leo",         s: "\u264C", lo: 139.32, span: 35 },
    { n: "Virgo",       s: "\u264D", lo: 174.32, span: 44 },
    { n: "Libra",       s: "\u264E", lo: 218.32, span: 23 },
    { n: "Scorpio",     s: "\u264F", lo: 241.32, span: 6.18 },
    { n: "Ophiuchus",   s: "\u26CE", lo: 247.50, span: 18.82 },
    { n: "Sagittarius", s: "\u2650", lo: 266.32, span: 34 },
    { n: "Capricorn",   s: "\u2651", lo: 300.32, span: 28 },
    { n: "Aquarius",    s: "\u2652", lo: 328.32, span: 24 },
    { n: "Pisces",      s: "\u2653", lo: 352.32, span: 37 }
  ];

  const PLANETS = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];

  const PLANET_GLYPH = {
    Sun: "\u2609", Moon: "\u263D", Mercury: "\u263F", Venus: "\u2640", Mars: "\u2642",
    Jupiter: "\u2643", Saturn: "\u2644", Uranus: "\u2645", Neptune: "\u2646", Pluto: "\u2647"
  };

  const PLANET_COLOR = {
    Sun: "#ffd700", Moon: "#e8e8e8", Mercury: "#b7b7b7", Venus: "#ffcf7a", Mars: "#ff6a4d",
    Jupiter: "#ffb347", Saturn: "#f0d98c", Uranus: "#7ad9ff", Neptune: "#6a8cff", Pluto: "#c9a3ff"
  };

  function mod360(x) { return ((x % 360) + 360) % 360; }

  function angDiff(a, b) {
    // shortest signed distance from a to b, in degrees
    let d = mod360(b - a);
    if (d > 180) d -= 360;
    return d;
  }

  function constellationAt(lon) {
    const L = mod360(lon);
    for (let i = 0; i < IAU13.length; i++) {
      const seg = IAU13[i];
      const end = mod360(seg.lo + seg.span);
      if (seg.lo < end) {
        if (L >= seg.lo && L < end) return seg;
      } else {
        // wraps 360/0
        if (L >= seg.lo || L < end) return seg;
      }
    }
    return IAU13[0];
  }

  // ---- Astronomy: geocentric ecliptic-of-date longitude for each body ----
  function getEclLon(name, time) {
    const A = global.Astronomy;
    if (!A) throw new Error("astronomy-engine not loaded");
    if (name === "Sun") {
      return mod360(A.SunPosition(time).elon);
    }
    if (name === "Moon") {
      return mod360(A.EclipticGeoMoon(time).lon);
    }
    const vec = A.GeoVector(name, time, true);
    const ecl = A.Ecliptic(vec);
    return mod360(ecl.elon);
  }

  function computePositions(dateUtc) {
    const A = global.Astronomy;
    const time = A.MakeTime(dateUtc);
    return PLANETS.map(function (name) {
      const lon = getEclLon(name, time);
      const seg = constellationAt(lon);
      return { name: name, lon: lon, constellation: seg.n, glyph: PLANET_GLYPH[name], color: PLANET_COLOR[name] };
    });
  }

  // ---- Component ----
  function EclipticView(opts) {
    this.canvas = typeof opts.canvas === "string" ? document.getElementById(opts.canvas) : opts.canvas;
    this.infoEl = typeof opts.infoPanel === "string" ? document.getElementById(opts.infoPanel) : opts.infoPanel;
    this.ctx = this.canvas.getContext("2d");

    this.positions = [];      // computed planet data
    this.centerLon = 0;       // ecliptic longitude at the horizontal center of the view
    this.degPerPx = 0.35;     // zoom level: smaller = more zoomed in
    this.minDegPerPx = 0.06;
    this.maxDegPerPx = 1.1;
    this.selected = null;     // selected planet name
    this.playing = false;
    this._playRAF = null;

    this._drag = null;        // {startX, startCenterLon}
    this._pinch = null;       // {startDist, startDegPerPx}

    this._bindEvents();
    this._resize();
    global.addEventListener("resize", this._resize.bind(this));
  }

  EclipticView.prototype._resize = function () {
    const dpr = Math.min(3, global.devicePixelRatio || 1);
    const cssW = this.canvas.clientWidth || this.canvas.parentElement.clientWidth || 360;
    const cssH = this.canvas.clientHeight || 220;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cssW = cssW;
    this.cssH = cssH;
    this.render();
  };

  EclipticView.prototype.setBirthData = function (dateUtc) {
    this.positions = computePositions(dateUtc);
    // default: center on the Sun the first time data loads
    const sun = this.positions.find(function (p) { return p.name === "Sun"; });
    if (sun && this.centerLon === 0 && !this._hasCentered) {
      this.centerLon = sun.lon;
      this._hasCentered = true;
    }
    this.render();
  };

  EclipticView.prototype.centerOnSun = function () {
    const sun = this.positions.find(function (p) { return p.name === "Sun"; });
    if (sun) this.centerLon = sun.lon;
    this.render();
  };

  EclipticView.prototype.reset = function () {
    this.degPerPx = 0.35;
    this.selected = null;
    this.centerOnSun();
  };

  EclipticView.prototype.highlightPlanet = function (name) {
    const p = this.positions.find(function (pp) { return pp.name === name; });
    if (!p) return;
    this.selected = name;
    this.centerLon = p.lon;
    this._showInfo(p);
    this.render();
  };

  EclipticView.prototype.togglePlay = function () {
    this.playing = !this.playing;
    if (this.playing) this._playStep();
    else if (this._playRAF) cancelAnimationFrame(this._playRAF);
    return this.playing;
  };

  EclipticView.prototype._playStep = function () {
    if (!this.playing) return;
    this.centerLon = mod360(this.centerLon + 0.06);
    this.render();
    this._playRAF = requestAnimationFrame(this._playStep.bind(this));
  };

  EclipticView.prototype.zoom = function (factor) {
    this.degPerPx = Math.max(this.minDegPerPx, Math.min(this.maxDegPerPx, this.degPerPx * factor));
    this.render();
  };

  // ---- geometry helpers ----
  EclipticView.prototype._lonToX = function (lon) {
    const d = angDiff(this.centerLon, lon);
    return this.cssW / 2 + d / this.degPerPx;
  };
  EclipticView.prototype._xToLon = function (x) {
    return mod360(this.centerLon + (x - this.cssW / 2) * this.degPerPx);
  };

  EclipticView.prototype._bindEvents = function () {
    const el = this.canvas;
    const self = this;

    el.style.touchAction = "none";

    el.addEventListener("pointerdown", function (e) {
      self._drag = { startX: e.clientX, startCenterLon: self.centerLon };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", function (e) {
      if (!self._drag) return;
      const dx = e.clientX - self._drag.startX;
      self.centerLon = mod360(self._drag.startCenterLon - dx * self.degPerPx);
      self.render();
    });
    el.addEventListener("pointerup", function (e) {
      if (self._drag && Math.abs(e.clientX - self._drag.startX) < 4) {
        self._handleTap(e);
      }
      self._drag = null;
    });
    el.addEventListener("pointercancel", function () { self._drag = null; });

    el.addEventListener("wheel", function (e) {
      e.preventDefault();
      self.zoom(e.deltaY > 0 ? 1.12 : 0.89);
    }, { passive: false });

    // basic pinch-to-zoom
    const touches = {};
    el.addEventListener("touchstart", function (e) {
      for (const t of e.changedTouches) touches[t.identifier] = t;
      if (e.touches.length === 2) {
        self._pinch = { startDist: dist(e.touches[0], e.touches[1]), startDegPerPx: self.degPerPx };
      }
    }, { passive: true });
    el.addEventListener("touchmove", function (e) {
      if (e.touches.length === 2 && self._pinch) {
        const d = dist(e.touches[0], e.touches[1]);
        const ratio = self._pinch.startDist / Math.max(1, d);
        self.degPerPx = Math.max(self.minDegPerPx, Math.min(self.maxDegPerPx, self._pinch.startDegPerPx * ratio));
        self.render();
      }
    }, { passive: true });
    el.addEventListener("touchend", function (e) {
      if (e.touches.length < 2) self._pinch = null;
    }, { passive: true });

    function dist(a, b) {
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }
  };

  EclipticView.prototype._handleTap = function (e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // hit-test planets first (they're drawn on the ecliptic line, mid-height)
    let hit = null, bestD = 22;
    for (const p of this.positions) {
      const px = this._lonToX(p.lon);
      const py = this.cssH * 0.42;
      const d = Math.hypot(px - x, py - y);
      if (d < bestD) { bestD = d; hit = p; }
    }
    if (hit) {
      this.selected = hit.name;
      this._showInfo(hit);
      this.render();
      return;
    }

    // otherwise check constellation band tap
    const lon = this._xToLon(x);
    const seg = constellationAt(lon);
    this.selected = null;
    this._showConstellationInfo(seg);
    this.render();
  };

  EclipticView.prototype._showInfo = function (p) {
    if (!this.infoEl) return;
    this.infoEl.innerHTML =
      '<div class="sc13e-info-name" style="color:' + p.color + '">' + p.glyph + ' ' + p.name + '</div>' +
      '<div class="sc13e-info-row"><span>Constellation</span><span>' + p.constellation + '</span></div>' +
      '<div class="sc13e-info-row"><span>Ecliptic longitude</span><span>' + p.lon.toFixed(2) + '\u00B0</span></div>';
  };

  EclipticView.prototype._showConstellationInfo = function (seg) {
    if (!this.infoEl) return;
    this.infoEl.innerHTML =
      '<div class="sc13e-info-name">' + seg.s + ' ' + seg.n + '</div>' +
      '<div class="sc13e-info-row"><span>Ecliptic span</span><span>' + seg.lo.toFixed(1) + '\u00B0 \u2013 ' + mod360(seg.lo + seg.span).toFixed(1) + '\u00B0</span></div>';
  };

  // ---- rendering ----
  EclipticView.prototype.render = function () {
    const ctx = this.ctx, W = this.cssW, H = this.cssH;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    const eclY = H * 0.42;

    // constellation bands
    for (const seg of IAU13) {
      const x1 = this._lonToX(seg.lo);
      const x2 = this._lonToX(mod360(seg.lo + seg.span));
      // handle wrap: draw as two pieces if x2 < x1 by more than half a turn in px terms
      const segments = [];
      if (x2 >= x1) segments.push([x1, x2]);
      else {
        segments.push([x1, x1 + (360 / this.degPerPx)]);
      }
      for (const [a, b] of segments) {
        if (b < -50 || a > W + 50) continue;
        const alt = IAU13.indexOf(seg) % 2 === 0;
        ctx.fillStyle = alt ? "rgba(255,215,0,0.045)" : "rgba(255,215,0,0.02)";
        ctx.fillRect(a, H * 0.18, b - a, H * 0.5);

        // boundary tick
        ctx.strokeStyle = "rgba(255,215,0,0.28)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a, H * 0.18);
        ctx.lineTo(a, H * 0.68);
        ctx.stroke();

        // label, centered in visible portion of band
        const labelX = Math.max(a, 8) / 2 + Math.min(b, W - 8) / 2;
        if (labelX > 0 && labelX < W) {
          ctx.font = "700 " + Math.max(13, Math.min(17, W / 26)) + "px Raleway, sans-serif";
          ctx.fillStyle = "rgba(255,232,115, 0.85)";
          ctx.textAlign = "center";
          ctx.textBaseline = "alphabetic";
          ctx.fillText(seg.n, labelX, H * 0.16);
        }
      }
    }

    // ecliptic glow line
    ctx.save();
    ctx.shadowColor = "rgba(255,215,0,0.65)";
    ctx.shadowBlur = 8;
    ctx.strokeStyle = "rgba(255,215,0,0.9)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, eclY);
    ctx.lineTo(W, eclY);
    ctx.stroke();
    ctx.restore();

    // planets
    const sorted = this.positions.slice().sort(function (a, b) { return a.lon - b.lon; });
    let lastX = -999;
    for (const p of sorted) {
      let px = this._lonToX(p.lon);
      if (px < -30 || px > W + 30) continue;
      // simple de-overlap: nudge vertically if too close horizontally to previous
      const crowded = Math.abs(px - lastX) < 26;
      lastX = px;
      const py = eclY - (crowded ? 30 : 0);

      ctx.beginPath();
      ctx.moveTo(px, eclY);
      ctx.lineTo(px, py);
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();

      const isSel = this.selected === p.name;
      ctx.save();
      if (isSel) { ctx.shadowColor = p.color; ctx.shadowBlur = 16; }
      ctx.font = (isSel ? "900 " : "700 ") + (isSel ? 22 : 18) + "px 'Segoe UI Symbol', Arial, sans-serif";
      ctx.fillStyle = p.color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.glyph, px, py);
      ctx.restore();

      if (isSel) {
        ctx.font = "700 11px Raleway, sans-serif";
        ctx.fillStyle = "#fff2c2";
        ctx.fillText(p.name, px, py - 18);
      }
    }
  };

  // ---- public API ----
  global.SC13Ecliptic = {
    IAU13: IAU13,
    PLANETS: PLANETS,
    computePositions: computePositions,
    _instance: null,
    init: function (opts) {
      this._instance = new EclipticView(opts);
      return this._instance;
    },
    setBirthData: function (dateUtc) { if (this._instance) this._instance.setBirthData(dateUtc); },
    highlightPlanet: function (name) { if (this._instance) this._instance.highlightPlanet(name); },
    centerOnSun: function () { if (this._instance) this._instance.centerOnSun(); },
    reset: function () { if (this._instance) this._instance.reset(); },
    togglePlay: function () { return this._instance ? this._instance.togglePlay() : false; },
    zoomIn: function () { if (this._instance) this._instance.zoom(0.8); },
    zoomOut: function () { if (this._instance) this._instance.zoom(1.25); },
    destroy: function () { this._instance = null; }
  };
})(window);
