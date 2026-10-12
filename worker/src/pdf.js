import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { deriveChartFacts, describeOccupants, describeStelliums } from "./facts.js";
import { LOGO_BADGE_PNG_BASE64 } from "./logo.js";

const PAGE_SIZE = [612, 792]; // US Letter
const MARGIN = 54;
// Dark purple page, not white-with-black-text -- matches the live site's own
// cosmic dark theme (body background #070B14, violet/magenta gradient accents)
// instead of reading like a plain printout.
const PAGE_BG = rgb(0.08, 0.035, 0.145); // deeper, darker purple (~#15092A)
const BOX_BG = rgb(0.125, 0.058, 0.205); // lighter purple panel fill for the cover info box, still deeper than before
const ACCENT = rgb(0.69, 0.149, 1.0); // bright violet (site brand #B026FF) — heading/title text
const MAGENTA = rgb(1.0, 0.18, 0.82); // vivid pink (site brand #FF2ED1) — rules, underlines, top band
const INK = rgb(0.97, 0.97, 0.99); // near-white body text
const MUTED = rgb(0.74, 0.7, 0.86); // light lavender for secondary/table text
const RULE_LIGHT = rgb(0.5, 0.32, 0.68); // mid-violet border, visible against the dark page/box fill
const GOLD_BRIGHT = rgb(1.0, 0.84, 0.25); // bright metallic gold — border stars/sparkles
const GOLD_SOFT = rgb(0.86, 0.68, 0.32); // deeper champagne gold — border stars/sparkles, alternates with GOLD_BRIGHT

/* A 5-point star and a 4-point glitter sparkle, both centered on (0,0) at a
   fixed base size -- scaled per-instance via drawSvgPath's `scale` option
   instead of regenerating path strings per star, since the border scatters
   dozens of these on every page. */
function starSvgPath(outerR, innerR) {
  const points = 5;
  let d = "";
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / points) * i - Math.PI / 2;
    d += `${i === 0 ? "M" : "L"}${(r * Math.cos(angle)).toFixed(2)} ${(r * Math.sin(angle)).toFixed(2)} `;
  }
  return d + "Z";
}
function sparkleSvgPath(outerR, innerR) {
  const points = 4;
  let d = "";
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / points) * i;
    d += `${i === 0 ? "M" : "L"}${(r * Math.cos(angle)).toFixed(2)} ${(r * Math.sin(angle)).toFixed(2)} `;
  }
  return d + "Z";
}
const STAR_PATH = starSvgPath(5, 2);
const SPARKLE_PATH = sparkleSvgPath(6, 1.3);

function jitter(n) {
  return (Math.random() - 0.5) * n;
}

