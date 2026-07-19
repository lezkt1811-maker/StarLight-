/* ==========================================================================
   StarChart13 — Tropical Comparison Mode
   STAGE 1: Calculation only.
   No tabs, no canvases, no tropical wheel rendering, no comparison UI,
   no export. This file only computes numbers and logs a validation panel
   to the console. It never touches the DOM except to read/console.log.
   ========================================================================== */

/* Normalize any longitude to the range [0, 360). */
function normalize360(deg) {
  return ((deg % 360) + 360) % 360;
}

/* Standard 12 equal tropical signs, 30° each, starting at 0° Aries. */
const TROPICAL_SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"
];

/* Config constant per spec: first version uses equal houses.
   Kept as its own named constant so a future real house system
   (Placidus, Koch, etc.) can replace this without hunting through code. */
const TROPICAL_HOUSE_SYSTEM = "equal";

/* getTropicalPlacement(longitude)
   Pure function: no ayanamsa subtraction, no estimation.
   Takes a raw ecliptic longitude (already calculated elsewhere in the app)
   and returns which of the 12 equal tropical signs it falls in. */
function getTropicalPlacement(longitude) {
  const lon = normalize360(longitude);
  const signIndex = Math.floor(lon / 30);
  const degreeInSign = lon % 30;
  const degree = Math.floor(degreeInSign);
  const minutes = Math.floor((degreeInSign % 1) * 60);
  const sign = TROPICAL_SIGNS[signIndex];
  const formatted = sign + " " + degree + "\u00B0 " + minutes + "\u2032";
  return {
    sign: sign,
    signIndex: signIndex,
    degree: degreeInSign, // full decimal degree within sign (0–30)
    minutes: minutes,
    formatted: formatted
  };
}

/* getTropicalHouse(longitude, ascendantLongitude)
   Equal-house system only (see TROPICAL_HOUSE_SYSTEM above).
   House 1 begins exactly at the tropical Ascendant longitude.
   This is intentionally separate from the existing StarChart13
   13-house system (houseOfCW / KIM_HW), which is untouched. */
function getTropicalHouse(longitude, ascendantLongitude) {
  const distance = normalize360(longitude - ascendantLongitude);
  return Math.floor(distance / 30) + 1;
}

/* buildTropicalChart(astronomyData)
   astronomyData = {
     person: { name, birthDate, birthTime, birthplace, latitude, longitude, timezone },
     bodies: [ { name, lon, rx }, ... ],   // raw longitudes already computed elsewhere
     ascendantLongitude: number,
     mcLongitude: number
   }

   Does NOT invent any data. If a body wasn't passed in, it simply won't
   appear in the output — no placeholder/zero values are created.
   Returns the "tropical" branch of the combinedChart object described
   in the project spec. */
function buildTropicalChart(astronomyData) {
  if (!astronomyData || !Array.isArray(astronomyData.bodies)) {
    throw new Error("buildTropicalChart: astronomyData.bodies array is required");
  }
  const ascLon = astronomyData.ascendantLongitude;
  const mcLon = astronomyData.mcLongitude;
  if (typeof ascLon !== "number" || !Number.isFinite(ascLon)) {
    throw new Error("buildTropicalChart: ascendantLongitude must be a finite number");
  }
  if (typeof mcLon !== "number" || !Number.isFinite(mcLon)) {
    throw new Error("buildTropicalChart: mcLongitude must be a finite number");
  }

  const placements = {};
  const houses = {};

  astronomyData.bodies.forEach(function (b) {
    if (!b || typeof b.lon !== "number" || !Number.isFinite(b.lon)) return;
    placements[b.name] = Object.assign(
      { longitude: b.lon, rx: !!b.rx },
      getTropicalPlacement(b.lon)
    );
    houses[b.name] = getTropicalHouse(b.lon, ascLon);
  });

  const ascendant = Object.assign({ longitude: ascLon }, getTropicalPlacement(ascLon));
  const midheaven = Object.assign({ longitude: mcLon }, getTropicalPlacement(mcLon));

  return {
    houseSystem: TROPICAL_HOUSE_SYSTEM, // "Tropical Equal-House Chart" label lives in Stage 2 UI
    placements: placements,
    houses: houses,
    ascendant: ascendant,
    midheaven: midheaven
  };
}

/* comparePlacements(tropicalChart, starChart13PlacementsByName)
   Data structure only — Stage 1 does not render this anywhere.
   starChart13PlacementsByName: an object keyed by body name, where each
   value has at minimum { signN: <constellation name>, degInSign: <number> },
   which matches the shape of the existing pData entries produced in draw().

   A row is only created for a body BOTH systems actually calculated —
   this never fabricates a StarChart13 comparison value. */
function comparePlacements(tropicalChart, starChart13PlacementsByName) {
  const rows = [];
  let changedCount = 0;

  Object.keys(tropicalChart.placements).forEach(function (name) {
    const trop = tropicalChart.placements[name];
    const sc13 = starChart13PlacementsByName ? starChart13PlacementsByName[name] : null;
    if (!sc13 || typeof sc13.signN === "undefined") return;

    const changed = trop.sign !== sc13.signN;
    if (changed) changedCount++;

    rows.push({
      body: name,
      tropicalSign: trop.sign,
      tropicalDegree: trop.degree,
      starChart13Sign: sc13.signN,
      starChart13Degree: sc13.degInSign,
      changed: changed
    });
  });

  return {
    rows: rows,
    changedCount: changedCount,
    totalCount: rows.length
  };
}

/* ---------- Stage 1 development-only validation ----------
   Logs the exact boundary cases called out in the spec, so it's possible
   to visually confirm 0°=Aries0°, 30°=Taurus0°, ... 359.999° stays Pisces,
   without needing any UI. This runs once on page load and is silent
   about everything else — it does not touch the birth-chart DOM elements. */
function sc13ValidateTropicalBoundaries() {
  const testLongitudes = [
    0, 29.999, 30, 59.999, 60, 89.999, 90, 179.999,
    180, 269.999, 270, 329.999, 330, 359.999
  ];
  console.log("=== StarChart13 Tropical Stage 1: boundary validation ===");
  testLongitudes.forEach(function (lon) {
    const p = getTropicalPlacement(lon);
    console.log(
      lon + "\u00B0  ->  " + p.formatted +
      "  (signIndex " + p.signIndex + ", degree " + p.degree.toFixed(3) + ")"
    );
  });
  console.log(
    "Expected: 0=Aries 0°00′, 30=Taurus 0°00′, 60=Gemini 0°00′, 90=Cancer 0°00′, " +
    "180=Libra 0°00′, 270=Capricorn 0°00′, 330=Pisces 0°00′, 359.999 stays Pisces."
  );
  console.log("=== End boundary validation ===");
}

/* Expose everything globally, matching the plain-<script> style already
   used throughout the rest of the site (no module system in this project). */
if (typeof window !== "undefined") {
  window.normalize360 = normalize360;
  window.getTropicalPlacement = getTropicalPlacement;
  window.getTropicalHouse = getTropicalHouse;
  window.buildTropicalChart = buildTropicalChart;
  window.comparePlacements = comparePlacements;
  window.TROPICAL_HOUSE_SYSTEM = TROPICAL_HOUSE_SYSTEM;
  window.sc13ValidateTropicalBoundaries = sc13ValidateTropicalBoundaries;

  window.addEventListener("DOMContentLoaded", function () {
    sc13ValidateTropicalBoundaries();
  });
}
