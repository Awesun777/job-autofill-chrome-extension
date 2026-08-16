// Side-panel home for Smart Job Autofill, in the RomainTalk design system.
// Reads the same chrome.storage the React editor writes and talks to the same
// background worker, so the two UIs stay interchangeable:
//   home  — resume blocks: single-click selects (persisted), double-click
//           opens the read-only detail view; Autofill uses the selection.
//   detail — the profile laid out like the editor's Profiles form, but
//           read-only: click any field/chip to copy it.
// Editing still happens in the original React app via "Manage profiles".

const KEYS = {
  PROFILES: "sja_profiles", ACTIVE_ID: "sja_active_profile_id", SAVED_JOBS: "sja_saved_jobs",
  SHEET_WEBHOOK: "sja_sheet_webhook", SHEET_CATS: "sja_sheet_categories",
};

// The Job Tracker sheet's Apps Script web app (deployed from sheet-webhook.gs).
// Baked in so the sheet connection works out of the box; a value stored under
// KEYS.SHEET_WEBHOOK still overrides it if the script is ever redeployed.
const DEFAULT_WEBHOOK = "https://script.google.com/macros/s/AKfycbx8UQW40PMfKpi8_mwJGkicY-jGEow5Op2s8lNku2vzcWvjKX-dZhI_lEMknbSbrKmo/exec";

let profiles = [];
let savedJobs = [];
let sheetWebhook = "";
let sheetCats = [];
let activeId = null;
let view = { name: "home" }; // or { name: "detail", id } or { name: "jobs" }

const main = document.getElementById("main");
const dock = document.getElementById("dock");
document.getElementById("ver").textContent = "v" + chrome.runtime.getManifest().version;

// ── autofill ─────────────────────────────────────────────────────────────────
// Same job as the old Fill tab, but done directly from the panel: find the
// active tab in THIS window (the panel is docked in it, so no ambiguity about
// which window is "current") and hand the profile to the content script. If
// the page was loaded before the extension (no listener yet), inject
// content.js and retry once.

async function doAutofill() {
  const profile = profiles.find((p) => p.id === activeId) || profiles[0];
  if (!profile) throw new Error("No resume selected. Create one via Manage profiles.");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found.");
  if (!/^https?:/.test(tab.url ?? "")) {
    throw new Error("Open the job application page in this window first.");
  }
  const send = () => chrome.tabs.sendMessage(tab.id, { type: "DO_AUTOFILL", profile });
  try {
    await send();
  } catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    await new Promise((r) => setTimeout(r, 150));
    await send();
  }
}

// ── data ─────────────────────────────────────────────────────────────────────

async function load() {
  const d = await chrome.storage.local.get([KEYS.PROFILES, KEYS.ACTIVE_ID, KEYS.SAVED_JOBS, KEYS.SHEET_WEBHOOK, KEYS.SHEET_CATS]);
  profiles = d[KEYS.PROFILES] || [];
  savedJobs = d[KEYS.SAVED_JOBS] || [];
  sheetWebhook = d[KEYS.SHEET_WEBHOOK] || DEFAULT_WEBHOOK;
  sheetCats = d[KEYS.SHEET_CATS] || [];
  activeId = d[KEYS.ACTIVE_ID] || profiles[0]?.id || null;
  // If the profile being viewed was deleted in the editor, fall back home.
  if (view.name === "detail" && !profiles.some((p) => p.id === view.id)) view = { name: "home" };
  render();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes[KEYS.PROFILES] || changes[KEYS.ACTIVE_ID] || changes[KEYS.SAVED_JOBS] || changes[KEYS.SHEET_WEBHOOK] || changes[KEYS.SHEET_CATS])) load();
});

// ── shared helpers ───────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const toast = document.getElementById("toast");
let toastTimer = 0;
function copied(el, x, y) {
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 400);
  toast.style.left = `${Math.min(x, window.innerWidth - 90)}px`;
  toast.style.top = `${Math.max(y - 30, 4)}px`;
  toast.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.style.opacity = "0"; }, 1000);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// ── home view ────────────────────────────────────────────────────────────────

function profileMeta(p) {
  const bits = [];
  const title = p.experience?.[0]?.title;
  if (title) bits.push(title);
  if (p.personal?.email) bits.push(p.personal.email);
  return bits.join(" · ") || "No details yet";
}