class Cursor {
  constructor(doc, font, boldFont) {
    this.doc = doc;
    this.font = font;
    this.boldFont = boldFont;
    this.page = null;
    this.y = 0;
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage(PAGE_SIZE);
    this.y = PAGE_SIZE[1] - MARGIN;
    this.drawPageBackground();
    this.drawTopBand();
    this.drawStarBorder();
  }
  /* A scattered gold star/sparkle frame around the outer edge of every page --
     confined to the margin band outside the MARGIN=54 content area (and clear
     of the top band and the bottom-right page-number corner) so it never
     overlaps real text, just decorates the border around it. */
  drawStarBorder() {
    const w = PAGE_SIZE[0];
    const h = PAGE_SIZE[1];
    const spacing = 42;
    const positions = [];
    for (let x = 20; x < w - 20; x += spacing) positions.push({ x: x + jitter(10), y: h - 18 - Math.random() * 16 });
    for (let x = 20; x < w - 110; x += spacing) positions.push({ x: x + jitter(10), y: 18 + Math.random() * 16 });
    for (let y = 40; y < h - 40; y += spacing) positions.push({ x: 18 + Math.random() * 16, y: y + jitter(10) });
    for (let y = 40; y < h - 40; y += spacing) positions.push({ x: w - 18 - Math.random() * 16, y: y + jitter(10) });

    positions.forEach((p, i) => {
      const isSparkle = i % 3 === 0;
      this.page.drawSvgPath(isSparkle ? SPARKLE_PATH : STAR_PATH, {
        x: p.x,
        y: p.y,
        scale: 0.55 + Math.random() * 1.1,
        color: i % 2 === 0 ? GOLD_BRIGHT : GOLD_SOFT,
        opacity: 0.55 + Math.random() * 0.45,
        borderWidth: 0,
      });
    });
  }
  /* Every new page is blank white by default in pdf-lib regardless of what the
     rest of the document looks like, so the dark purple theme has to be painted
     fresh on each page before any other content is drawn on it. */
  drawPageBackground() {
    this.page.drawRectangle({ x: 0, y: 0, width: PAGE_SIZE[0], height: PAGE_SIZE[1], color: PAGE_BG });
  }
  /* A thin two-tone brand bar across the top of every page -- the one piece of
     consistent visual identity that was previously completely absent; the rest
     of the page was plain white with no color except headings and the cover. */
  drawTopBand() {
    const bandHeight = 7;
    const y = PAGE_SIZE[1] - bandHeight;
    const half = PAGE_SIZE[0] / 2;
    this.page.drawRectangle({ x: 0, y, width: half, height: bandHeight, color: ACCENT });
    this.page.drawRectangle({ x: half, y, width: half, height: bandHeight, color: MAGENTA });
  }
  ensureSpace(height) {
    if (this.y - height < MARGIN) this.newPage();
  }
  heading(text, size = 14, opts = {}) {
    this.ensureSpace(size + 22);
    if (opts.kicker) {
      this.page.drawText(opts.kicker, { x: MARGIN, y: this.y, size: 9, font: this.boldFont, color: MUTED });
      this.y -= 12;
    }
    this.page.drawText(text, { x: MARGIN, y: this.y, size, font: this.boldFont, color: ACCENT });
    this.y -= size + 6;
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: MARGIN + 46, y: this.y }, thickness: 2, color: MAGENTA });
    this.y -= 12;
  }
  paragraph(text, size = 10.5, lineHeight = 15) {
    const maxWidth = PAGE_SIZE[0] - MARGIN * 2;
    const words = String(text || "").split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const test = line ? line + " " + word : word;
      const width = this.font.widthOfTextAtSize(test, size);
      if (width > maxWidth && line) {
        this.drawLine(line, size, lineHeight);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) this.drawLine(line, size, lineHeight);
    this.y -= 8;
  }
  /* AI-written sections come back as one string with blank lines between paragraphs
     (the prompt asks for that). paragraph() alone would collapse those -- it only
     wraps on word boundaries -- so this splits on blank lines first and renders each
     paragraph separately, with its own trailing gap, instead of one dense block. */
  sectionText(text, size = 10.5, lineHeight = 15) {
    const paragraphs = String(text || "")
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (!paragraphs.length) {
      this.paragraph(text, size, lineHeight);
      return;
    }
    paragraphs.forEach((p) => this.paragraph(p, size, lineHeight));
  }
  drawLine(line, size, lineHeight) {
    this.ensureSpace(lineHeight);
    this.page.drawText(line, { x: MARGIN, y: this.y, size, font: this.font, color: INK });
    this.y -= lineHeight;
  }
  row(cells, widths, opts = {}) {
    const size = opts.size || 9;
    this.ensureSpace(size + 7);
    let x = MARGIN;
    cells.forEach((c, i) => {
      this.page.drawText(String(c ?? ""), {
        x,
        y: this.y,
        size,
        font: opts.bold ? this.boldFont : this.font,
        color: opts.bold ? INK : MUTED,
      });
      x += widths[i];
    });
    this.y -= size + 7;
  }
  spacer(h = 10) {
    this.y -= h;
  }
}

