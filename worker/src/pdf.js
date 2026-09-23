import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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
  heading(text, size = 15) {
    this.ensureSpace(size + 18);
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
  const sections = interpretation || fallbackSections(payload);
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
  cursor.heading("Chart Signature");
  cursor.paragraph(sections.chartSignature);
  cursor.heading("Core Identity");
  cursor.paragraph(sections.coreIdentity);

  drawPlacementsTable(cursor, payload);

  cursor.newPage();
  cursor.heading("Planetary Synthesis");
  cursor.paragraph(sections.planetarySynthesis);
  if (sections.lilithEveAxis) {
    cursor.heading("Lilith – Eve Axis");
    cursor.paragraph(sections.lilithEveAxis);
  }

  drawAspectsTable(cursor, payload);

  cursor.newPage();
  cursor.heading("Major Aspects");
  cursor.paragraph(sections.majorAspectsNarrative);
  cursor.heading("Love & Relationships");
  cursor.paragraph(sections.loveRelationships);
  cursor.heading("Purpose, Work & Creation");
  cursor.paragraph(sections.purposeWorkCreation);

  drawTropicalComparisonTable(cursor, payload);

  cursor.newPage();
  cursor.heading("Integrated Message");
  cursor.paragraph(sections.integratedMessage);

  drawDisclaimer(cursor);

  return doc.save();
}

function drawCover(cursor, payload) {
  const { page } = cursor;
  cursor.y = PAGE_SIZE[1] - 220;
  page.drawText("StarChart13", {
    x: MARGIN,
    y: cursor.y,
    size: 30,
    font: cursor.boldFont,
    color: GOLD,
  });
  cursor.y -= 34;
  page.drawText("Detailed True-Sky Natal Reading", {
    x: MARGIN,
    y: cursor.y,
    size: 15,
    font: cursor.font,
    color: INK,
  });
  cursor.y -= 50;

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

  cursor.y -= 20;
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
  cursor.page.drawImage(png, {
    x: MARGIN + (maxWidth - w) / 2,
    y: cursor.y - h,
    width: w,
    height: h,
  });
  cursor.y -= h + 10;
}

function drawPlacementsTable(cursor, payload) {
  cursor.heading("Placements");
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

function drawAspectsTable(cursor, payload) {
  cursor.heading("Aspects");
  const widths = [130, 100, 130, 80];
  cursor.row(["Point 1", "Aspect", "Point 2", "Orb"], widths, { bold: true, size: 9.5 });
  (payload.aspects || []).forEach((a) => {
    cursor.row([a.point1, a.aspect, a.point2, `${a.orb}°`], widths);
  });
}

function drawTropicalComparisonTable(cursor, payload) {
  cursor.heading("Tropical vs. True Sky");
  const widths = [110, 150, 150, 60];
  cursor.row(["Point", "Tropical", "True Sky", "Changed"], widths, { bold: true, size: 9.5 });
  (payload.tropicalComparison || []).forEach((c) => {
    cursor.row(
      [
        c.point,
        `${c.tropicalSign} ${Math.floor(c.tropicalDegree)}°`,
        `${c.trueSkyConstellation} ${Math.floor(c.trueSkyDegree)}°`,
        c.changedSign ? "Yes" : "",
      ],
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
      "such as Sky Map and Stellarium — alongside the traditional 12-sign tropical zodiac for comparison. " +
      "This reading is offered for reflection and entertainment purposes.",
    9.5,
    13
  );
}

function fallbackSections(payload) {
  const asc = payload.calculation?.ascendant;
  const generic =
    "We weren't able to generate the personalized narrative for this section automatically, but the " +
    "chart data below is complete and accurate — StarChart13 will follow up with the full written " +
    "interpretation shortly.";
  return {
    chartSignature: asc
      ? `Your Ascendant falls in ${asc.constellation} — this is the lens the rest of your chart is read through.`
      : generic,
    coreIdentity: generic,
    planetarySynthesis: generic,
    lilithEveAxis: "",
    majorAspectsNarrative: generic,
    loveRelationships: generic,
    purposeWorkCreation: generic,
    integratedMessage: generic,
  };
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
