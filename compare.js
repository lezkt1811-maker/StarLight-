/* ==========================================================================
   StarChart13 — Tropical Comparison Mode
   STAGE 3: Compare tab only. No PNG export yet (that's Stage 4).

   This file never touches draw(), tropical.js's calculations, or the
   comparePlacements() logic from Stage 1 -- it only reads
   combinedChart.comparison (already computed) and renders it, plus two
   small wheel previews.
   ========================================================================== */

function sc13DisplayName(name) {
  // "NorthNode" -> "North Node", purely cosmetic for table readability.
  return String(name).replace(/([a-z])([A-Z])/g, "$1 $2");
}

function sc13EscapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* renderCompareView(combinedChart, targetElement)
   Builds:
     1. Two small wheel previews (Tropical + StarChart13)
     2. A placement comparison table, from combinedChart.comparison
        (computed once already by Stage 1's comparePlacements())
     3. A separate "House-system differences" section -- a StarChart13
        house number (1-13, real-constellation widths) and a tropical
        house number (1-12, equal houses) are never the same kind of
        measurement, so they are shown side by side, never as
        "changed/same". */
function renderCompareView(combinedChart, targetElement) {
  try {
    if (!targetElement) return;

    if (!combinedChart || !combinedChart.tropical || !combinedChart.starChart13) {
      targetElement.innerHTML =
        '<div style="padding:24px 12px;color:#333;background:#fff;font-family:Arial,sans-serif;' +
        'font-size:14px;text-align:center;">Tap "Generate Chart" first to see the comparison.</div>';
      return;
    }

    targetElement.innerHTML = "";
    targetElement.style.background = "#ffffff";

    /* ---------- header: name / birth info ---------- */
    const person = combinedChart.person || {};
    const header = document.createElement("div");
    header.style.cssText = "padding:12px 10px 4px;text-align:center;font-family:Arial,sans-serif;";
    const nameLine = person.name
      ? '<div style="font-weight:700;font-size:15px;color:#000;">' + sc13EscapeHtml(person.name) + "</div>"
      : "";
    const dtLine = [person.birthDate, person.birthTime, person.birthplace].filter(Boolean).join(" \u00B7 ");
    header.innerHTML = nameLine + (dtLine ? '<div style="font-size:12px;color:#555;margin-top:2px;">' + sc13EscapeHtml(dtLine) + "</div>" : "");
    targetElement.appendChild(header);

    /* ---------- side-by-side wheel previews ---------- */
    const previewRow = document.createElement("div");
    previewRow.style.cssText = "display:flex;flex-wrap:wrap;gap:10px;padding:10px;justify-content:center;";

    const tropCol = document.createElement("div");
    tropCol.style.cssText = "flex:1;min-width:150px;max-width:260px;";
    tropCol.innerHTML = '<div style="text-align:center;font-family:Arial,sans-serif;font-weight:700;font-size:12px;color:#000;margin-bottom:4px;">Tropical</div>';
    const tropPreview = document.createElement("div");
    tropPreview.style.cssText = "width:100%;min-width:0;overflow:hidden;display:flex;";
    tropCol.appendChild(tropPreview);

    const sc13Col = document.createElement("div");
    sc13Col.style.cssText = "flex:1;min-width:150px;max-width:260px;";
    sc13Col.innerHTML = '<div style="text-align:center;font-family:Arial,sans-serif;font-weight:700;font-size:12px;color:#000;margin-bottom:4px;">StarChart13</div>';
    const sc13Preview = document.createElement("div");
    sc13Preview.style.cssText = "width:100%;min-width:0;overflow:hidden;display:flex;";
    sc13Col.appendChild(sc13Preview);

    previewRow.appendChild(tropCol);
    previewRow.appendChild(sc13Col);
    targetElement.appendChild(previewRow);

    /* Tropical small preview: reuse our own renderer (Stage 2), just into
       a smaller container. No new drawing logic here. */
    if (typeof renderTropicalWheel === "function") {
      renderTropicalWheel(combinedChart, tropPreview);
    }

    /* StarChart13 small preview: copy the ALREADY-RENDERED #cv bitmap.
       This never calls draw() again and never modifies the live #cv
       canvas -- it only reads pixels draw() already put there during
       chart generation. */
    const sourceCv = document.getElementById("cv");
    if (sourceCv && sourceCv.width > 0) {
      const previewCv = document.createElement("canvas");
      const size = Math.min(sc13Preview.clientWidth || 260, 600);
      const dpr = Math.min(4, window.devicePixelRatio || 1);
      previewCv.style.width = size + "px";
      previewCv.style.height = size + "px";
      previewCv.width = Math.round(size * dpr);
      previewCv.height = Math.round(size * dpr);
      const pctx = previewCv.getContext("2d");
      pctx.drawImage(sourceCv, 0, 0, sourceCv.width, sourceCv.height, 0, 0, previewCv.width, previewCv.height);
      sc13Preview.appendChild(previewCv);
    } else {
      sc13Preview.innerHTML =
        '<div style="padding:16px;color:#900;font-family:Arial,sans-serif;font-size:12px;text-align:center;">' +
        'Visit the StarChart13 tab once so its wheel renders, then come back to Compare.</div>';
    }

    /* ---------- comparison summary + placement table ---------- */
    const comparison = combinedChart.comparison || { rows: [], changedCount: 0, totalCount: 0 };

    const summary = document.createElement("div");
    summary.style.cssText = "text-align:center;padding:8px 10px 2px;font-family:Arial,sans-serif;font-size:13px;color:#000;font-weight:700;";
    summary.textContent = comparison.changedCount + " of " + comparison.totalCount + " placements changed";
    targetElement.appendChild(summary);

    const note = document.createElement("div");
    note.style.cssText = "text-align:center;padding:0 16px 10px;font-family:Arial,sans-serif;font-size:11px;color:#555;";
    note.textContent = "The planetary positions come from the same birth moment. The two systems divide and interpret the zodiac differently.";
    targetElement.appendChild(note);

    const table = document.createElement("table");
    table.style.cssText = "width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px;";
    const thead = document.createElement("thead");
    thead.innerHTML =
      '<tr style="background:#f0f0f0;">' +
      '<th style="text-align:left;padding:6px 8px;border-bottom:1px solid #ccc;color:#000;">Placement</th>' +
      '<th style="text-align:left;padding:6px 8px;border-bottom:1px solid #ccc;color:#000;">Tropical</th>' +
      '<th style="text-align:left;padding:6px 8px;border-bottom:1px solid #ccc;color:#000;">StarChart13</th>' +
      '<th style="text-align:center;padding:6px 8px;border-bottom:1px solid #ccc;color:#000;">&nbsp;</th>' +
      "</tr>";
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    comparison.rows.forEach(function (row, idx) {
      const tr = document.createElement("tr");
      tr.style.background = idx % 2 === 0 ? "#ffffff" : "#fafafa";
      const badgeColor = row.changed ? "#b03030" : "#2e7d32";
      const badgeText = row.changed ? "Changed" : "Same";
      tr.innerHTML =
        '<td style="padding:6px 8px;border-bottom:1px solid #eee;color:#111;">' + sc13EscapeHtml(sc13DisplayName(row.body)) + "</td>" +
        '<td style="padding:6px 8px;border-bottom:1px solid #eee;color:#111;">' + sc13EscapeHtml(row.tropicalSign) + " " + Math.floor(row.tropicalDegree) + "\u00B0</td>" +
        '<td style="padding:6px 8px;border-bottom:1px solid #eee;color:#111;">' + sc13EscapeHtml(row.starChart13Sign) + " " + Math.floor(row.starChart13Degree) + "\u00B0</td>" +
        '<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;">' +
        '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:' + badgeColor + '22;color:' + badgeColor + ';">' + badgeText + "</span></td>";
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    const tableWrap = document.createElement("div");
    tableWrap.style.cssText = "overflow-x:auto;padding:0 10px;";
    tableWrap.appendChild(table);
    targetElement.appendChild(tableWrap);

    /* ---------- house-system differences (kept explicitly separate) ---------- */
    const houseHeader = document.createElement("div");
    houseHeader.style.cssText = "padding:16px 10px 4px;font-family:Arial,sans-serif;font-weight:700;font-size:13px;color:#000;text-align:center;";
    houseHeader.textContent = "House-system differences";
    targetElement.appendChild(houseHeader);

    const houseSubnote = document.createElement("div");
    houseSubnote.style.cssText = "text-align:center;padding:0 16px 8px;font-family:Arial,sans-serif;font-size:11px;color:#555;";
    houseSubnote.textContent = "StarChart13 uses 13 real-constellation-width houses. Tropical here uses 12 equal houses from the Ascendant. These are different systems, not a right-vs-wrong comparison.";
    targetElement.appendChild(houseSubnote);

    const houseTable = document.createElement("table");
    houseTable.style.cssText = "width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px;margin-bottom:16px;";
    const hThead = document.createElement("thead");
    hThead.innerHTML =
      '<tr style="background:#f0f0f0;">' +
      '<th style="text-align:left;padding:6px 8px;border-bottom:1px solid #ccc;color:#000;">Placement</th>' +
      '<th style="text-align:left;padding:6px 8px;border-bottom:1px solid #ccc;color:#000;">Tropical house (1\u201312)</th>' +
      '<th style="text-align:left;padding:6px 8px;border-bottom:1px solid #ccc;color:#000;">StarChart13 house (1\u201313)</th>' +
      "</tr>";
    houseTable.appendChild(hThead);

    const hTbody = document.createElement("tbody");
    const tropHouses = combinedChart.tropical.houses || {};
    const sc13PlacementsByName = combinedChart.starChart13.placements || {};
    let rowIdx = 0;
    Object.keys(tropHouses).forEach(function (name) {
      const sc13Entry = sc13PlacementsByName[name];
      if (!sc13Entry) return;
      const tr = document.createElement("tr");
      tr.style.background = rowIdx % 2 === 0 ? "#ffffff" : "#fafafa";
      rowIdx++;
      tr.innerHTML =
        '<td style="padding:6px 8px;border-bottom:1px solid #eee;color:#111;">' + sc13EscapeHtml(sc13DisplayName(name)) + "</td>" +
        '<td style="padding:6px 8px;border-bottom:1px solid #eee;color:#111;">' + tropHouses[name] + "</td>" +
        '<td style="padding:6px 8px;border-bottom:1px solid #eee;color:#111;">' + (sc13Entry.house != null ? sc13Entry.house : "\u2014") + "</td>";
      hTbody.appendChild(tr);
    });
    houseTable.appendChild(hTbody);

    const houseTableWrap = document.createElement("div");
    houseTableWrap.style.cssText = "overflow-x:auto;padding:0 10px;";
    houseTableWrap.appendChild(houseTable);
    targetElement.appendChild(houseTableWrap);
  } catch (err) {
    console.error("renderCompareView failed — other tabs are unaffected:", err);
    if (targetElement) {
      targetElement.innerHTML =
        '<div style="padding:24px 12px;color:#900;background:#fff;font-family:Arial,sans-serif;' +
        'font-size:14px;text-align:center;">Could not render the comparison. Other tabs are unaffected.</div>';
    }
  }
}

if (typeof window !== "undefined") {
  window.renderCompareView = renderCompareView;
}