export async function buildReadingPdf(payload, interpretation) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const facts = deriveChartFacts(payload);
  const sections = interpretation || fallbackSections(payload, facts);
  const cursor = new Cursor(doc, font, boldFont);
  const logoImage = await embedLogoBadge(doc);

  drawCover(cursor, payload, logoImage);

  if (payload.wheelImagePNG) {
    try {
      await drawWheelImage(doc, cursor, payload);
    } catch (e) {
      console.error("Could not embed wheel image", e.message);
    }
  }

  cursor.newPage();
  cursor.heading("Your True-Sky Chart at a Glance", 15, { kicker: "SECTION 1" });
  cursor.sectionText(sections.chartGlance);
  if (facts.hasStelliums) {
    cursor.spacer(4);
    cursor.paragraph(`Stelliums detected: ${describeStelliums(facts.stelliums)}`, 9.5, 13);
  }

  cursor.newPage();
  cursor.heading("Ophiuchus: The Hidden Thirteenth Sign", 15, { kicker: "SECTION 2" });
  cursor.sectionText(sections.ophiuchusSection);

  cursor.heading("The 13th House", 15, { kicker: "SECTION 3" });
  cursor.paragraph(`Occupants: ${describeOccupants(facts.house13Occupants)}`, 9.5, 13);
  cursor.spacer(4);
  cursor.sectionText(sections.house13Section);

  // Every planet and point below gets its own heading and its own section --
  // never two points folded into one paragraph the way "Core Self: Sun &
  // Ascendant" or "Outer Planets: Uranus, Neptune & Pluto" used to.
  cursor.newPage();
  cursor.heading("Sun", 14, { kicker: "SECTION 4" });
  cursor.sectionText(sections.sunSection);
  cursor.heading("Ascendant", 14, { kicker: "SECTION 5" });
  cursor.sectionText(sections.ascendantSection);
  cursor.heading("Moon", 14, { kicker: "SECTION 6" });
  cursor.sectionText(sections.moonSection);

  cursor.newPage();
  cursor.heading("Mercury", 14, { kicker: "SECTION 7" });
  cursor.sectionText(sections.mercurySection);
  cursor.heading("Venus", 14, { kicker: "SECTION 8" });
  cursor.sectionText(sections.venusSection);
  cursor.heading("Mars", 14, { kicker: "SECTION 9" });
  cursor.sectionText(sections.marsSection);

  drawPlacementsTable(cursor, payload);

  cursor.newPage();
  cursor.heading("Jupiter", 14, { kicker: "SECTION 10" });
  cursor.sectionText(sections.jupiterSection);
  cursor.heading("Saturn", 14, { kicker: "SECTION 11" });
  cursor.sectionText(sections.saturnSection);

  cursor.newPage();
  cursor.heading("North Node", 14, { kicker: "SECTION 12" });
  cursor.sectionText(sections.northNodeSection);
  cursor.heading("South Node", 14, { kicker: "SECTION 13" });
  cursor.sectionText(sections.southNodeSection);
  cursor.heading("Midheaven", 14, { kicker: "SECTION 14" });
  cursor.sectionText(sections.midheavenSection);

  cursor.newPage();
  cursor.heading("Uranus", 14, { kicker: "SECTION 15" });
  cursor.sectionText(sections.uranusSection);
  cursor.heading("Neptune", 14, { kicker: "SECTION 16" });
  cursor.sectionText(sections.neptuneSection);
  cursor.heading("Pluto", 14, { kicker: "SECTION 17" });
  cursor.sectionText(sections.plutoSection);

  cursor.newPage();
  cursor.heading("Chiron", 14, { kicker: "SECTION 18" });
  cursor.sectionText(sections.chironSection);

  cursor.newPage();
  cursor.heading("Lilith and Eve Axis", 14, { kicker: "SECTION 19" });
  cursor.sectionText(sections.lilithEveAxis);

  cursor.heading("All 13 Houses", 14, { kicker: "SECTION 20" });
  cursor.sectionText(sections.allHousesNarrative);
  drawAllHousesTable(cursor, facts);

  cursor.newPage();
  cursor.heading("Major Aspect Patterns", 14, { kicker: "SECTION 21" });
  cursor.sectionText(sections.aspectPatterns);
  drawAspectsTable(cursor, payload);

  cursor.newPage();
  cursor.heading("Tropical vs. True Sky", 14, { kicker: "SECTION 22" });
  cursor.sectionText(sections.tropicalDifferential);
  drawTropicalComparisonTable(cursor, payload);

  cursor.newPage();
  cursor.heading("Integrated Synthesis", 14, { kicker: "SECTION 23" });
  cursor.sectionText(sections.integratedSynthesis);

  drawDisclaimer(cursor);

  drawPageNumbers(doc, font);

  return doc.save();
}

/* Short-form counterpart to buildReadingPdf() for the $7 "Lilith & Eve Placement
   Reading" — same Cursor/PDF plumbing, a fraction of the pages, since this
   product is scoped to Black Moon Lilith, Eve, and the axis between them. */