function initials(p) {
  const a = (p.personal?.firstName || p.name || "?")[0] ?? "?";
  const b = (p.personal?.lastName || "")[0] ?? "";
  return (a + b).toUpperCase();
}

function renderHome() {
  main.innerHTML = "";

  if (!profiles.length) {
    main.appendChild(el(`<div class="empty">No resumes yet.<br/>Open <b>Profiles</b> below to upload or create one.</div>`));
    return;
  }

  main.appendChild(el(`<div class="label">Resumes</div>`));
  main.appendChild(el(`<div class="hint">Single-click to select · double-click to view &amp; copy</div>`));

  const list = el(`<div class="blocks"></div>`);
  for (const p of profiles) {
    const block = el(`
      <div class="block ${p.id === activeId ? "selected" : ""}">
        <div class="block-avatar">${esc(initials(p))}</div>
        <div class="block-info">
          <div class="block-name">${esc(p.name || "Untitled resume")}</div>
          <div class="block-meta">${esc(profileMeta(p))}</div>
        </div>
        <div class="block-check">✓</div>
      </div>`);
    block.addEventListener("click", () => {
      activeId = p.id;
      chrome.storage.local.set({ [KEYS.ACTIVE_ID]: p.id });
      for (const b of list.children) b.classList.remove("selected");
      block.classList.add("selected");
    });
    block.addEventListener("dblclick", () => {
      view = { name: "detail", id: p.id };
      render();
    });
    list.appendChild(block);
  }
  main.appendChild(list);

  // Autofill sits right beneath the resume blocks, in flow.
  const actions = el(`<div class="actions"></div>`);
  const banner = el(`<div class="banner"></div>`);
  const fill = el(`<button class="btn-primary">Autofill this page</button>`);
  fill.addEventListener("click", async () => {
    fill.disabled = true;
    fill.textContent = "Filling…";
    try {
      await doAutofill();
      banner.className = "banner ok";
      banner.textContent = "Fields filled — review and submit.";
    } catch (e) {
      banner.className = "banner err";
      banner.textContent = e?.message || "Could not autofill this page.";
    }
    fill.disabled = false;
    fill.textContent = "Autofill this page";
  });
  actions.appendChild(fill);
  actions.appendChild(banner);
  main.appendChild(actions);
}

// ── bottom menu: Fill · Jobs · Profiles · Settings ───────────────────────────
// The floating block is the app's navigation. Fill and Jobs live in this
// panel; Profiles and Settings open the React editor on the matching tab.
function renderMenu() {
  dock.innerHTML = "";
  const items = [
    ["Fill", () => { view = { name: "home" }; render(); }, view.name !== "jobs"],
    ["Jobs", () => { view = { name: "jobs" }; render(); }, view.name === "jobs"],
    ["Profiles", () => { location.href = "popup.html#profiles"; }, false],
    ["Settings", () => { location.href = "popup.html#settings"; }, false],
  ];
  for (const [label, go, active] of items) {
    const b = el(`<button class="menu-btn ${active ? "active" : ""}">${label}</button>`);
    b.addEventListener("click", go);
    dock.appendChild(b);
  }
}

// ── saved jobs ───────────────────────────────────────────────────────────────
// Captures from the in-page Save-job button, rendered as AI-ready blocks: one
// click copies clean markdown (or a full outreach prompt) to paste into an AI
// that will research LinkedIn contacts and draft the message.

function jobMarkdown(j) {
  return [
    `# Job posting`,
    `- Title: ${j.title}`,
    `- Company: ${j.company}`,
    `- Source: ${j.source}`,
    `- URL: ${j.url}`,
    `- Saved: ${(j.capturedAt || "").slice(0, 10)}`,
    ``,
    `## Full job description`,
    ``,
    j.description || "(no description captured)",
  ].join("\n");
}

function outreachPrompt(j) {
  return [
    `You are helping me with recruiting outreach for a job I want. Using the job posting below:`,
    `1. Summarize what the hiring team most cares about (top 5 signals).`,
    `2. Give me LinkedIn search keywords and likely titles of the recruiter / hiring manager for this role.`,
    `3. Draft a LinkedIn connection note (under 300 characters) and a longer follow-up message tailored to this posting.`,
    `4. Draft a short cold email version with a compelling subject line.`,
    `Keep the tone warm, specific and non-generic.`,
    ``,
    jobMarkdown(j),
  ].join("\n");
}

async function saveJobs(jobs) {
  await chrome.storage.local.set({ [KEYS.SAVED_JOBS]: jobs });
}

