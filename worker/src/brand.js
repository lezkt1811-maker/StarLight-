/* Per-site branding for readings.

   More than one storefront (Star Chart 13, True Sky Astrology) sends orders to this
   one worker. The browser only sends a brand *id*; every visible string and color
   comes from this server-side registry, so a buyer can't put arbitrary text into a
   PDF or email by editing the request. An order with no id, or an unknown id, gets
   DEFAULT_BRAND -- exactly what Star Chart 13 orders have always produced. */

import { rgb } from "pdf-lib";

const DEFAULT_BRAND = {
  id: "starchart13",
  name: "Star Chart 13",
  readingTitle: "Detailed True-Sky Natal Reading",
  tagline: "13 Signs • 13 Houses • Ophiuchus Included",
  miniTitle: "Lilith & Eve Placement Reading",
  accent: rgb(0.29, 0.09, 0.45), // deep violet
  fromName: null, // null = use env.FROM_EMAIL unchanged
  pdfFilename: "Lilith-and-Eve-Astrology-Detailed-Reading.pdf",
  miniPdfFilename: "Lilith-and-Eve-Placement-Reading.pdf",
};

const BRANDS = {
  "true-sky": {
    id: "true-sky",
    name: "True Sky Astrology",
    readingTitle: "True Sky Natal Reading",
    tagline: "13 Constellations • 13 Houses • Measured Against the Real Sky",
    miniTitle: "Lilith & Eve Placement Reading",
    accent: rgb(0.62, 0.48, 0.12), // observatory gold
    fromName: "True Sky Astrology",
    pdfFilename: "True-Sky-Astrology-Natal-Reading.pdf",
    miniPdfFilename: "True-Sky-Astrology-Lilith-and-Eve-Reading.pdf",
  },
};

export function resolveBrand(payload) {
  const id = payload && payload.brand && typeof payload.brand.id === "string" ? payload.brand.id : "";
  return BRANDS[id] || DEFAULT_BRAND;
}

/* Swaps the default brand name for this order's brand in any generated text
   (AI-written sections, fallback text, prompts). No-op for Star Chart 13 orders. */
export function applyBrand(value, brand) {
  if (!brand || brand.id === DEFAULT_BRAND.id) return value;
  if (typeof value === "string") {
    return value
      .replace(/Star Chart 13's/g, `${brand.name}'s`)
      .replace(/Star Chart 13/g, brand.name)
      .replace(/StarChart13/g, brand.name);
  }
  if (Array.isArray(value)) return value.map((v) => applyBrand(v, brand));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = applyBrand(v, brand);
    return out;
  }
  return value;
}

/* "Lilith and Eve Astrology <readings@starchart13.com>" -> "True Sky Astrology <readings@starchart13.com>".
   Only the display name changes; the verified sending address stays the same. */
export function fromAddress(env, brand) {
  const base = env.FROM_EMAIL || "Star Chart 13 <readings@starchart13.com>";
  if (!brand || !brand.fromName) return base;
  const m = base.match(/<([^>]+)>/);
  const addr = m ? m[1] : base.trim();
  return `${brand.fromName} <${addr}>`;
}