export async function buildMiniReadingPdf(payload, interpretation) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const facts = deriveChartFacts(payload);
  const sections = interpretation || fallbackMiniSections(facts);
  const cursor = new Cursor(doc, font, boldFont);
  const logoImage = await embedLogoBadge(doc);

  drawMiniCover(cursor, payload, logoImage);

  cursor.newPage();
  cursor.heading("Black Moon Lilith", 15, { kicker: "SECTION 1" });
  cursor.paragraph(
    facts.lilithPoint
      ? `Placement: ${facts.lilithPoint.trueSky.constellation} ${Math.floor(facts.lilithPoint.trueSky.degree)}°, House ${facts.lilithPoint.house}.`
      : "Not calculated for this chart.",
    9.5,
    13
  );
  cursor.spacer(4);
  cursor.sectionText(sections.lilithSection);

  cursor.heading("Eve", 15, { kicker: "SECTION 2" });
  cursor.paragraph(
    facts.evePoint
      ? `Placement: ${facts.evePoint.trueSky.constellation} ${Math.floor(facts.evePoint.trueSky.degree)}°, House ${facts.evePoint.house}.`
      : "Not calculated for this chart.",
    9.5,
    13
  );
  cursor.spacer(4);
  cursor.sectionText(sections.eveSection);

  cursor.heading("The Lilith–Eve Axis", 15, { kicker: "SECTION 3" });
  cursor.sectionText(sections.axisSynthesis);

  drawDisclaimer(cursor);
  drawPageNumbers(doc, font);

  return doc.save();
}

function drawMiniCover(cursor, payload, logoImage) {
  const { page } = cursor;
  drawCoverLogoBadge(page, logoImage);
  cursor.y = PAGE_SIZE[1] - 220;
  page.drawText("Star Chart 13", { x: MARGIN, y: cursor.y, size: 30, font: cursor.boldFont, color: ACCENT });
  cursor.y -= 10;
  page.drawLine({ start: { x: MARGIN, y: cursor.y }, end: { x: MARGIN + 70, y: cursor.y }, thickness: 2.5, color: MAGENTA });
  cursor.y -= 24;
  page.drawText("Lilith & Eve Placement Reading", { x: MARGIN, y: cursor.y, size: 15, font: cursor.font, color: INK });
  cursor.y -= 22;
  page.drawText("Black Moon Lilith • Eve • The Axis Between Them", { x: MARGIN, y: cursor.y, size: 10, font: cursor.font, color: MUTED });
  cursor.y -= 40;

  drawCoverInfoBox(cursor, payload);
}

function fallbackMiniSections(facts) {
  const note =
    " (The full written interpretation couldn't be generated automatically this time — " +
    "the data above is complete and accurate, and Star Chart 13 will follow up with the full narrative.)";
  return {
    lilithSection:
      (facts.lilithPoint
        ? `Black Moon Lilith is in ${facts.lilithPoint.trueSky.constellation}, house ${facts.lilithPoint.house}.`
        : "Black Moon Lilith was not calculated for this chart.") + note,
    eveSection:
      (facts.evePoint
        ? `Eve is in ${facts.evePoint.trueSky.constellation}, house ${facts.evePoint.house}.`
        : "Eve was not calculated for this chart.") + note,
    axisSynthesis: note.trim(),
  };
}

function drawCover(cursor, payload, logoImage) {
  const { page } = cursor;
  drawCoverLogoBadge(page, logoImage);
  cursor.y = PAGE_SIZE[1] - 220;
  page.drawText("Star Chart 13", { x: MARGIN, y: cursor.y, size: 30, font: cursor.boldFont, color: ACCENT });
  cursor.y -= 10;
  page.drawLine({ start: { x: MARGIN, y: cursor.y }, end: { x: MARGIN + 70, y: cursor.y }, thickness: 2.5, color: MAGENTA });
  cursor.y -= 24;
  page.drawText("Detailed True-Sky Natal Reading", { x: MARGIN, y: cursor.y, size: 15, font: cursor.font, color: INK });
  cursor.y -= 22;
  page.drawText("13 Signs • 13 Houses • Ophiuchus Included", { x: MARGIN, y: cursor.y, size: 10, font: cursor.font, color: MUTED });
  cursor.y -= 40;

  drawCoverInfoBox(cursor, payload);

  cursor.y -= 20;
  page.drawText(
    "Your 13 signs, all 13 houses, major aspects, and your tropical vs. true-sky differential.",
    { x: MARGIN, y: cursor.y, size: 10, font: cursor.font, color: MUTED }
  );
}

