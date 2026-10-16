import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { deriveChartFacts, describeOccupants, describeStelliums } from "./facts.js";
import { LOGO_BADGE_PNG_BASE64 } from "./logo.js";

const PAGE_SIZE = [612, 792]; // US Letter
const MARGIN = 58; // slightly more generous side margins for comfortable mobile reading
// Dark purple page, not white-with-black-text -- matches the live site's own
// cosmic dark theme (body background #070B14, violet/magenta gradient accents)
// instead of reading like a plain printout.
const PAGE_BG = rgb(0.08, 0.035, 0.145); // deeper, darker purple (~#15092A)
const BOX_BG = rgb(0.125, 0.058, 0.205); // lighter purple panel fill for the cover info box, still deeper than before
const ACCENT = rgb(0.69, 0.149, 1.0); // bright violet (site brand #B026FF) — heading/title text
const MAGENTA = rgb(1.0, 0.18, 0.82); // vivid pink (site brand #FF2ED1) — rules, underlines, top band
const INK = rgb(0.97, 0.97, 0.99); // near-white body text
const MUTED = rgb(0.82, 0.79, 0.92); // light lavender for secondary/table text -- brightened for contrast
const RULE_LIGHT = rgb(0.5, 0.32, 0.68); // mid-violet border, visible against the dark page/box fill
const GOLD_BRIGHT = rgb(1.0, 0.84, 0.25); // bright metallic gold — border stars/sparkles
const GOLD_SOFT = rgb(0.86, 0.68, 0.32); // deeper champagne gold — border stars/sparkles, alternates with GOLD_BRIGHT
const HIGHLIGHT = rgb(1.0, 0.82, 0.45); // warm gold — bolded in-text keywords, echoes the star border

/* Chart terms worth bolding inline so a dense paragraph has scan anchors
   instead of reading as one uniform block -- planets/points, signs, and
   aspect names, longest phrase first so "Black Moon Lilith" matches whole
   rather than just grabbing "Moon" out of the middle of it. Matching is
   case-insensitive (the AI sometimes writes "house 6" lowercase inside a
   sentence) and never touches the actual words, only how they're drawn. */
const BOLD_TERMS = [
  "Black Moon Lilith",
  "North Node",
  "South Node",
  "Sun",
  "Moon",
  "Mercury",
  "Venus",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
  "Pluto",
  "Chiron",
  "Ascendant",
  "Midheaven",
  "Eve",
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Ophiuchus",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
  "Conjunction",
  "Conjunct",
  "Opposition",
  "Trine",
  "Sextile",
  "Square",
  "Quincunx",
].sort((a, b) => b.length - a.length);
const BOLD_TERM_REGEX = new RegExp(
  `\\b(${BOLD_TERMS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b|\\bHouse\\s+\\d+\\b`,
  "gi"
);

/* Splits text into {word, bold} tokens for word-by-word rendering with mixed
   fonts on the same line. Each token is a whole whitespace-delimited word
   straight from the original text -- punctuation attached to it (a comma,
   period, or parenthesis with no space) stays part of that same token and
   inherits its boldness by range overlap, rather than being sliced off into
   its own token at the exact match boundary. Slicing at the match boundary
   was the earlier bug: "Sun" matches as bold but the comma right after it
   doesn't, so it became a separate non-bold token -- and every token gets a
   space drawn before it, so "Sun," rendered as "Sun ,". Keeping punctuation
   glued to its word (bold and all) avoids ever creating a token that wasn't
   actually separated by whitespace in the source text. */
