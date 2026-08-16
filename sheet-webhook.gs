/**
 * Job Tracker webhook — bound Apps Script for the "Job Tracker" spreadsheet.
 * Deployed as a web app (execute as me, access: anyone) and called by the
 * Smart Job Autofill extension:
 *   GET  ?action=categories → { ok, categories: [...] }   (the gray rows)
 *   POST {company, position, postDate, applyDate, category}
 *        → appends a row at the end of that category's section.
 *
 * A category row = column B has text, column C is empty, and the B cell has a
 * non-white background (the gray band). Data columns: B=Company, C=Position,
 * D=Posted Date, E=Applied Date. Column A (status chips) is left untouched.
 */

const SHEET_NAME = "2026";
const HEADER_ROW = 4;

function categories_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  const last = sh.getLastRow();
  const n = last - HEADER_ROW;
  if (n <= 0) return [];
  const vals = sh.getRange(HEADER_ROW + 1, 2, n, 2).getValues();       // B,C
  const bgs = sh.getRange(HEADER_ROW + 1, 2, n, 1).getBackgrounds();   // B
  const cats = [];
  for (let i = 0; i < n; i++) {
    const b = String(vals[i][0]).trim();
    const c = String(vals[i][1]).trim();
    const bg = String(bgs[i][0]).toLowerCase();
    if (b && !c && bg !== "#ffffff" && bg !== "white") {
      cats.push({ name: b, row: HEADER_ROW + 1 + i });
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
    let target = lastData + 1;
    if (target >= nextCatRow && idx + 1 < cats.length) {
      // Section is full — grow it so the next category keeps its own row.
      sh.insertRowBefore(nextCatRow);
      target = nextCatRow;
    }
    sh.getRange(target, 2, 1, 4).setValues([[
      data.company || "", data.position || "", data.postDate || "", data.applyDate || "",
    ]]);
    return json_({ ok: true, row: target });
  } catch (e2) {
    return json_({ ok: false, error: String(e2) });
  }
}