/* A bordered info box for the customer's birth details, instead of plain stacked
   text lines -- gives the cover page some actual visual structure rather than
   reading as a plain white page with a title and a list. */
function drawCoverInfoBox(cursor, payload) {
  const { page } = cursor;
  const c = payload.customer || {};
  const lines = [
    c.name ? `Prepared for: ${c.name}` : null,
    c.birthDate ? `Birth date: ${c.birthDate}` : null,
    c.birthTime24h ? `Birth time: ${c.birthTime24h}` : null,
    c.birthLocation ? `Birth location: ${c.birthLocation}` : null,
  ].filter(Boolean);
  const boxWidth = PAGE_SIZE[0] - MARGIN * 2;
  const boxHeight = lines.length * 20 + 24;
  const boxTop = cursor.y;
  page.drawRectangle({
    x: MARGIN,
    y: boxTop - boxHeight,
    width: boxWidth,
    height: boxHeight,
    borderColor: RULE_LIGHT,
    borderWidth: 1,
    color: BOX_BG,
  });
  page.drawRectangle({ x: MARGIN, y: boxTop - boxHeight, width: 4, height: boxHeight, color: MAGENTA });
  let y = boxTop - 20;
  lines.forEach((l) => {
    page.drawText(l, { x: MARGIN + 18, y, size: 12, font: cursor.font, color: INK });
    y -= 20;
  });
  cursor.y = boxTop - boxHeight - 14;
  page.drawText(`Generated: ${new Date().toISOString().slice(0, 10)}`, { x: MARGIN, y: cursor.y, size: 9, font: cursor.font, color: MUTED });
}

const LOGO_BADGE_SIZE = 150;

/* Embeds the Star Chart 13 badge logo once per document (not once per page --
   it only ever appears on the cover), returning null instead of throwing if
   the embed somehow fails, so a bad asset can never break PDF generation for
   a paying customer. */
async function embedLogoBadge(doc) {
  try {
    return await doc.embedPng(base64ToBytes(LOGO_BADGE_PNG_BASE64));
  } catch (e) {
    console.error("Could not embed logo badge", e.message);
    return null;
  }
}

/* Sits in the empty top-right of the cover page, clear of the title (top-left)
   and the info box (which starts well below it) -- decorative only, draws
   nothing and shifts no other cover content if the embed above failed. */
function drawCoverLogoBadge(page, logoImage) {
  if (!logoImage) return;
  const x = PAGE_SIZE[0] - MARGIN - LOGO_BADGE_SIZE;
  const y = PAGE_SIZE[1] - 17 - LOGO_BADGE_SIZE;
  page.drawImage(logoImage, { x, y, width: LOGO_BADGE_SIZE, height: LOGO_BADGE_SIZE });
}

async function drawWheelImage(doc, cursor, payload) {
  const base64 = payload.wheelImagePNG.split(",").pop();
  const bytes = base64ToBytes(base64);
  const png = await doc.embedPng(bytes);
  cursor.newPage();
  cursor.heading("Your Natal Wheel");
  const maxWidth = PAGE_SIZE[0] - MARGIN * 2;
  const maxHeight = cursor.y - MARGIN;
  const scale = Math.min(maxWidth / png.width, maxHeight / png.height, 1);
  const w = png.width * scale;
  const h = png.height * scale;
  cursor.page.drawImage(png, { x: MARGIN + (maxWidth - w) / 2, y: cursor.y - h, width: w, height: h });
  cursor.y -= h + 10;
}

function drawPlacementsTable(cursor, payload) {
  cursor.heading("Placements Reference", 12);
  const widths = [95, 45, 150, 150];
  cursor.row(["Point", "House", "True Sky", "Tropical"], widths, { bold: true, size: 9.5 });
  (payload.points || []).forEach((p) => {
    cursor.row(
      [
        p.name + (p.retrograde ? " (Rx)" : ""),
        p.house,
        `${p.trueSky.constellation} ${Math.floor(p.trueSky.degree)}°`,
        `${p.tropical.sign} ${Math.floor(p.tropical.degree)}°`,
      ],
      widths
    );
  });
}

