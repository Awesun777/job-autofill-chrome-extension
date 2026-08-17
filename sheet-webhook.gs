/**
 * Job Tracker webhook v9 — bound Apps Script for the "Job Tracker" spreadsheet.
 * Serves the Smart JobFill extension, the News Radar Applications dashboard,
 * and the local outreach engine (~/.claude/scripts/outreach_apps.py).
 *
 * Tabs (auto-created, hidden): AppData (full JD context per application),
 * Outreach (contacts + generated drafts), Meta (extension resume snapshot).
 *
 * AUTH MODEL: every READ except 'categories' requires ?token=<READ_TOKEN>.
 * Writes from the extension (legacy add-row, context, profile) are open —
 * the extension repo is public so it cannot hold the token; appending junk
 * is the accepted risk, reading anything sensitive is not. addContact /
 * updateContact carry the token (dashboard + engine hold it locally).
 *
 * THE REAL TOKEN LIVES ONLY IN THE DEPLOYED COPY of this script — this repo
 * copy ships a placeholder on purpose.
 */

const SHEET_NAME = "2026";
const HEADER_ROW = 4;
const READ_TOKEN = "__TOKEN_PLACEHOLDER__";

// The separate "Connections" networking spreadsheet the LinkedIn save button
// writes into (fixed monthly tab, per Chen).
const CONNECTIONS_ID = "1h_yQczc26qQEXPfIwkkHyTUHUNMGSlkdy-6E1a8RpZs";
const CONNECTIONS_TAB = "To Reach Out_202608";
const CONN_HEADER_ROW = 3;

// ── plumbing ──────────────────────────────────────────────────────────────────

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function authed_(e) {
  return e && e.parameter && e.parameter.token === READ_TOKEN;
}

function tab_(name, headers) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.hideSheet();
  }
  return sh;
}

const APPDATA_HEADERS = ["appKey", "company", "position", "url", "source", "postDate", "description", "savedAt"];
const OUTREACH_HEADERS = ["id", "appKey", "linkedinUrl", "status", "profileJson", "draftsJson", "similarities", "requestedAt", "updatedAt", "error"];

// ── tracker sheet (categories + rows) ─────────────────────────────────────────

function categories_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  const last = sh.getLastRow();
  const n = last - HEADER_ROW;
  if (n <= 0) return [];
  const vals = sh.getRange(HEADER_ROW + 1, 1, n, 2).getValues();
  const bgs = sh.getRange(HEADER_ROW + 1, 1, n, 1).getBackgrounds();
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

function jobs_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  const cats = categories_();
  const last = sh.getLastRow();
  const out = [];
  for (let i = 0; i < cats.length; i++) {
    const start = cats[i].row;
    const end = i + 1 < cats.length ? cats[i + 1].row - 1 : last;
    const rows = [];
    if (end > start) {
      const vals = sh.getRange(start + 1, 1, end - start, 5).getDisplayValues();
      for (let r = 0; r < vals.length; r++) {
        const v = vals[r];
        if (String(v[1]).trim()) {
          rows.push({
            status: String(v[0]).trim(),
            company: v[1], position: v[2],
            postedDate: v[3], appliedDate: v[4],
          });
        }
      }
    }
    out.push({ category: cats[i].name, jobs: rows });
  }
  return out;
}

// ── hidden-tab readers ────────────────────────────────────────────────────────

function readRows_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  return sh.getRange(2, 1, last - 1, headers.length).getValues().map(function (row) {
    const o = {};
    headers.forEach(function (h, i) { o[h] = row[i]; });
    return o;
  });
}

function workspace_() {
  const appdata = {};
  readRows_(tab_("AppData", APPDATA_HEADERS)).forEach(function (r) {
    appdata[r.appKey] = r;
  });
  return {
    sections: jobs_(),
    appdata: appdata,
    outreach: readRows_(tab_("Outreach", OUTREACH_HEADERS)),
  };
}