// ── Google Sheet connection (Apps Script web app) ────────────────────────────
// The sheet-side receiver is a bound Apps Script: GET returns the category
// names (the gray rows), POST appends a row under the chosen category.

async function fetchCategories() {
  const res = await fetch(`${sheetWebhook}?action=categories`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Sheet script error");
  sheetCats = data.categories || [];
  await chrome.storage.local.set({ [KEYS.SHEET_CATS]: sheetCats });
}

async function addToSheet(job, category) {
  // Same entity-code cleanup the capture applies, so jobs saved before the
  // fix still land in the sheet with a clean company name.
  const company = String(job.company || "").replace(/^\s*\d{3,}\s*[-–—:]?\s+/, "").trim();
  // text/plain avoids a CORS preflight, which Apps Script cannot answer.
  const res = await fetch(sheetWebhook, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      company,
      position: job.title || "",
      postDate: job.postDate || "",
      applyDate: new Date().toLocaleDateString("en-US"),
      category,
    }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Sheet script error");
  return data.row;
}

// Slim status row: the connection itself is baked in, so this only reports
// state and offers a manual refresh (e.g. after adding a category row).
let catsFetchInFlight = false;
function renderSheetStatus() {
  const row = el(`
    <div class="hint" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span>${sheetCats.length ? `✓ Connected — ${sheetCats.length} categories` : "Connecting to your Job Tracker sheet…"}</span>
      <button class="btn-small">Refresh categories</button>
    </div>`);
  row.querySelector("button").addEventListener("click", async (e) => {
    try { await fetchCategories(); } catch (err) { toastMsg(e.target, String(err.message || err)); }
  });
  return row;
}

// First visit to the Jobs view pulls the category list automatically.
async function ensureCategories() {
  if (sheetCats.length || catsFetchInFlight) return;
  catsFetchInFlight = true;
  try { await fetchCategories(); } catch { /* status row keeps "connecting…" */ }
  catsFetchInFlight = false;
}

function toastMsg(nearEl, msg) {
  const r = nearEl.getBoundingClientRect();
  toast.textContent = msg;
  toast.style.left = `${r.left}px`;
  toast.style.top = `${Math.max(r.top - 30, 4)}px`;
  toast.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.style.opacity = "0"; toast.textContent = "Copied ✓"; }, 1800);
}

function renderJobs() {
  main.innerHTML = "";

  main.appendChild(el(`<div class="label">Google Sheet</div>`));
  main.appendChild(renderSheetStatus());
  ensureCategories();

  main.appendChild(el(`<div class="label">Saved jobs</div>`));

  if (!savedJobs.length) {
    main.appendChild(el(
      `<div class="empty">No jobs saved yet.<br/>Open a job posting and click the floating <b>💼 Save job</b> button on the page.</div>`
    ));
    return;
  }

  main.appendChild(el(`<div class="hint">Click a card to copy it as AI-ready markdown</div>`));

  for (const j of savedJobs) {
    const meta = [j.company, j.source, j.postDate ? `posted ${j.postDate}` : "", (j.capturedAt || "").slice(0, 10)]
      .filter(Boolean).join(" · ");
    const card = el(`
      <div class="job">
        <div class="job-title">${esc(j.title)}</div>
        <div class="job-meta">${esc(meta)}${j.sheetRow ? ` · <b>✓ in sheet (row ${j.sheetRow})</b>` : ""}</div>
        <div class="job-btns">
          <button class="btn-small primary">Copy for AI</button>
          <button class="btn-small">Outreach prompt</button>
          <button class="btn-small">Open</button>
          <button class="btn-small">✕</button>
        </div>
        ${sheetWebhook ? `
        <div class="job-btns">
          <select class="cat-select">
            ${sheetCats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}
          </select>
          <button class="btn-small primary">${j.sheetRow ? "Add again" : "Add to Sheet"}</button>
        </div>` : ""}
      </div>`);
    const [copyBtn, promptBtn, openBtn, delBtn, sheetBtn] = card.querySelectorAll("button");
    const catSel = card.querySelector(".cat-select");
    const copyCard = async (text, e) => { await copyText(text); copied(card, e.clientX, e.clientY); };
    card.addEventListener("click", (e) => {
      if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLSelectElement) return;
      copyCard(jobMarkdown(j), e);
    });
    copyBtn.addEventListener("click", (e) => copyCard(jobMarkdown(j), e));
    promptBtn.addEventListener("click", (e) => copyCard(outreachPrompt(j), e));
    openBtn.addEventListener("click", () => chrome.tabs.create({ url: j.url }));
    delBtn.addEventListener("click", () => saveJobs(savedJobs.filter((x) => x.id !== j.id)));
    sheetBtn?.addEventListener("click", async () => {
      if (!sheetCats.length) { toastMsg(sheetBtn, "No categories — hit Refresh categories"); return; }
      sheetBtn.disabled = true;
      sheetBtn.textContent = "Adding…";
      try {
        const row = await addToSheet(j, catSel.value);
        await saveJobs(savedJobs.map((x) => (x.id === j.id ? { ...x, sheetRow: row, category: catSel.value } : x)));
      } catch (e) {
        sheetBtn.disabled = false;
        sheetBtn.textContent = "Add to Sheet";
        toastMsg(sheetBtn, String(e.message || e));
      }
    });
    if (catSel && j.category && sheetCats.includes(j.category)) catSel.value = j.category;
    main.appendChild(card);
  }
}

