/*!
 * StarChart13 — Ecliptic Sky View
 * 13 ECLIPTIC CONSTELLATIONS ONLY
 *
 * Aries, Taurus, Gemini, Cancer, Leo, Virgo, Libra,
 * Scorpio, Ophiuchus, Sagittarius, Capricorn,
 * Aquarius, Pisces.
 *
 * No Orion.
 * No Auriga.
 * No Monoceros.
 * No Canis Minor.
 * No other constellation figures.
 *
 * Requires astronomy-engine as window.Astronomy.
 */

(function (global) {
  "use strict";

  /* =========================================================
     13 ECLIPTIC CONSTELLATIONS ONLY
     ========================================================= */

  const IAU13 = [
    { n:"Aries",       s:"♈", lo:29.32,  span:24 },
    { n:"Taurus",      s:"♉", lo:53.32,  span:38 },
    { n:"Gemini",      s:"♊", lo:91.32,  span:27 },
    { n:"Cancer",      s:"♋", lo:118.32, span:21 },
    { n:"Leo",         s:"♌", lo:139.32, span:35 },
    { n:"Virgo",       s:"♍", lo:174.32, span:44 },
    { n:"Libra",       s:"♎", lo:218.32, span:23 },
    { n:"Scorpio",     s:"♏", lo:241.32, span:6.18 },
    { n:"Ophiuchus",   s:"⛎", lo:247.50, span:18.82 },
    { n:"Sagittarius", s:"♐", lo:266.32, span:34 },
    { n:"Capricorn",   s:"♑", lo:300.32, span:28 },
    { n:"Aquarius",    s:"♒", lo:328.32, span:24 },
    { n:"Pisces",      s:"♓", lo:352.32, span:37 }
  ];


  /* =========================================================
     REAL STAR LINE COORDINATES
     RA in hours, DEC in degrees.

     Each entry:
     [ra1, dec1, ra2, dec2]

     IMPORTANT:
     There is deliberately NO data for non-ecliptic
     constellations.
     ========================================================= */

  const ASTERISM_LINES = {

    Aries: [
      [2.833063,27.260507,2.119555,23.462423],
      [2.119555,23.462423,1.910668,20.808035],
      [1.910668,20.808035,1.892170,19.293852]
    ],

    Taurus: [
      [5.438198,28.607450,4.704084,22.956926],
      [4.704084,22.956926,4.476943,19.180431],
      [4.598677,16.509301,5.627413,21.142549],
      [4.329889,15.627642,4.382247,17.542514],
      [4.329889,15.627642,4.011338,12.490347],
      [4.011338,12.490347,3.413554,9.028870],
      [4.598677,16.509301,4.476943,19.180431],
      [4.598677,16.509301,4.477705,15.870883],
      [4.477705,15.870883,4.329889,15.627642],
      [4.476943,19.180431,4.424828,17.927910],
      [4.424828,17.927910,4.382247,17.542514],
      [4.382247,17.542514,3.819373,24.053415]
    ],

    Gemini: [
      [6.628528,16.399252,7.068481,20.570297],
      [7.068481,20.570297,7.335383,21.982320],
      [7.335383,21.982320,7.301550,16.540383],
      [7.301550,16.540383,6.754824,12.895591],

      [7.335383,21.982320,7.598708,26.895741],
      [7.598708,26.895741,7.740793,24.397993],
      [7.598708,26.895741,7.755277,28.026199],
      [7.598708,26.895741,7.428779,27.798080],

      [7.428779,27.798080,7.185659,30.245163],
      [7.185659,30.245163,7.576634,31.888276],
      [7.185659,30.245163,6.879816,33.961254],
      [7.185659,30.245163,6.732202,25.131124],

      [6.732202,25.131124,6.482719,20.212133],
      [6.732202,25.131124,6.382673,22.513586],
      [6.382673,22.513586,6.247961,22.506799],
      [6.247961,22.506799,6.068671,23.263341]
    ],

    Cancer: [
      [8.778284,28.759898,8.721431,21.468501],
      [8.721431,21.468501,8.334406,27.217707],
      [8.721431,21.468501,8.744750,18.154309],
      [8.744750,18.154309,8.275256,9.185545],
      [8.744750,18.154309,8.974784,11.857701]
    ],

    Leo: [
      [11.817663,14.572060,11.237335,15.429570],
      [11.237335,15.429570,10.139532,11.967207],
      [10.139532,11.967207,10.122209,16.762664],
      [10.122209,16.762664,10.332873,19.841489],
      [10.332873,19.841489,11.235138,20.523717],
      [11.235138,20.523717,11.817663,14.572060],

      [10.332873,19.841489,10.278171,23.417311],
      [10.278171,23.417311,9.879398,26.006951],
      [9.879398,26.006951,9.764188,23.774255],

      [11.235138,20.523717,11.237335,15.429570]
    ],

    Virgo: [
      [11.764322,6.529376,12.311199,-0.787184],
      [12.311199,-0.787184,12.694345,-1.449375],
      [12.694345,-1.449375,13.419883,-11.161322],
      [13.419883,-11.161322,14.214929,-10.273702],
      [14.214929,-10.273702,14.266908,-6.000547],
      [14.266908,-6.000547,14.717673,-5.658207],

      [13.419883,-11.161322,13.578220,-0.595820],
      [13.578220,-0.595820,14.027443,1.544532],
      [14.027443,1.544532,14.770812,1.892885],

      [13.578220,-0.595820,12.926725,3.397470],
      [12.926725,3.397470,13.036278,10.959150],
      [12.926725,3.397470,12.694345,-1.449375]
    ],

    Libra: [
      [15.897093,-16.729293,15.592105,-14.789537],
      [15.592105,-14.789537,15.283449,-9.382917],
      [15.283449,-9.382917,14.847977,-16.041778],
      [14.847977,-16.041778,15.067839,-25.281965],
      [15.067839,-25.281965,15.592105,-14.789537]
    ],

    Scorpio: [
      [17.560145,-37.103821,17.708132,-39.029983],
      [17.708132,-39.029983,17.793078,-40.126997],
      [17.793078,-40.126997,17.621980,-42.997824],
      [17.621980,-42.997824,17.202552,-43.239189],
      [17.202552,-43.239189,16.899924,-42.362025],

      [16.899924,-42.362025,16.864509,-38.047380],
      [16.864509,-38.047380,16.836080,-34.293232],
      [16.836080,-34.293232,16.598043,-28.216016],
      [16.598043,-28.216016,16.490128,-26.432002],

      [16.490128,-26.432002,16.005557,-22.621710],
      [16.490128,-26.432002,15.980865,-26.114105],
      [16.490128,-26.432002,16.090620,-19.805453]
    ],

    Ophiuchus: [
      [17.582241,12.560035,17.724543,4.567303],
      [17.172968,-15.724910,17.724543,4.567303],

      [17.582241,12.560035,16.961139,9.375033],
      [16.961139,9.375033,16.305358,-4.692511],
      [16.305358,-4.692511,16.619316,-10.567090],

      [16.619316,-10.567090,17.172968,-15.724910],
      [17.172968,-15.724910,17.523598,-23.962643]
    ],

    Sagittarius: [
      [18.349900,-29.828103,18.466179,-25.421700],
      [18.293793,-36.761686,18.402868,-34.384616],

      [18.402868,-34.384616,18.096803,-30.424091],
      [18.096803,-30.424091,17.792674,-27.830788],
      [18.096803,-30.424091,18.349900,-29.828103],

      [18.349900,-29.828103,18.402868,-34.384616],
      [18.402868,-34.384616,19.043532,-29.880105],

      [19.043532,-29.880105,18.760940,-26.990778],
      [18.760940,-26.990778,18.349900,-29.828103],

      [18.760940,-26.990778,18.466179,-25.421700],
      [18.466179,-25.421700,18.229392,-21.058834],

      [19.043532,-29.880105,19.115670,-27.670423],
      [19.115670,-27.670423,18.921090,-26.296722],
      [18.921090,-26.296722,18.760940,-26.990778],

      [18.921090,-26.296722,18.962167,-21.106654],
      [18.962167,-21.106654,19.078050,-21.741496],
      [19.078050,-21.741496,19.293911,-18.952908]
    ],

    Capricorn: [
      [20.300904,-12.544852,20.350187,-14.781367],
      [20.350187,-14.781367,21.099118,-17.232861],
      [21.099118,-17.232861,21.370776,-16.834542],

      [21.370776,-16.834542,21.668181,-16.662308],
      [21.668181,-16.662308,21.784011,-16.127286],

      [21.370776,-16.834542,21.444452,-22.411332],
      [21.444452,-22.411332,21.099118,-17.232861],

      [20.350187,-14.781367,20.768260,-25.270898],
      [21.099118,-17.232861,20.863692,-26.919133]
    ],

    Aquarius: [
      [21.525982,-5.571172,22.096399,-0.319851],
      [22.096399,-0.319851,22.360938,-1.387331],
      [22.360938,-1.387331,22.480531,-0.019972],
      [22.480531,-0.019972,22.589272,-0.117498],

      [22.589272,-0.117498,22.876910,-7.579599],
      [22.876910,-7.579599,23.264859,-9.087737],
      [23.264859,-9.087737,23.382842,-20.100580],

      [22.096399,-0.319851,22.280565,-7.783290],
      [22.280565,-7.783290,22.107286,-13.869679],

      [22.280565,-7.783290,22.510782,-10.677950],
      [22.510782,-10.677950,22.826528,-13.592632],
      [22.826528,-13.592632,22.910837,-15.820820]
    ],

    Pisces: [
      [1.046971,31.804263,1.229152,24.583713],
      [1.046971,31.804263,1.324443,27.264059],
      [1.324443,27.264059,1.229152,24.583713],

      [1.229152,24.583713,1.524725,15.345823],
      [1.524725,15.345823,1.756564,9.157736],
      [1.756564,9.157736,2.034117,2.763759],

      [2.034117,2.763759,1.892597,3.187536],
      [1.892597,3.187536,1.690526,5.487613],
      [1.690526,5.487613,1.503087,6.143820],

      [1.503087,6.143820,1.049058,7.890135],
      [1.049058,7.890135,0.804836,7.299928],
      [0.804836,7.299928,0.343295,8.190271],

      [0.343295,8.190271,23.988525,6.863321],
      [23.988525,6.863321,23.665844,5.626291],
      [23.665844,5.626291,23.700779,1.780041],

      [23.700779,1.780041,23.448876,1.255608],
      [23.448876,1.255608,23.286094,3.282289],
      [23.286094,3.282289,23.466138,6.378992],
      [23.466138,6.378992,23.665844,5.626291]
    ]
  };


  /* =========================================================
     PLANETS
     ========================================================= */

  const PLANETS = [
    "Sun",
    "Moon",
    "Mercury",
    "Venus",
    "Mars",
    "Jupiter",
    "Saturn",
    "Uranus",
    "Neptune",
    "Pluto"
  ];

  const PLANET_GLYPH = {
    Sun:"☉",
    Moon:"☽",
    Mercury:"☿",
    Venus:"♀",
    Mars:"♂",
    Jupiter:"♃",
    Saturn:"♄",
    Uranus:"♅",
    Neptune:"♆",
    Pluto:"♇"
  };

  const PLANET_COLOR = {
    Sun:"#ffd700",
    Moon:"#eeeeee",
    Mercury:"#bbbbbb",
    Venus:"#ffcf7a",
    Mars:"#ff6a4d",
    Jupiter:"#ffb347",
    Saturn:"#f0d98c",
    Uranus:"#7ad9ff",
    Neptune:"#6a8cff",
    Pluto:"#c9a3ff"
  };


  /* =========================================================
     BASIC MATH
     ========================================================= */

  function mod360(x) {
    return ((x % 360) + 360) % 360;
  }

  function angDiff(a, b) {
    let d = mod360(b - a);

    if (d > 180) {
      d -= 360;
    }

    return d;
  }


  /* =========================================================
     TRUE-SKY SIGN LOOKUP
     ========================================================= */

  function constellationAt(lon) {

    const L = mod360(lon);

    for (const seg of IAU13) {

      const end =
        mod360(seg.lo + seg.span);

      if (seg.lo < end) {

        if (
          L >= seg.lo &&
          L < end
        ) {
          return seg;
        }

      } else {

        if (
          L >= seg.lo ||
          L < end
        ) {
          return seg;
        }
      }
    }

    return IAU13[0];
  }


  /* =========================================================
     J2000 EQUATORIAL -> ECLIPTIC

     Converts real star RA / DEC coordinates to
     ecliptic longitude and latitude.
     ========================================================= */

  function eqToEcl(raHours, decDeg) {

    const DEG =
      Math.PI / 180;

    const ra =
      raHours * 15 * DEG;

    const dec =
      decDeg * DEG;

    const obliquity =
      23.4392911 * DEG;

    const x =
      Math.cos(dec) *
      Math.cos(ra);

    const y =
      Math.cos(dec) *
      Math.sin(ra);

    const z =
      Math.sin(dec);

    const xe = x;

    const ye =
      y * Math.cos(obliquity) +
      z * Math.sin(obliquity);

    const ze =
      -y * Math.sin(obliquity) +
      z * Math.cos(obliquity);

    return {

      lon:
        mod360(
          Math.atan2(
            ye,
            xe
          ) / DEG
        ),

      lat:
        Math.asin(ze) / DEG
    };
  }


  /* =========================================================
     PRE-PROJECT CONSTELLATION STAR LINES
     ========================================================= */

  const PROJECTED_LINES = {};

  Object.keys(
    ASTERISM_LINES
  ).forEach(function(name) {

    PROJECTED_LINES[name] =
      ASTERISM_LINES[name].map(
        function(edge) {

          const starA =
            eqToEcl(
              edge[0],
              edge[1]
            );

          const starB =
            eqToEcl(
              edge[2],
              edge[3]
            );

          return [
            starA,
            starB
          ];
        }
      );
  });


  /* =========================================================
     PLANET ASTRONOMY

     This preserves the existing astronomy-engine
     calculation approach.
     ========================================================= */

  function getEclLon(name, time) {

    const A =
      global.Astronomy;

    if (!A) {
      throw new Error(
        "astronomy-engine not loaded"
      );
    }

    if (name === "Sun") {

      return mod360(
        A.SunPosition(time).elon
      );
    }

    if (name === "Moon") {

      return mod360(
        A.EclipticGeoMoon(time).lon
      );
    }

    const vector =
      A.GeoVector(
        name,
        time,
        true
      );

    const ecliptic =
      A.Ecliptic(vector);

    return mod360(
      ecliptic.elon
    );
  }


  function computePositions(dateUtc) {

    const A =
      global.Astronomy;

    if (!A) {
      throw new Error(
        "astronomy-engine not loaded"
      );
    }

    const time =
      A.MakeTime(dateUtc);

    return PLANETS.map(
      function(name) {

        const lon =
          getEclLon(
            name,
            time
          );

        const constellation =
          constellationAt(lon);

        return {

          name:name,

          lon:lon,

          constellation:
            constellation.n,

          glyph:
            PLANET_GLYPH[name],

          color:
            PLANET_COLOR[name]
        };
      }
    );
  }


  /* =========================================================
     VIEW
     ========================================================= */

  function EclipticView(opts) {

    opts = opts || {};

    this.canvas =
      typeof opts.canvas === "string"
        ? document.getElementById(
            opts.canvas
          )
        : opts.canvas;

    this.infoEl =
      typeof opts.infoPanel === "string"
        ? document.getElementById(
            opts.infoPanel
          )
        : opts.infoPanel;

    if (!this.canvas) {

      throw new Error(
        "SC13 Ecliptic View: canvas not found"
      );
    }

    this.ctx =
      this.canvas.getContext("2d");

    this.positions = [];

    this.centerLon = 0;

    this.degPerPx = 0.35;

    this.minDegPerPx = 0.06;

    this.maxDegPerPx = 1.10;

    this.selected = null;

    this.playing = false;

    this._playRAF = null;

    this._drag = null;

    this._pinch = null;

    this._hasCentered = false;

    this._boundResize =
      this._resize.bind(this);

    this._bindEvents();

    this._resize();

    global.addEventListener(
      "resize",
      this._boundResize
    );
  }


  /* =========================================================
     RESIZE
     ========================================================= */

  EclipticView.prototype._resize =
    function() {

      const dpr =
        Math.min(
          3,
          global.devicePixelRatio || 1
        );

      const cssW =
        this.canvas.clientWidth ||
        (
          this.canvas.parentElement
            ? this.canvas
                .parentElement
                .clientWidth
            : 360
        ) ||
        360;

      const cssH =
        this.canvas.clientHeight ||
        260;

      this.canvas.width =
        Math.round(
          cssW * dpr
        );

      this.canvas.height =
        Math.round(
          cssH * dpr
        );

      this.ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
      );

      this.cssW =
        cssW;

      this.cssH =
        cssH;

      this.render();
    };


  /* =========================================================
     SET DATE / CHART
     ========================================================= */

  EclipticView.prototype.setBirthData =
    function(dateUtc) {

      this.positions =
        computePositions(
          dateUtc
        );

      const sun =
        this.positions.find(
          function(p) {
            return p.name === "Sun";
          }
        );

      if (
        sun &&
        !this._hasCentered
      ) {

        this.centerLon =
          sun.lon;

        this._hasCentered =
          true;
      }

      this.render();
    };


  /* =========================================================
     CONTROLS
     ========================================================= */

  EclipticView.prototype.centerOnSun =
    function() {

      const sun =
        this.positions.find(
          function(p) {
            return p.name === "Sun";
          }
        );

      if (sun) {
        this.centerLon =
          sun.lon;
      }

      this.render();
    };


  EclipticView.prototype.reset =
    function() {

      this.degPerPx =
        0.35;

      this.selected =
        null;

      this.centerOnSun();
    };


  EclipticView.prototype.highlightPlanet =
    function(name) {

      const p =
        this.positions.find(
          function(item) {
            return item.name === name;
          }
        );

      if (!p) {
        return;
      }

      this.selected =
        name;

      this.centerLon =
        p.lon;

      this._showPlanetInfo(
        p
      );

      this.render();
    };


  EclipticView.prototype.togglePlay =
    function() {

      this.playing =
        !this.playing;

      if (this.playing) {

        this._playStep();

      } else if (
        this._playRAF
      ) {

        cancelAnimationFrame(
          this._playRAF
        );

        this._playRAF =
          null;
      }

      return this.playing;
    };


  EclipticView.prototype._playStep =
    function() {

      if (!this.playing) {
        return;
      }

      this.centerLon =
        mod360(
          this.centerLon +
          0.06
        );

      this.render();

      this._playRAF =
        requestAnimationFrame(
          this._playStep.bind(this)
        );
    };


  EclipticView.prototype.zoom =
    function(factor) {

      this.degPerPx =
        Math.max(
          this.minDegPerPx,
          Math.min(
            this.maxDegPerPx,
            this.degPerPx *
              factor
          )
        );

      this.render();
    };


  /* =========================================================
     PROJECTION
     ========================================================= */

  EclipticView.prototype._lonToX =
    function(lon) {

      const d =
        angDiff(
          this.centerLon,
          lon
        );

      return (
        this.cssW / 2 +
        d /
        this.degPerPx
      );
    };


  EclipticView.prototype._xToLon =
    function(x) {

      return mod360(

        this.centerLon +

        (
          x -
          this.cssW / 2
        ) *

        this.degPerPx
      );
    };


  EclipticView.prototype._latToY =
    function(lat) {

      const eclipticY =
        this.cssH *
        0.58;

      const pixelsPerDegree =
        Math.max(
          1.35,
          Math.min(
            2.35,
            this.cssH / 95
          )
        );

      return (
        eclipticY -
        lat *
        pixelsPerDegree
      );
    };


  /* =========================================================
     BACKGROUND
     ========================================================= */

  EclipticView.prototype._drawBackground =
    function() {

      const ctx =
        this.ctx;

      const W =
        this.cssW;

      const H =
        this.cssH;

      const gradient =
        ctx.createLinearGradient(
          0,
          0,
          0,
          H
        );

      gradient.addColorStop(
        0,
        "#03050d"
      );

      gradient.addColorStop(
        0.5,
        "#070711"
      );

      gradient.addColorStop(
        1,
        "#020205"
      );

      ctx.fillStyle =
        gradient;

      ctx.fillRect(
        0,
        0,
        W,
        H
      );
    };


  /* =========================================================
     ECLIPTIC LONGITUDE GRID
     ========================================================= */

  EclipticView.prototype._drawGrid =
    function() {

      const ctx =
        this.ctx;

      const W =
        this.cssW;

      const H =
        this.cssH;

      ctx.save();

      ctx.font =
        "10px Raleway, Arial, sans-serif";

      ctx.textAlign =
        "center";

      ctx.textBaseline =
        "top";

      for (
        let lon = 0;
        lon < 360;
        lon += 10
      ) {

        const x =
          this._lonToX(
            lon
          );

        if (
          x < -20 ||
          x > W + 20
        ) {
          continue;
        }

        ctx.strokeStyle =
          lon % 30 === 0
            ? "rgba(255,255,255,.10)"
            : "rgba(255,255,255,.045)";

        ctx.lineWidth =
          lon % 30 === 0
            ? 1
            : 0.6;

        ctx.beginPath();

        ctx.moveTo(
          x,
          0
        );

        ctx.lineTo(
          x,
          H
        );

        ctx.stroke();

        if (
          lon % 30 === 0
        ) {

          ctx.fillStyle =
            "rgba(255,255,255,.42)";

          ctx.fillText(
            lon + "°",
            x,
            5
          );
        }
      }

      ctx.restore();
    };


  /* =========================================================
     13 CONSTELLATION BOUNDARIES

     Again: ONLY IAU13 is iterated.
     ========================================================= */

  EclipticView.prototype._drawBoundaries =
    function() {

      const ctx =
        this.ctx;

      const W =
        this.cssW;

      const H =
        this.cssH;

      ctx.save();

      for (
        const seg of IAU13
      ) {

        const x =
          this._lonToX(
            seg.lo
          );

        if (
          x < -20 ||
          x > W + 20
        ) {
          continue;
        }

        ctx.strokeStyle =
          "rgba(255,215,0,.15)";

        ctx.lineWidth =
          1;

        ctx.beginPath();

        ctx.moveTo(
          x,
          0
        );

        ctx.lineTo(
          x,
          H
        );

        ctx.stroke();
      }

      ctx.restore();
    };


  /* =========================================================
     REAL 13 CONSTELLATION DRAWING
     ========================================================= */

  EclipticView.prototype._drawConstellations =
    function() {

      const ctx =
        this.ctx;

      const W =
        this.cssW;

      const H =
        this.cssH;

      /*
       * THIS LOOP IS THE HARD FILTER.
       *
       * We iterate IAU13 only.
       *
       * Even if other constellation information
       * exists elsewhere on the website, it is
       * never requested or rendered here.
       */

      for (
        const seg of IAU13
      ) {

        const lines =
          PROJECTED_LINES[
            seg.n
          ] || [];

        ctx.save();

        ctx.strokeStyle =
          "rgba(193,107,255,.78)";

        ctx.lineWidth =
          1.35;

        ctx.lineCap =
          "round";

        ctx.lineJoin =
          "round";

        ctx.shadowColor =
          "rgba(179,76,255,.45)";

        ctx.shadowBlur =
          5;


        /* DRAW REAL STAR CONNECTIONS */

        for (
          const edge of lines
        ) {

          const a =
            edge[0];

          const b =
            edge[1];

          const x1 =
            this._lonToX(
              a.lon
            );

          const y1 =
            this._latToY(
              a.lat
            );

          const x2 =
            this._lonToX(
              b.lon
            );

          const y2 =
            this._latToY(
              b.lat
            );


          /*
           * Prevent a line from jumping
           * across the 0° / 360° seam.
           */

          if (
            Math.abs(
              x2 - x1
            ) >
            W * 0.65
          ) {
            continue;
          }


          if (
            (
              x1 < -80 &&
              x2 < -80
            ) ||
            (
              x1 > W + 80 &&
              x2 > W + 80
            )
          ) {
            continue;
          }


          ctx.beginPath();

          ctx.moveTo(
            x1,
            y1
          );

          ctx.lineTo(
            x2,
            y2
          );

          ctx.stroke();


          /* DRAW STAR DOTS */

          for (
            const star of [a,b]
          ) {

            const sx =
              this._lonToX(
                star.lon
              );

            const sy =
              this._latToY(
                star.lat
              );

            if (
              sx < -10 ||
              sx > W + 10 ||
              sy < -10 ||
              sy > H + 10
            ) {
              continue;
            }

            ctx.beginPath();

            ctx.arc(
              sx,
              sy,
              2,
              0,
              Math.PI * 2
            );

            ctx.fillStyle =
              "rgba(255,255,255,.96)";

            ctx.shadowColor =
              "rgba(210,170,255,.95)";

            ctx.shadowBlur =
              7;

            ctx.fill();
          }
        }


        /* FIND VISIBLE STARS FOR LABEL POSITION */

        const visible =
          [];

        for (
          const edge of lines
        ) {

          for (
            const star of edge
          ) {

            const x =
              this._lonToX(
                star.lon
              );

            const y =
              this._latToY(
                star.lat
              );

            if (
              x >= 0 &&
              x <= W &&
              y >= 0 &&
              y <= H
            ) {

              visible.push({
                x:x,
                y:y
              });
            }
          }
        }


        /* CONSTELLATION NAME */

        if (
          visible.length
        ) {

          const avgX =
            visible.reduce(
              function(sum,p) {
                return sum + p.x;
              },
              0
            ) /
            visible.length;

          const avgY =
            visible.reduce(
              function(sum,p) {
                return sum + p.y;
              },
              0
            ) /
            visible.length;


          ctx.shadowColor =
            "#000";

          ctx.shadowBlur =
            5;

          ctx.textAlign =
            "center";

          ctx.textBaseline =
            "bottom";

          ctx.font =
            "800 13px Raleway, Arial, sans-serif";

          ctx.fillStyle =
            "rgba(226,178,255,.98)";

          ctx.fillText(
            seg.n,
            avgX,
            Math.max(
              18,
              avgY - 9
            )
          );
        }


        ctx.restore();
      }
    };


  /* =========================================================
     ECLIPTIC PATH
     ========================================================= */

  EclipticView.prototype._drawEcliptic =
    function() {

      const ctx =
        this.ctx;

      const W =
        this.cssW;

      const y =
        this.cssH *
        0.58;

      ctx.save();

      ctx.shadowColor =
        "rgba(255,215,0,.8)";

      ctx.shadowBlur =
        8;

      ctx.strokeStyle =
        "rgba(255,220,80,.96)";

      ctx.lineWidth =
        1.8;

      ctx.setLineDash(
        [7,5]
      );

      ctx.beginPath();

      ctx.moveTo(
        0,
        y
      );

      ctx.lineTo(
        W,
        y
      );

      ctx.stroke();

      ctx.setLineDash(
        []
      );


      ctx.font =
        "700 10px Raleway, Arial, sans-serif";

      ctx.textAlign =
        "left";

      ctx.textBaseline =
        "bottom";

      ctx.fillStyle =
        "rgba(255,225,100,.9)";

      ctx.fillText(
        "ECLIPTIC",
        8,
        y - 5
      );

      ctx.restore();
    };


  /* =========================================================
     PLANETS
     ========================================================= */

  EclipticView.prototype._drawPlanets =
    function() {

      const ctx =
        this.ctx;

      const W =
        this.cssW;

      const eclipticY =
        this.cssH *
        0.58;


      const visible =
        this.positions

          .map(
            function(p) {

              return {
                p:p,
                x:this._lonToX(
                  p.lon
                )
              };
            },
            this
          )

          .filter(
            function(item) {

              return (
                item.x > -35 &&
                item.x < W + 35
              );
            }
          )

          .sort(
            function(a,b) {

              return (
                a.x -
                b.x
              );
            }
          );


      /*
       * Visual stacking only.
       * Planet longitude itself is NOT moved.
       */

      const minimumGap =
        27;

      const rowStep =
        28;

      const rowLastX =
        [];


      for (
        const item of visible
      ) {

        const p =
          item.p;

        const x =
          item.x;

        let row =
          0;


        while (
          row <
            rowLastX.length &&
          x -
            rowLastX[row] <
            minimumGap
        ) {

          row++;
        }


        rowLastX[row] =
          x;


        const y =
          eclipticY -
          row *
          rowStep;


        /* LEADER LINE */

        if (
          Math.abs(
            y -
            eclipticY
          ) > 2
        ) {

          ctx.beginPath();

          ctx.moveTo(
            x,
            eclipticY
          );

          ctx.lineTo(
            x,
            y + 8
          );

          ctx.strokeStyle =
            "rgba(255,255,255,.28)";

          ctx.lineWidth =
            1;

          ctx.stroke();
        }


        const selected =
          this.selected ===
          p.name;


        ctx.save();


        if (
          selected
        ) {

          ctx.shadowColor =
            p.color;

          ctx.shadowBlur =
            18;
        }


        ctx.font =
          (
            selected
              ? "900 24px "
              : "700 20px "
          ) +
          "'Segoe UI Symbol', Arial, sans-serif";


        ctx.textAlign =
          "center";

        ctx.textBaseline =
          "middle";

        ctx.fillStyle =
          p.color;


        ctx.fillText(
          p.glyph,
          x,
          y
        );


        ctx.restore();


        if (
          selected
        ) {

          ctx.font =
            "700 11px Raleway, Arial, sans-serif";

          ctx.textAlign =
            "center";

          ctx.fillStyle =
            "#ffffff";

          ctx.fillText(
            p.name,
            x,
            y - 20
          );
        }
      }
    };


  /* =========================================================
     MAIN RENDER
     ========================================================= */

  EclipticView.prototype.render =
    function() {

      if (
        !this.ctx ||
        !this.cssW ||
        !this.cssH
      ) {
        return;
      }


      this.ctx.clearRect(
        0,
        0,
        this.cssW,
        this.cssH
      );


      this._drawBackground();

      this._drawGrid();

      this._drawBoundaries();

      this._drawConstellations();

      this._drawEcliptic();

      this._drawPlanets();
    };


  /* =========================================================
     INFO PANEL
     ========================================================= */

  EclipticView.prototype._showPlanetInfo =
    function(p) {

      if (
        !this.infoEl
      ) {
        return;
      }


      this.infoEl.innerHTML =

        '<div class="sc13e-info-name" ' +
        'style="color:' +
        p.color +
        '">' +

        p.glyph +
        " " +
        p.name +

        "</div>" +

        '<div class="sc13e-info-row">' +

        "<span>Constellation</span>" +

        "<span>" +
        p.constellation +
        "</span>" +

        "</div>" +

        '<div class="sc13e-info-row">' +

        "<span>Ecliptic longitude</span>" +

        "<span>" +
        p.lon.toFixed(2) +
        "°</span>" +

        "</div>";
    };


  EclipticView.prototype._showConstellationInfo =
    function(seg) {

      if (
        !this.infoEl
      ) {
        return;
      }


      const end =
        mod360(
          seg.lo +
          seg.span
        );


      this.infoEl.innerHTML =

        '<div class="sc13e-info-name">' +

        seg.s +
        " " +
        seg.n +

        "</div>" +

        '<div class="sc13e-info-row">' +

        "<span>Ecliptic span</span>" +

        "<span>" +

        seg.lo.toFixed(2) +
        "° – " +
        end.toFixed(2) +
        "°" +

        "</span>" +

        "</div>";
    };


  /* =========================================================
     TAP / DRAG / ZOOM
     ========================================================= */

  EclipticView.prototype._handleTap =
    function(e) {

      const rect =
        this.canvas
          .getBoundingClientRect();

      const x =
        e.clientX -
        rect.left;

      const y =
        e.clientY -
        rect.top;


      let hit =
        null;

      let bestDistance =
        24;


      const planetY =
        this.cssH *
        0.58;


      for (
        const p of this.positions
      ) {

        const px =
          this._lonToX(
            p.lon
          );

        const distance =
          Math.hypot(
            px - x,
            planetY - y
          );


        if (
          distance <
          bestDistance
        ) {

          bestDistance =
            distance;

          hit =
            p;
        }
      }


      if (
        hit
      ) {

        this.selected =
          hit.name;

        this._showPlanetInfo(
          hit
        );

        this.render();

        return;
      }


      const lon =
        this._xToLon(
          x
        );

      const seg =
        constellationAt(
          lon
        );


      this.selected =
        null;


      this._showConstellationInfo(
        seg
      );


      this.render();
    };


  EclipticView.prototype._bindEvents =
    function() {

      const el =
        this.canvas;

      const self =
        this;


      el.style.touchAction =
        "none";


      el.addEventListener(
        "pointerdown",
        function(e) {

          self._drag = {

            startX:
              e.clientX,

            startCenterLon:
              self.centerLon,

            moved:false
          };


          try {

            el.setPointerCapture(
              e.pointerId
            );

          } catch (_) {}
        }
      );


      el.addEventListener(
        "pointermove",
        function(e) {

          if (
            !self._drag
          ) {
            return;
          }


          const dx =
            e.clientX -
            self._drag.startX;


          if (
            Math.abs(dx) >
            4
          ) {

            self._drag.moved =
              true;
          }


          self.centerLon =
            mod360(

              self._drag
                .startCenterLon -

              dx *
              self.degPerPx
            );


          self.render();
        }
      );


      el.addEventListener(
        "pointerup",
        function(e) {

          if (
            self._drag &&
            !self._drag.moved
          ) {

            self._handleTap(
              e
            );
          }


          self._drag =
            null;
        }
      );


      el.addEventListener(
        "pointercancel",
        function() {

          self._drag =
            null;
        }
      );


      /* DESKTOP / TRACKPAD ZOOM */

      el.addEventListener(
        "wheel",
        function(e) {

          e.preventDefault();


          self.zoom(

            e.deltaY > 0
              ? 1.12
              : 0.89
          );
        },
        {
          passive:false
        }
      );


      /* PHONE PINCH ZOOM */

      el.addEventListener(
        "touchstart",
        function(e) {

          if (
            e.touches.length ===
            2
          ) {

            const dx =
              e.touches[0].clientX -
              e.touches[1].clientX;

            const dy =
              e.touches[0].clientY -
              e.touches[1].clientY;


            self._pinch = {

              startDistance:
                Math.hypot(
                  dx,
                  dy
                ),

              startScale:
                self.degPerPx
            };
          }
        },
        {
          passive:true
        }
      );


      el.addEventListener(
        "touchmove",
        function(e) {

          if (
            e.touches.length !==
              2 ||
            !self._pinch
          ) {
            return;
          }


          const dx =
            e.touches[0].clientX -
            e.touches[1].clientX;

          const dy =
            e.touches[0].clientY -
            e.touches[1].clientY;


          const distance =
            Math.hypot(
              dx,
              dy
            );


          const ratio =
            self._pinch
              .startDistance /
            Math.max(
              1,
              distance
            );


          self.degPerPx =
            Math.max(

              self.minDegPerPx,

              Math.min(

                self.maxDegPerPx,

                self._pinch
                  .startScale *
                ratio
              )
            );


          self.render();
        },
        {
          passive:true
        }
      );


      el.addEventListener(
        "touchend",
        function(e) {

          if (
            e.touches.length <
            2
          ) {

            self._pinch =
              null;
          }
        },
        {
          passive:true
        }
      );
    };


  /* =========================================================
     DESTROY
     ========================================================= */

  EclipticView.prototype.destroy =
    function() {

      this.playing =
        false;


      if (
        this._playRAF
      ) {

        cancelAnimationFrame(
          this._playRAF
        );
      }


      global.removeEventListener(
        "resize",
        this._boundResize
      );
    };


  /* =========================================================
     PUBLIC API

     Keeps the API your index.html already expects.
     ========================================================= */

  global.SC13Ecliptic = {

    IAU13:
      IAU13,

    PLANETS:
      PLANETS,

    computePositions:
      computePositions,

    _instance:
      null,


    init:
      function(opts) {

        if (
          this._instance
        ) {

          try {
            this._instance
              .destroy();
          } catch (_) {}
        }


        this._instance =
          new EclipticView(
            opts
          );


        return (
          this._instance
        );
      },


    setBirthData:
      function(dateUtc) {

        if (
          this._instance
        ) {

          this._instance
            .setBirthData(
              dateUtc
            );
        }
      },


    highlightPlanet:
      function(name) {

        if (
          this._instance
        ) {

          this._instance
            .highlightPlanet(
              name
            );
        }
      },


    centerOnSun:
      function() {

        if (
          this._instance
        ) {

          this._instance
            .centerOnSun();
        }
      },


    reset:
      function() {

        if (
          this._instance
        ) {

          this._instance
            .reset();
        }
      },


    togglePlay:
      function() {

        if (
          !this._instance
        ) {

          return false;
        }


        return (
          this._instance
            .togglePlay()
        );
      },


    zoomIn:
      function() {

        if (
          this._instance
        ) {

          this._instance
            .zoom(
              0.80
            );
        }
      },


    zoomOut:
      function() {

        if (
          this._instance
        ) {

          this._instance
            .zoom(
              1.25
            );
        }
      },


    destroy:
      function() {

        if (
          this._instance
        ) {

          try {

            this._instance
              .destroy();

          } catch (_) {}
        }


        this._instance =
          null;
      }
  };


})(window);