function profile_() {
  const sh = tab_("Meta", ["key", "value", "updatedAt"]);
  const rows = readRows_(sh);
  const hit = rows.filter(function (r) { return r.key === "profile"; })[0];
  return hit ? hit.value : "";
}

// ── GET ───────────────────────────────────────────────────────────────────────

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || "categories";
    if (action === "categories") {
      return json_({ ok: true, categories: categories_().map(function (c) { return c.name; }) });
    }
    if (!authed_(e)) return json_({ ok: false, error: "unauthorized" });
    if (action === "jobs") return json_({ ok: true, sections: jobs_() });
    if (action === "workspace") return json_({ ok: true, workspace: workspace_() });
    if (action === "profile") return json_({ ok: true, profile: profile_() });
    return json_({ ok: false, error: "unknown action" });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

function addTrackerRow_(data) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  const cats = categories_();
  const idx = cats.findIndex(function (c) { return c.name === String(data.category).trim(); });
  if (idx === -1) return { ok: false, error: "Unknown category: " + data.category };

  const start = cats[idx].row;
  const nextCatRow = idx + 1 < cats.length ? cats[idx + 1].row : sh.getLastRow() + 1;
  const height = nextCatRow - start - 1;
  let lastData = start;
  if (height > 0) {
    const colB = sh.getRange(start + 1, 2, height, 1).getValues();
    for (let i = 0; i < height; i++) {
      if (String(colB[i][0]).trim()) lastData = start + 1 + i;
    }
  }
  sh.insertRowAfter(lastData);
  const target = lastData + 1;
  sh.getRange(target, 1, 1, 5).setBackground(null);
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
  return { ok: true, row: target };
}

function saveContext_(data) {
  const sh = tab_("AppData", APPDATA_HEADERS);
  const rows = readRows_(sh);
  const at = new Date().toISOString();
  const rowVals = [data.appKey, data.company || "", data.position || "", data.url || "",
    data.source || "", data.postDate || "", String(data.description || "").slice(0, 45000), at];
  const hit = rows.findIndex(function (r) { return r.appKey === data.appKey; });
  if (hit >= 0) sh.getRange(hit + 2, 1, 1, rowVals.length).setValues([rowVals]);
  else sh.appendRow(rowVals);
  return { ok: true };
}

function saveProfile_(data) {
  const sh = tab_("Meta", ["key", "value", "updatedAt"]);
  const rows = readRows_(sh);
  const at = new Date().toISOString();
  const hit = rows.findIndex(function (r) { return r.key === "profile"; });
  const vals = ["profile", JSON.stringify(data.profile || {}), at];
  if (hit >= 0) sh.getRange(hit + 2, 1, 1, 3).setValues([vals]);
  else sh.appendRow(vals);
  return { ok: true };
}

function addContact_(data) {
  const sh = tab_("Outreach", OUTREACH_HEADERS);
  const at = new Date().toISOString();
  sh.appendRow([Utilities.getUuid(), data.appKey, String(data.linkedinUrl || "").trim(),
    "queued", "", "", "", at, at, ""]);
  return { ok: true };
}

function updateContact_(data) {
  const sh = tab_("Outreach", OUTREACH_HEADERS);
  const rows = readRows_(sh);
  const hit = rows.findIndex(function (r) { return r.id === data.id; });
  if (hit < 0) return { ok: false, error: "contact not found" };
  const row = hit + 2;
  const set = function (col, val) { sh.getRange(row, col).setValue(val); };
  if (data.status !== undefined) set(4, data.status);
  if (data.profileJson !== undefined) set(5, String(data.profileJson).slice(0, 45000));
  if (data.draftsJson !== undefined) set(6, String(data.draftsJson).slice(0, 45000));
  if (data.similarities !== undefined) set(7, String(data.similarities).slice(0, 2000));
  if (data.error !== undefined) set(10, String(data.error).slice(0, 1000));
  set(9, new Date().toISOString());
  return { ok: true };
}