// ── detail view ──────────────────────────────────────────────────────────────

function copyRow(label, value) {
  if (!value || !String(value).trim()) return null;
  const r = el(`
    <div class="row" title="Click to copy">
      <div class="row-label">${esc(label)}</div>
      <div class="row-value">${esc(value)}</div>
    </div>`);
  r.addEventListener("click", async (e) => {
    await copyText(String(value));
    copied(r, e.clientX, e.clientY);
  });
  return r;
}

function chips(values) {
  const wrap = el(`<div class="chips"></div>`);
  for (const v of values) {
    if (!v) continue;
    const c = el(`<span class="chip" title="Click to copy">${esc(v)}</span>`);
    c.addEventListener("click", async (e) => {
      await copyText(String(v));
      copied(c, e.clientX, e.clientY);
    });
    wrap.appendChild(c);
  }
  return wrap.children.length ? wrap : null;
}

function fmtDates(x) {
  const end = x.isCurrent ? "Present" : x.endDate;
  return [x.startDate, end].filter(Boolean).join(" – ");
}

function append(parent, node) { if (node) parent.appendChild(node); }

function renderDetail(p) {
  main.innerHTML = "";

  const back = el(`<div class="backrow">← Resumes</div>`);
  back.addEventListener("click", () => { view = { name: "home" }; render(); });
  main.appendChild(back);

  main.appendChild(el(`<div class="detail-name">${esc(p.name || "Untitled resume")}</div>`));
  main.appendChild(el(`<div class="detail-hint">Click any field to copy it</div>`));

  const per = p.personal || {};
  const addr = per.address || {};
  main.appendChild(el(`<div class="label">Contact</div>`));
  append(main, copyRow("Full name", [per.firstName, per.lastName].filter(Boolean).join(" ")));
  append(main, copyRow("First name", per.firstName));
  append(main, copyRow("Last name", per.lastName));
  append(main, copyRow("Email", per.email));
  append(main, copyRow("Phone", per.phone));
  append(main, copyRow("Address", [addr.street, addr.city, addr.state, addr.zip, addr.country].filter(Boolean).join(", ")));
  append(main, copyRow("City", addr.city));
  append(main, copyRow("LinkedIn", per.linkedIn));
  append(main, copyRow("Website", per.website));
  append(main, copyRow("GitHub", per.github));

  if (p.summary?.trim()) {
    main.appendChild(el(`<div class="label">Summary</div>`));
    append(main, copyRow("Professional summary", p.summary));
  }

  if (p.experience?.length) {
    main.appendChild(el(`<div class="label">Work experience</div>`));
    for (const x of p.experience) {
      const entry = el(`<div class="entry"></div>`);
      entry.appendChild(el(`<div class="entry-head">${esc(x.title || "Role")}</div>`));
      entry.appendChild(el(`<div class="entry-sub">${esc([x.company, fmtDates(x)].filter(Boolean).join(" · "))}</div>`));
      append(entry, copyRow("Company", x.company));
      append(entry, copyRow("Title", x.title));
      append(entry, copyRow("Location", x.location));
      append(entry, copyRow("Dates", fmtDates(x)));
      append(entry, copyRow("Description", x.description));
      main.appendChild(entry);
    }
  }

  if (p.education?.length) {
    main.appendChild(el(`<div class="label">Education</div>`));
    for (const x of p.education) {
      const entry = el(`<div class="entry"></div>`);
      entry.appendChild(el(`<div class="entry-head">${esc(x.institution || "School")}</div>`));
      entry.appendChild(el(`<div class="entry-sub">${esc([x.degree, x.field, fmtDates(x)].filter(Boolean).join(" · "))}</div>`));
      append(entry, copyRow("Institution", x.institution));
      append(entry, copyRow("Degree", x.degree));
      append(entry, copyRow("Field of study", x.field));
      append(entry, copyRow("GPA", x.gpa));
      append(entry, copyRow("Dates", fmtDates(x)));
      append(entry, copyRow("Honors", x.honors));
      main.appendChild(entry);
    }
  }

  const sk = p.skills || {};
  if (sk.technical?.length || sk.languages?.length || sk.other?.length) {
    main.appendChild(el(`<div class="label">Skills</div>`));
    if (sk.technical?.length) {
      append(main, copyRow("All technical skills", sk.technical.join(", ")));
      append(main, chips(sk.technical));
    }
    if (sk.languages?.length) {
      append(main, copyRow("All languages", sk.languages.join(", ")));
      append(main, chips(sk.languages));
    }
    if (sk.other?.length) {
      append(main, copyRow("All other skills", sk.other.join(", ")));
      append(main, chips(sk.other));
    }
  }

  if (p.certifications?.length) {
    main.appendChild(el(`<div class="label">Certifications</div>`));
    for (const c of p.certifications) {
      append(main, copyRow(c.issuer || "Certification", [c.name, c.date].filter(Boolean).join(" · ")));
    }
  }

  renderExtraSection(p);

  main.appendChild(el(`<div class="foot"></div>`));
}