function tokenizeRich(text) {
  const str = String(text || "");
  const boldRanges = [];
  for (const m of str.matchAll(BOLD_TERM_REGEX)) boldRanges.push([m.index, m.index + m[0].length]);
  const tokens = [];
  const wordRe = /\S+/g;
  let m;
  while ((m = wordRe.exec(str))) {
    const start = m.index;
    const end = start + m[0].length;
    const bold = boldRanges.some(([bs, be]) => start < be && end > bs);
    tokens.push({ word: m[0], bold });
  }
  return tokens;
}

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
  /* A scattered gold star/sparkle accent along the top and bottom edges of
     every page only -- no longer runs down the left/right sides, since those
     columns sat directly beside the body text for the entire height of every
     page and visually competed with it rather than framing it. Confined to
     the margin band outside the content area (and clear of the top band and
     the bottom-right page-number corner) so it never overlaps real text. */
  drawStarBorder() {
    const w = PAGE_SIZE[0];
    const h = PAGE_SIZE[1];
    const spacing = 50;
    const positions = [];
    // Top row sits tucked just under the 7px top band (785-792) instead of
    // fanning down toward y=758 -- at the old range, a large-scaled star's
    // bottom tip could reach to within a few points of the "SECTION N"
    // heading that starts at y=738, reading as the star and the title
    // merging together. This keeps a clear gap even at max star size.
    for (let x = 20; x < w - 20; x += spacing) positions.push({ x: x + jitter(10), y: h - 10 - Math.random() * 8 });
    for (let x = 20; x < w - 110; x += spacing) positions.push({ x: x + jitter(10), y: 10 + Math.random() * 8 });

    positions.forEach((p, i) => {
      const isSparkle = i % 3 === 0;
      this.page.drawSvgPath(isSparkle ? SPARKLE_PATH : STAR_PATH, {
        x: p.x,
        y: p.y,
        scale: 0.5 + Math.random() * 0.65,
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
    this.ensureSpace(size + 24);
    if (opts.kicker) {
      this.page.drawText(opts.kicker, { x: MARGIN, y: this.y, size: 9, font: this.boldFont, color: MUTED });
      this.y -= 12;
    }
    this.page.drawText(text, { x: MARGIN, y: this.y, size, font: this.boldFont, color: ACCENT });
    this.y -= size + 6;
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: MARGIN + 46, y: this.y }, thickness: 2, color: MAGENTA });
    this.y -= 15;
  }
  /* Wraps word-by-word (not a single string draw) so a line can mix the
     regular and bold fonts -- chart terms detected by tokenizeRich() render
     in gold/bold as scan anchors, instead of every paragraph being one
     uniform wall of same-weight text. Default size/lineHeight bumped (10.5/16
     -> 11.5/17) for comfortable mobile reading without constant zooming. */
  paragraph(text, size = 11.5, lineHeight = 17) {
    const maxWidth = PAGE_SIZE[0] - MARGIN * 2;
    const spaceWidth = this.font.widthOfTextAtSize(" ", size);
    const tokens = tokenizeRich(text);
    let line = [];
    let lineWidth = 0;
    for (const tok of tokens) {
      const f = tok.bold ? this.boldFont : this.font;
      const w = f.widthOfTextAtSize(tok.word, size);
      const addWidth = (line.length ? spaceWidth : 0) + w;
      if (lineWidth + addWidth > maxWidth && line.length) {
        this.drawLine(line, size, lineHeight);
        line = [tok];
        lineWidth = w;
      } else {
        line.push(tok);
        lineWidth += addWidth;
      }
    }
    if (line.length) this.drawLine(line, size, lineHeight);
    this.y -= 13;
  }
  /* AI-written sections come back as one string with blank lines between paragraphs
     (the prompt asks for that). paragraph() alone would collapse those -- it only
     wraps on word boundaries -- so this splits on blank lines first and renders each
     paragraph separately, with its own trailing gap, instead of one dense block. */
  sectionText(text, size = 11.5, lineHeight = 17) {
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
  /* A fully-bold, gold "data chip" line (not just keyword highlighting) with
     a thin left accent bar, for pure-fact lines that should read as a
     quick-reference island above the prose rather than part of it -- the
     per-planet sign/degree/house/aspect line, the stellium callout, and
     house-occupant lines all use this instead of a plain paragraph. */
  boldDataLine(text, size = 10, lineHeight = 14) {
    const indent = 14;
    const maxWidth = PAGE_SIZE[0] - MARGIN * 2 - indent;
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const spaceWidth = this.boldFont.widthOfTextAtSize(" ", size);
    const lines = [];
    let line = "";
    let lineWidth = 0;
    for (const word of words) {
      const w = this.boldFont.widthOfTextAtSize(word, size);
      const addWidth = (line ? spaceWidth : 0) + w;
      if (lineWidth + addWidth > maxWidth && line) {
        lines.push(line);
        line = word;
        lineWidth = w;
      } else {
        line = line ? line + " " + word : word;
        lineWidth += addWidth;
      }
    }
    if (line) lines.push(line);
    if (!lines.length) return;

    this.ensureSpace(lines.length * lineHeight + 8);
    const barTop = this.y + 3;
    lines.forEach((l) => {
      this.page.drawText(l, { x: MARGIN + indent, y: this.y, size, font: this.boldFont, color: HIGHLIGHT });
      this.y -= lineHeight;
    });
    const barBottom = this.y + lineHeight - 3;
    this.page.drawRectangle({ x: MARGIN, y: barBottom, width: 2.5, height: barTop - barBottom, color: MAGENTA });
    this.y -= 8;
  }
  /* Draws one wrapped line as a sequence of words rather than a single
     drawText call, since a line can mix the regular font (plain text) and
     bold font (highlighted chart terms, drawn in gold) token by token. */
  drawLine(tokens, size, lineHeight) {
    this.ensureSpace(lineHeight);
    const spaceWidth = this.font.widthOfTextAtSize(" ", size);
    let x = MARGIN;
    tokens.forEach((tok) => {
      const f = tok.bold ? this.boldFont : this.font;
      this.page.drawText(tok.word, { x, y: this.y, size, font: f, color: tok.bold ? HIGHLIGHT : INK });
      x += f.widthOfTextAtSize(tok.word, size) + spaceWidth;
    });
    this.y -= lineHeight;
  }
  row(cells, widths, opts = {}) {
    const size = opts.size || 9;
    const rowHeight = size + 7;
    this.ensureSpace(rowHeight);
    // Light zebra banding on alternating data rows (never the header) --
    // gives each row a clear edge to scan against instead of a flat grid.
    if (opts.band) {
      const tableWidth = widths.reduce((a, b) => a + b, 0);
      this.page.drawRectangle({ x: MARGIN - 4, y: this.y - rowHeight + size + 2, width: tableWidth + 8, height: rowHeight, color: BOX_BG });
    }
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
    this.y -= rowHeight;
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
    cursor.boldDataLine(`Stelliums detected: ${describeStelliums(facts.stelliums)}`);
  }

  cursor.newPage();
  cursor.heading("Ophiuchus: The Hidden Thirteenth Sign", 15, { kicker: "SECTION 2" });
  cursor.sectionText(sections.ophiuchusSection);

  cursor.heading("The 13th House", 15, { kicker: "SECTION 3" });
  cursor.boldDataLine(`Occupants: ${describeOccupants(facts.house13Occupants)}`);
  cursor.sectionText(sections.house13Section);

  // Every planet and point below gets its own heading and its own section --
  // never two points folded into one paragraph the way "Core Self: Sun &
  // Ascendant" or "Outer Planets: Uranus, Neptune & Pluto" used to.
  cursor.newPage();
  cursor.heading("Sun", 14, { kicker: "SECTION 4" });
  drawPointDataLine(cursor, payload, "Sun", "Sun");
  cursor.sectionText(sections.sunSection);
  cursor.heading("Ascendant", 14, { kicker: "SECTION 5" });
  drawPointDataLine(cursor, payload, "Ascendant", "Ascendant");
  cursor.sectionText(sections.ascendantSection);
  cursor.heading("Moon", 14, { kicker: "SECTION 6" });
  drawPointDataLine(cursor, payload, "Moon", "Moon");
  cursor.sectionText(sections.moonSection);

  cursor.newPage();
  cursor.heading("Mercury", 14, { kicker: "SECTION 7" });
  drawPointDataLine(cursor, payload, "Mercury", "Mercury");
  cursor.sectionText(sections.mercurySection);
  cursor.heading("Venus", 14, { kicker: "SECTION 8" });
  drawPointDataLine(cursor, payload, "Venus", "Venus");
  cursor.sectionText(sections.venusSection);
  cursor.heading("Mars", 14, { kicker: "SECTION 9" });
  drawPointDataLine(cursor, payload, "Mars", "Mars");
  cursor.sectionText(sections.marsSection);

  drawPlacementsTable(cursor, payload);

  cursor.newPage();
  cursor.heading("Jupiter", 14, { kicker: "SECTION 10" });
  drawPointDataLine(cursor, payload, "Jupiter", "Jupiter");
  cursor.sectionText(sections.jupiterSection);
  cursor.heading("Saturn", 14, { kicker: "SECTION 11" });
  drawPointDataLine(cursor, payload, "Saturn", "Saturn");
  cursor.sectionText(sections.saturnSection);

  cursor.newPage();
  cursor.heading("North Node", 14, { kicker: "SECTION 12" });
  drawPointDataLine(cursor, payload, "NorthNode", "North Node");
  cursor.sectionText(sections.northNodeSection);
  cursor.heading("South Node", 14, { kicker: "SECTION 13" });
  drawPointDataLine(cursor, payload, "SouthNode", "South Node");
  cursor.sectionText(sections.southNodeSection);
  cursor.heading("Midheaven", 14, { kicker: "SECTION 14" });
  drawPointDataLine(cursor, payload, "MC", "Midheaven");
  cursor.sectionText(sections.midheavenSection);

  cursor.newPage();
  cursor.heading("Uranus", 14, { kicker: "SECTION 15" });
  drawPointDataLine(cursor, payload, "Uranus", "Uranus");
  cursor.sectionText(sections.uranusSection);
  cursor.heading("Neptune", 14, { kicker: "SECTION 16" });
  drawPointDataLine(cursor, payload, "Neptune", "Neptune");
  cursor.sectionText(sections.neptuneSection);
  cursor.heading("Pluto", 14, { kicker: "SECTION 17" });
  drawPointDataLine(cursor, payload, "Pluto", "Pluto");
  cursor.sectionText(sections.plutoSection);

  cursor.newPage();
  cursor.heading("Chiron", 14, { kicker: "SECTION 18" });
  drawPointDataLine(cursor, payload, "Chiron", "Chiron");
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
  cursor.boldDataLine(
    facts.lilithPoint
      ? `Placement: ${facts.lilithPoint.trueSky.constellation} ${Math.floor(facts.lilithPoint.trueSky.degree)}°, House ${facts.lilithPoint.house}`
      : "Not calculated for this chart."
  );
  cursor.sectionText(sections.lilithSection);

  cursor.heading("Eve", 15, { kicker: "SECTION 2" });
  cursor.boldDataLine(
    facts.evePoint
      ? `Placement: ${facts.evePoint.trueSky.constellation} ${Math.floor(facts.evePoint.trueSky.degree)}°, House ${facts.evePoint.house}`
      : "Not calculated for this chart."
  );
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

/* A bold "data chip" line before a planet section's prose -- sign, degree,
   house, retrograde, and now every aspect involving that point with its
   orb, e.g. "Mercury in Ophiuchus at 14° in House 5 (conjunct Sun, orb
   6.4°; sextile Pluto, orb 2°)". displayName must match payload.aspects'
   point1/point2 naming (the human-readable name, e.g. "North Node") --
   key is the internal chart-engine name used on payload.points (e.g.
   "NorthNode") since the two don't always match. */
function drawPointDataLine(cursor, payload, key, displayName) {
  const p = (payload.points || []).find((point) => point.key === key);
  if (!p) return;
  const aspectBits = (payload.aspects || [])
    .filter((a) => a.point1 === displayName || a.point2 === displayName)
    .map((a) => {
      const other = a.point1 === displayName ? a.point2 : a.point1;
      return `${String(a.aspect || "").toLowerCase()} ${other}, orb ${a.orb}°`;
    });
  const retro = p.retrograde ? ", Retrograde" : "";
  const aspectsText = aspectBits.length ? ` (${aspectBits.join("; ")})` : "";
  const line = `${displayName} in ${p.trueSky.constellation} at ${Math.floor(p.trueSky.degree)}° in House ${p.house}${retro}${aspectsText}`;
  cursor.boldDataLine(line);
}

function drawPlacementsTable(cursor, payload) {
  cursor.heading("Placements Reference", 12);
  const widths = [95, 45, 150, 150];
  cursor.row(["Point", "House", "True Sky", "Tropical"], widths, { bold: true, size: 9.5 });
  (payload.points || []).forEach((p, i) => {
    cursor.row(
      [
        p.name + (p.retrograde ? " (Rx)" : ""),
        p.house,
        `${p.trueSky.constellation} ${Math.floor(p.trueSky.degree)}°`,
        `${p.tropical.sign} ${Math.floor(p.tropical.degree)}°`,
      ],
      widths,
      { band: i % 2 === 1 }
    );
  });
}

function drawAllHousesTable(cursor, facts) {
  cursor.spacer(6);
  const widths = [55, 490];
  cursor.row(["House", "Occupants"], widths, { bold: true, size: 9.5 });
  for (let h = 1; h <= 13; h++) {
    cursor.row([h, describeOccupants(facts.houseOccupants[h])], widths, { size: 9, band: h % 2 === 0 });
  }
}

function drawAspectsTable(cursor, payload) {
  cursor.spacer(6);
  const widths = [130, 100, 130, 80];
  cursor.row(["Point 1", "Aspect", "Point 2", "Orb"], widths, { bold: true, size: 9.5 });
  (payload.aspects || []).forEach((a, i) => {
    cursor.row([a.point1, a.aspect, a.point2, `${a.orb}°`], widths, { band: i % 2 === 1 });
  });
}

function drawTropicalComparisonTable(cursor, payload) {
  cursor.spacer(6);
  const widths = [110, 150, 150, 60];
  cursor.row(["Point", "Tropical", "True Sky", "Changed"], widths, { bold: true, size: 9.5 });
  (payload.tropicalComparison || []).forEach((c, i) => {
    cursor.row(
      [c.point, `${c.tropicalSign} ${Math.floor(c.tropicalDegree)}°`, `${c.trueSkyConstellation} ${Math.floor(c.trueSkyDegree)}°`, c.changedSign ? "Yes" : ""],
      widths,
      { band: i % 2 === 1 }
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
