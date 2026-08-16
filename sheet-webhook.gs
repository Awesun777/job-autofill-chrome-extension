/**
 * Job Tracker webhook — bound Apps Script for the "Job Tracker" spreadsheet.
 * Deployed as a web app (execute as me, access: anyone) and called by the
 * Smart Job Autofill extension:
 *   GET  ?action=categories → { ok, categories: [...] }   (the gray rows)
 *   POST {company, position, postDate, applyDate, category}
 *        → appends a row at the end of that category's section.
 *
 * A category row = column A has text, column B (Company) is empty, and the A
 * cell has a non-white background (the gray band). Data rows keep status chips
 * in A. Data columns: B=Company, C=Position, D=Posted Date, E=Applied Date.
 *
 * DEPLOYED as Version 4 (2026-08-16) at:
 * https://script.google.com/macros/s/AKfycbx8UQW40PMfKpi8_mwJGkicY-jGEow5Op2s8lNku2vzcWvjKX-dZhI_lEMknbSbrKmo/exec
 */

const SHEET_NAME = "2026";
const HEADER_ROW = 4;

function categories_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  const last = sh.getLastRow();
  const n = last - HEADER_ROW;
  if (n <= 0) return [];
  const vals = sh.getRange(HEADER_ROW + 1, 1, n, 2).getValues();       // A,B
  const bgs = sh.getRange(HEADER_ROW + 1, 1, n, 1).getBackgrounds();   // A
  const cats = [];
  for (let i = 0; i < n; i++) {
    const a = String(vals[i][0]).trim();
    const b = String(vals[i][1]).trim();
    const bg = String(bgs[i][0]).toLowerCase();
    if (a && !b && bg !== "#ffffff" && bg !== "white") {
      cats.push({ name: a, row: HEADER_ROW + 1 + i });
    }
  }
  return cats;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  try {
    return json_({ ok: true, categories: categories_().map((c) => c.name) });
  } catch (e) {
    return json_({ ok: false, error: String(e) });
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
    const cats = categories_();
    const idx = cats.findIndex((c) => c.name === String(data.category).trim());
    if (idx === -1) return json_({ ok: false, error: "Unknown category: " + data.category });

    const start = cats[idx].row;
    const nextCatRow = idx + 1 < cats.length ? cats[idx + 1].row : sh.getLastRow() + 1;

    // Last row inside the section that already has a company; the new entry
    // goes on the first line after it (sections keep blank padding rows).
    const height = nextCatRow - start - 1;
    let lastData = start;
    if (height > 0) {
      const colB = sh.getRange(start + 1, 2, height, 1).getValues();
      for (let i = 0; i < height; i++) {
        if (String(colB[i][0]).trim()) lastData = start + 1 + i;
      }
    }
    // Always insert a fresh row after the last entry; never reuse the blank
    // padding rows a section keeps. Clear inherited backgrounds so the new
    // row starts clean (no gray band, no copied status chip in column A).
    sh.insertRowAfter(lastData);
    const target = lastData + 1;
    sh.getRange(target, 1, 1, 5).setBackground(null);
    // Dates go in as real Date values, parsed field-by-field to dodge the
    // UTC off-by-one of new Date("yyyy-mm-dd"); they render in the sheet's
    // M/D/YYYY format like every hand-entered date.
    const toDate = function (s) {
      s = String(s || "").trim();
      if (!s) return "";
      let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
      return s;
    };
    sh.getRange(target, 2, 1, 4).setValues([[
      data.company || "", data.position || "", toDate(data.postDate), toDate(data.applyDate),
    ]]);
    return json_({ ok: true, row: target });
  } catch (e2) {
    return json_({ ok: false, error: String(e2) });
  }
}