function drawAllHousesTable(cursor, facts) {
  cursor.spacer(6);
  const widths = [55, 490];
  cursor.row(["House", "Occupants"], widths, { bold: true, size: 9.5 });
  for (let h = 1; h <= 13; h++) {
    cursor.row([h, describeOccupants(facts.houseOccupants[h])], widths, { size: 9 });
  }
}

function drawAspectsTable(cursor, payload) {
  cursor.spacer(6);
  const widths = [130, 100, 130, 80];
  cursor.row(["Point 1", "Aspect", "Point 2", "Orb"], widths, { bold: true, size: 9.5 });
  (payload.aspects || []).forEach((a) => {
    cursor.row([a.point1, a.aspect, a.point2, `${a.orb}°`], widths);
  });
}

function drawTropicalComparisonTable(cursor, payload) {
  cursor.spacer(6);
  const widths = [110, 150, 150, 60];
  cursor.row(["Point", "Tropical", "True Sky", "Changed"], widths, { bold: true, size: 9.5 });
  (payload.tropicalComparison || []).forEach((c) => {
    cursor.row(
      [c.point, `${c.tropicalSign} ${Math.floor(c.tropicalDegree)}°`, `${c.trueSkyConstellation} ${Math.floor(c.trueSkyDegree)}°`, c.changedSign ? "Yes" : ""],
      widths
    );
  });
}

function drawDisclaimer(cursor) {
  cursor.spacer(20);
  cursor.heading("Framework & Disclaimer", 12);
  cursor.paragraph(
    "Star Chart 13 calculates placements against the real astronomical positions of the 13 constellations " +
      "the ecliptic actually passes through (including Ophiuchus), verified against astronomy references " +
      "such as Sky Map and Stellarium — that part is astronomical fact. The interpretations in this reading " +
      "are an astrological framework applied to those facts, offered for reflection and entertainment purposes.",
    9.5,
    13
  );
}

function drawPageNumbers(doc, font) {
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    const label = `Page ${i + 1} of ${pages.length}`;
    const size = 8;
    const width = font.widthOfTextAtSize(label, size);
    page.drawText(label, { x: PAGE_SIZE[0] - MARGIN - width, y: 28, size, font, color: MUTED });
  });
}

/* Used only when the AI call fails entirely (network/API outage). Every field is
   built directly from the deterministic chart facts so the customer still gets a
   complete, factually-correct — if less literary — PDF instead of nothing. */
function fallbackSections(payload, facts) {
  const note =
    " (The full written interpretation for this section couldn't be generated automatically this time — " +
    "the data above is complete and accurate, and Star Chart 13 will follow up with the full narrative.)";
  const asc = facts.ascendant;
  return {
    chartGlance: (asc ? `Your Ascendant is in ${asc.constellation} ${Math.floor(asc.degree)}°.` : "") + note,
    ophiuchusSection: facts.hasOphiuchus
      ? `Ophiuchus placements: ${describeOccupants(facts.ophiuchusPlacements)}.` + note
      : "None of your calculated placements fall within Ophiuchus in this chart.",
    house13Section: `13th house occupants: ${describeOccupants(facts.house13Occupants)}.` + note,
    sunSection: note.trim(),
    ascendantSection: note.trim(),
    moonSection: note.trim(),
    mercurySection: note.trim(),
    venusSection: note.trim(),
    marsSection: note.trim(),
    jupiterSection: note.trim(),
    saturnSection: note.trim(),
    northNodeSection: note.trim(),
    southNodeSection: note.trim(),
    midheavenSection: note.trim(),
    uranusSection: note.trim(),
    neptuneSection: note.trim(),
    plutoSection: note.trim(),
    chironSection: note.trim(),
    lilithEveAxis: facts.hasLilithOrEve ? note.trim() : "Lilith and Eve were not calculated for this chart.",
    allHousesNarrative: note.trim(),
    aspectPatterns: note.trim(),
    tropicalDifferential: `${facts.changedSignPlacements.length} placement(s) changed sign between tropical and true sky.` + note,
    integratedSynthesis: note.trim(),
  };
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