function removeContact_(data) {
  const sh = tab_("Outreach", OUTREACH_HEADERS);
  const rows = readRows_(sh);
  const hit = rows.findIndex(function (r) { return r.id === data.id; });
  if (hit < 0) return { ok: false, error: "contact not found" };
  sh.deleteRow(hit + 2);
  return { ok: true };
}

function saveConnection_(data) {
  const ss = SpreadsheetApp.openById(CONNECTIONS_ID);
  const sh = ss.getSheetByName(CONNECTIONS_TAB);
  if (!sh) return { ok: false, error: "Tab not found: " + CONNECTIONS_TAB };
  const readHeaders = function () {
    return sh.getRange(CONN_HEADER_ROW, 1, 1, sh.getLastColumn()).getValues()[0]
      .map(function (h) { return String(h).trim(); });
  };
  let headers = readHeaders();
  // One-time rename: the SIPA? column now holds the person's company.
  const sipa = headers.indexOf("SIPA?");
  if (sipa >= 0) sh.getRange(CONN_HEADER_ROW, sipa + 1).setValue("Company");
  headers = readHeaders();
  let li = headers.findIndex(function (h) { return /linkedin/i.test(h); });
  if (li < 0) {
    const em = headers.findIndex(function (h) { return /^e-?mail/i.test(h); });
    const at = em >= 0 ? em + 1 : headers.length;
    sh.insertColumnAfter(at);
    sh.getRange(CONN_HEADER_ROW, at + 1).setValue("LinkedIn");
    headers = readHeaders();
    li = headers.indexOf("LinkedIn");
  }
  const col = function (name) { return headers.indexOf(name) + 1; };
  const url = String(data.linkedinUrl || "").trim();
  // Re-saving the same person updates their row instead of duplicating it.
  let target = 0;
  const last = sh.getLastRow();
  if (last > CONN_HEADER_ROW && url) {
    const urls = sh.getRange(CONN_HEADER_ROW + 1, li + 1, last - CONN_HEADER_ROW, 1).getValues();
    for (let i = 0; i < urls.length; i++) {
      if (String(urls[i][0]).trim() === url) { target = CONN_HEADER_ROW + 1 + i; break; }
    }
  }
  if (!target) {
    const nameCol = col("Name") || 3;
    const names = last > CONN_HEADER_ROW ? sh.getRange(CONN_HEADER_ROW + 1, nameCol, last - CONN_HEADER_ROW, 1).getValues() : [];
    target = CONN_HEADER_ROW + 1 + names.length;
    for (let i = 0; i < names.length; i++) {
      if (!String(names[i][0]).trim()) { target = CONN_HEADER_ROW + 1 + i; break; }
    }
  }
  const put = function (name, val) { const c = col(name); if (c > 0 && val) sh.getRange(target, c).setValue(val); };
  put("Name", data.name);
  put("Company", data.company);
  put("Title", data.title);
  put("Past experience", data.pastExperience);
  put("Base", data.base);
  put("LinkedIn", url);
  return { ok: true, row: target };
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const type = data.type || "addRow";
    if (type === "addRow") return json_(addTrackerRow_(data));       // extension (legacy shape)
    if (type === "context") return json_(saveContext_(data));       // extension
    if (type === "profile") return json_(saveProfile_(data));       // extension
    if (type === "connection") return json_(saveConnection_(data)); // extension (LinkedIn button)
    // Dashboard / engine actions carry the token.
    if (data.token !== READ_TOKEN) return json_({ ok: false, error: "unauthorized" });
    if (type === "addContact") return json_(addContact_(data));
    if (type === "updateContact") return json_(updateContact_(data));
    if (type === "removeContact") return json_(removeContact_(data));
    return json_({ ok: false, error: "unknown type" });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}