// ── additional information ───────────────────────────────────────────────────
// User-added fields (website, portfolio, visa status, salary expectation …)
// stored as `extra` on the profile object itself. The React editor deep-clones
// whole profiles, so the key survives edits made over there.

async function saveExtra(profileId, extra) {
  const d = await chrome.storage.local.get([KEYS.PROFILES]);
  const all = d[KEYS.PROFILES] || [];
  const target = all.find((x) => x.id === profileId);
  if (!target) return;
  target.extra = extra;
  target.updatedAt = new Date().toISOString();
  await chrome.storage.local.set({ [KEYS.PROFILES]: all });
  // storage.onChanged re-loads and re-renders the open detail view.
}

function renderExtraSection(p) {
  main.appendChild(el(`<div class="label">Additional information</div>`));
  const extra = Array.isArray(p.extra) ? p.extra : [];

  for (const f of extra) {
    const wrap = el(`<div class="xrow"></div>`);
    const row = copyRow(f.label || "Field", f.value);
    if (row) wrap.appendChild(row);
    const del = el(`<button class="xdel" title="Remove this field">✕</button>`);
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      saveExtra(p.id, extra.filter((x) => x.id !== f.id));
    });
    wrap.appendChild(del);
    main.appendChild(wrap);
  }

  const addWrap = el(`<div class="addwrap"></div>`);
  const addBtn = el(`<button class="btn-small">＋ Add field</button>`);
  addBtn.addEventListener("click", () => {
    addWrap.innerHTML = "";
    const form = el(`
      <div class="addform">
        <input type="text" placeholder="Label — e.g. Website, Visa status" />
        <input type="text" placeholder="Value — e.g. chensun.dev" />
        <div class="addform-btns">
          <button class="btn-small primary">Save</button>
          <button class="btn-small">Cancel</button>
        </div>
      </div>`);
    const [labelIn, valueIn] = form.querySelectorAll("input");
    const [saveBtn, cancelBtn] = form.querySelectorAll("button");
    saveBtn.addEventListener("click", () => {
      const label = labelIn.value.trim();
      const value = valueIn.value.trim();
      if (!label || !value) return;
      saveExtra(p.id, [...extra, { id: crypto.randomUUID(), label, value }]);
    });
    cancelBtn.addEventListener("click", () => render());
    addWrap.appendChild(form);
    labelIn.focus();
  });
  addWrap.appendChild(addBtn);
  main.appendChild(addWrap);
}

// ── render ───────────────────────────────────────────────────────────────────

function render() {
  renderMenu();
  if (view.name === "jobs") return renderJobs();
  if (view.name === "detail") {
    const p = profiles.find((x) => x.id === view.id);
    if (p) return renderDetail(p);
  }
  renderHome();
}

load();
