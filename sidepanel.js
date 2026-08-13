// Side-panel home for Smart Job Autofill, in the RomainTalk design system.
// Reads the same chrome.storage the React editor writes and talks to the same
// background worker, so the two UIs stay interchangeable:
//   home  — resume blocks: single-click selects (persisted), double-click
//           opens the read-only detail view; Autofill uses the selection.
//   detail — the profile laid out like the editor's Profiles form, but
//           read-only: click any field/chip to copy it.
// Editing still happens in the original React app via "Manage profiles".

const KEYS = { PROFILES: "sja_profiles", ACTIVE_ID: "sja_active_profile_id" };

let profiles = [];
let activeId = null;
let view = { name: "home" }; // or { name: "detail", id }

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
  const d = await chrome.storage.local.get([KEYS.PROFILES, KEYS.ACTIVE_ID]);
  profiles = d[KEYS.PROFILES] || [];
  activeId = d[KEYS.ACTIVE_ID] || profiles[0]?.id || null;
  // If the profile being viewed was deleted in the editor, fall back home.
  if (view.name === "detail" && !profiles.some((p) => p.id === view.id)) view = { name: "home" };
  render();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes[KEYS.PROFILES] || changes[KEYS.ACTIVE_ID])) load();
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

// ── bottom menu: Fill · Profiles · Settings ──────────────────────────────────
// The floating block is the app's navigation. Fill is this page; Profiles and
// Settings open the (re-skinned) React editor on the matching tab.
function renderMenu() {
  dock.innerHTML = "";
  const items = [
    ["Fill", () => { view = { name: "home" }; render(); }, true],
    ["Profiles", () => { location.href = "popup.html#profiles"; }, false],
    ["Settings", () => { location.href = "popup.html#settings"; }, false],
  ];
  for (const [label, go, active] of items) {
    const b = el(`<button class="menu-btn ${active ? "active" : ""}">${label}</button>`);
    b.addEventListener("click", go);
    dock.appendChild(b);
  }
}

// ── detail view ──────────────────────────────────────────────────────────────

/** A labelled read-only box, laid out like the editor's form field; clicking
 *  the box copies its value. `full` spans both grid columns. */
function fieldBox(label, value, full = false) {
  if (!value || !String(value).trim()) return null;
  const g = el(`
    <div class="fgroup ${full ? "full" : ""}">
      <div class="flabel">${esc(label)}</div>
      <div class="fvalue" title="Click to copy">${esc(value)}</div>
    </div>`);
  const box = g.querySelector(".fvalue");
  box.addEventListener("click", async (e) => {
    await copyText(String(value));
    copied(box, e.clientX, e.clientY);
  });
  return g;
}

/** A grid of field boxes; returns null when every field was empty. */
function formGrid(fields) {
  const grid = el(`<div class="form-grid"></div>`);
  for (const f of fields) {
    if (!f) continue;
    const [label, value, full] = f;
    append(grid, fieldBox(label, value, full));
  }
  return grid.children.length ? grid : null;
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
  main.appendChild(el(`<div class="label">Personal information</div>`));
  append(main, formGrid([
    ["First name", per.firstName],
    ["Last name", per.lastName],
    ["Full name", [per.firstName, per.lastName].filter(Boolean).join(" "), true],
    ["Email", per.email, true],
    ["Phone", per.phone],
    ["City", addr.city],
    ["Street", addr.street],
    ["State / ZIP", [addr.state, addr.zip].filter(Boolean).join(" ")],
    ["Country", addr.country],
    ["Full address", [addr.street, addr.city, addr.state, addr.zip, addr.country].filter(Boolean).join(", "), true],
    ["LinkedIn", per.linkedIn, true],
    ["Website", per.website, true],
    ["GitHub", per.github, true],
  ]));

  if (p.summary?.trim()) {
    main.appendChild(el(`<div class="label">Summary</div>`));
    append(main, formGrid([["Professional summary", p.summary, true]]));
  }

  if (p.experience?.length) {
    main.appendChild(el(`<div class="label">Work experience</div>`));
    for (const x of p.experience) {
      const card = el(`<div class="entry-card"></div>`);
      card.appendChild(el(`<div class="entry-head">${esc(x.title || "Role")}</div>`));
      card.appendChild(el(`<div class="entry-sub">${esc([x.company, fmtDates(x)].filter(Boolean).join(" · "))}</div>`));
      append(card, formGrid([
        ["Company", x.company],
        ["Title", x.title],
        ["Location", x.location],
        ["Dates", fmtDates(x)],
        ["Start date", x.startDate],
        ["End date", x.isCurrent ? "Present" : x.endDate],
        ["Description", x.description, true],
      ]));
      main.appendChild(card);
    }
  }

  if (p.education?.length) {
    main.appendChild(el(`<div class="label">Education</div>`));
    for (const x of p.education) {
      const card = el(`<div class="entry-card"></div>`);
      card.appendChild(el(`<div class="entry-head">${esc(x.institution || "School")}</div>`));
      card.appendChild(el(`<div class="entry-sub">${esc([x.degree, x.field, fmtDates(x)].filter(Boolean).join(" · "))}</div>`));
      append(card, formGrid([
        ["Institution", x.institution],
        ["Degree", x.degree],
        ["Field of study", x.field],
        ["GPA", x.gpa],
        ["Start date", x.startDate],
        ["End date", x.isCurrent ? "Present" : x.endDate],
        ["Honors", x.honors, true],
      ]));
      main.appendChild(card);
    }
  }

  const sk = p.skills || {};
  if (sk.technical?.length || sk.languages?.length || sk.other?.length) {
    main.appendChild(el(`<div class="label">Skills</div>`));
    append(main, formGrid([
      sk.technical?.length ? ["All technical skills", sk.technical.join(", "), true] : null,
      sk.languages?.length ? ["All languages", sk.languages.join(", "), true] : null,
      sk.other?.length ? ["All other skills", sk.other.join(", "), true] : null,
    ]));
    append(main, chips([...(sk.technical ?? []), ...(sk.languages ?? []), ...(sk.other ?? [])]));
  }

  if (p.certifications?.length) {
    main.appendChild(el(`<div class="label">Certifications</div>`));
    append(main, formGrid(
      p.certifications.map((c) => [c.issuer || "Certification", [c.name, c.date].filter(Boolean).join(" · "), true])
    ));
  }

  main.appendChild(el(`<div class="foot"></div>`));
}

// ── render ───────────────────────────────────────────────────────────────────

function render() {
  if (view.name === "detail") {
    const p = profiles.find((x) => x.id === view.id);
    if (p) return renderDetail(p);
  }
  renderHome();
}

renderMenu();
load();
