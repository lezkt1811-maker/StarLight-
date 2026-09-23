import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { deriveChartFacts, describeOccupants } from "./facts.js";

const PAGE_SIZE = [612, 792]; // US Letter
const MARGIN = 54;
const GOLD = rgb(0.63, 0.47, 0);
const INK = rgb(0.12, 0.12, 0.14);
const MUTED = rgb(0.4, 0.4, 0.42);

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
  }
  ensureSpace(height) {
    if (this.y - height < MARGIN) this.newPage();
  }
  heading(text, size = 14, opts = {}) {
    this.ensureSpace(size + 18);
    if (opts.kicker) {
      this.page.drawText(opts.kicker, { x: MARGIN, y: this.y, size: 9, font: this.boldFont, color: MUTED });
      this.y -= 12;
    }
    this.page.drawText(text, { x: MARGIN, y: this.y, size, font: this.boldFont, color: GOLD });
    this.y -= size + 12;
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

  drawCover(cursor, payload);

  if (payload.wheelImagePNG) {
    try {
      await drawWheelImage(doc, cursor, payload);
    } catch (e) {
      console.error("Could not embed wheel image", e.message);
    }
  }

  cursor.newPage();
  cursor.heading("Your True-Sky Chart at a Glance", 15, { kicker: "SECTION 1" });
  cursor.paragraph(sections.chartGlance);

  cursor.newPage();
  cursor.heading("Ophiuchus: The Hidden Thirteenth Sign", 15, { kicker: "SECTION 2" });
  cursor.paragraph(sections.ophiuchusSection);

  cursor.heading("The 13th House", 15, { kicker: "SECTION 3" });
  cursor.paragraph(`Occupants: ${describeOccupants(facts.house13Occupants)}`, 9.5, 13);
  cursor.spacer(4);
  cursor.paragraph(sections.house13Section);

  cursor.newPage();
  cursor.heading("Core Self", 14, { kicker: "SECTION 4" });
  cursor.paragraph(sections.coreSelf);
  cursor.heading("Emotional Nature", 14, { kicker: "SECTION 5" });
  cursor.paragraph(sections.emotionalNature);
  cursor.heading("Mind & Communication", 14, { kicker: "SECTION 6" });
  cursor.paragraph(sections.mindCommunication);

  drawPlacementsTable(cursor, payload);

  cursor.newPage();
  cursor.heading("Love, Desire & Relationships", 14, { kicker: "SECTION 7" });
  cursor.paragraph(sections.loveRelationships);
  cursor.heading("Purpose, Growth & Direction", 14, { kicker: "SECTION 8" });
  cursor.paragraph(sections.purposeGrowth);
  cursor.heading("Outer Planets", 14, { kicker: "SECTION 9" });
  cursor.paragraph(sections.outerPlanets);

  cursor.newPage();
  cursor.heading("Lilith & Eve Axis", 14, { kicker: "SECTION 10" });
  cursor.paragraph(sections.lilithEveAxis);

  cursor.heading("All 13 Houses", 14, { kicker: "SECTION 11" });
  cursor.paragraph(sections.allHousesNarrative);
  drawAllHousesTable(cursor, facts);

  cursor.newPage();
  cursor.heading("Major Aspect Patterns", 14, { kicker: "SECTION 12" });
  cursor.paragraph(sections.aspectPatterns);
  drawAspectsTable(cursor, payload);

  cursor.newPage();
  cursor.heading("Tropical vs. True Sky", 14, { kicker: "SECTION 13" });
  cursor.paragraph(sections.tropicalDifferential);
  drawTropicalComparisonTable(cursor, payload);

  cursor.newPage();
  cursor.heading("Integrated Synthesis", 14, { kicker: "SECTION 14" });
  cursor.paragraph(sections.integratedSynthesis);

  drawDisclaimer(cursor);

  drawPageNumbers(doc, font);

  return doc.save();
}

function drawCover(cursor, payload) {
  const { page } = cursor;
  cursor.y = PAGE_SIZE[1] - 220;
  page.drawText("StarChart13", { x: MARGIN, y: cursor.y, size: 30, font: cursor.boldFont, color: GOLD });
  cursor.y -= 34;
  page.drawText("Detailed True-Sky Natal Reading", { x: MARGIN, y: cursor.y, size: 15, font: cursor.font, color: INK });
  cursor.y -= 22;
  page.drawText("13 Signs • 13 Houses • Ophiuchus Included", { x: MARGIN, y: cursor.y, size: 10, font: cursor.font, color: MUTED });
  cursor.y -= 44;

  const c = payload.customer || {};
  const lines = [
    c.name ? `Prepared for: ${c.name}` : null,
    c.birthDate ? `Birth date: ${c.birthDate}` : null,
    c.birthTime24h ? `Birth time: ${c.birthTime24h}` : null,
    c.birthLocation ? `Birth location: ${c.birthLocation}` : null,
  ].filter(Boolean);
  lines.forEach((l) => {
    page.drawText(l, { x: MARGIN, y: cursor.y, size: 12, font: cursor.font, color: INK });
    cursor.y -= 20;
  });

  cursor.y -= 10;
  page.drawText(`Generated: ${new Date().toISOString().slice(0, 10)}`, { x: MARGIN, y: cursor.y, size: 9, font: cursor.font, color: MUTED });
  cursor.y -= 24;
  page.drawText(
    "Your 13 signs, all 13 houses, major aspects, and your tropical vs. true-sky differential.",
    { x: MARGIN, y: cursor.y, size: 10, font: cursor.font, color: MUTED }
  );
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
    "StarChart13 calculates placements against the real astronomical positions of the 13 constellations " +
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
    "the data above is complete and accurate, and StarChart13 will follow up with the full narrative.)";
  const asc = facts.ascendant;
  return {
    chartGlance: (asc ? `Your Ascendant is in ${asc.constellation} ${Math.floor(asc.degree)}°.` : "") + note,
    ophiuchusSection: facts.hasOphiuchus
      ? `Ophiuchus placements: ${describeOccupants(facts.ophiuchusPlacements)}.` + note
      : "None of your calculated placements fall within Ophiuchus in this chart.",
    house13Section: `13th house occupants: ${describeOccupants(facts.house13Occupants)}.` + note,
    coreSelf: note.trim(),
    emotionalNature: note.trim(),
    mindCommunication: note.trim(),
    loveRelationships: note.trim(),
    purposeGrowth: note.trim(),
    outerPlanets: note.trim(),
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
