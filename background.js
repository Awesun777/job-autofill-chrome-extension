const KEYS = {
  PROFILES: "sja_profiles",
  ACTIVE_ID: "sja_active_profile_id",
  API_KEY: "sja_api_key",
  DEFAULT_EXP_MAP: "sja_default_exp_map"
};
async function get(keys) {
  return new Promise((r) => chrome.storage.local.get(keys, r));
}
async function set(obj) {
  return new Promise((r) => chrome.storage.local.set(obj, r));
}
async function getAllProfiles() {
  const d = await get([KEYS.PROFILES]);
  return d[KEYS.PROFILES] || [];
}
async function saveProfile(profile) {
  const profiles = await getAllProfiles();
  const idx = profiles.findIndex((p) => p.id === profile.id);
  profile.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  if (idx >= 0)
    profiles[idx] = profile;
  else
    profiles.push(profile);
  await set({ [KEYS.PROFILES]: profiles });
  return profile;
}
async function deleteProfile(id) {
  const profiles = await getAllProfiles();
  await set({ [KEYS.PROFILES]: profiles.filter((p) => p.id !== id) });
}
async function getActiveProfileId() {
  const d = await get([KEYS.ACTIVE_ID]);
  return d[KEYS.ACTIVE_ID] || null;
}
async function setActiveProfileId(id) {
  await set({ [KEYS.ACTIVE_ID]: id });
}
async function getApiKey() {
  const d = await get([KEYS.API_KEY]);
  if (d[KEYS.API_KEY])
    return d[KEYS.API_KEY];
  const old = await get(["sja_openai_api_key"]);
  return old["sja_openai_api_key"] || null;
}
async function setApiKey(key) {
  await set({ [KEYS.API_KEY]: key });
}
async function getDefaultExpId(profileId) {
  const d = await get([KEYS.DEFAULT_EXP_MAP]);
  return (d[KEYS.DEFAULT_EXP_MAP] || {})[profileId] || null;
}
async function setDefaultExpId(profileId, expId) {
  const d = await get([KEYS.DEFAULT_EXP_MAP]);
  const map = d[KEYS.DEFAULT_EXP_MAP] || {};
  if (expId === null || expId === undefined) {
    delete map[profileId];
  } else {
    map[profileId] = expId;
  }
  await set({ [KEYS.DEFAULT_EXP_MAP]: map });
}
function broadcastStatus(step, message) {
  chrome.runtime.sendMessage({ type: "PARSE_STATUS", step, message }).catch(() => {
  });
}
function createEmptyProfile(name = "My Profile") {
  return {
    id: crypto.randomUUID(),
    name,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    personal: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      address: { street: "", city: "", state: "", zip: "", country: "" },
      linkedIn: "",
      website: "",
      github: ""
    },
    summary: "",
    experience: [],
    education: [],
    skills: { technical: [], languages: [], other: [] },
    certifications: []
  };
}
const PARSE_SYSTEM_PROMPT = `You are an expert resume parser. Extract structured information from raw resume text and return ONLY valid JSON (no markdown, no explanation).

CRITICAL RULES:
1. Each work experience entry MUST have its OWN distinct company, title, startDate, endDate, location, and description. NEVER mix descriptions or titles between different jobs.
2. Preserve the EXACT description text for each job. Each bullet point or separate line MUST stay on its own line. Use the JSON newline escape \\n to separate lines inside the description string \u2014 do not merge bullets into one paragraph, do not summarize or rewrite.
3. Dates in "MM/YYYY" format. Use "Present" for current roles.
4. If a field is not found, use "".
5. Split skills into: technical (hard skills/tools), languages (spoken languages), other (soft skills).
6. All skill arrays MUST contain plain strings only — e.g. "French (B2)", "Python", "Leadership". Never use objects.
7. Never output double spaces anywhere. Use single spaces only, including inside description fields.

Return this exact JSON shape:
{
  "personal": { "firstName":"","lastName":"","email":"","phone":"","address":{"street":"","city":"","state":"","zip":"","country":""},"linkedIn":"","website":"","github":"" },
  "summary": "",
  "experience": [{"company":"","title":"","startDate":"","endDate":"","location":"","description":"• First responsibility\\n• Second responsibility","isCurrent":false}],
  "education": [{"institution":"","degree":"","field":"","startDate":"","endDate":"","gpa":"","location":"","honors":""}],
  "skills": {"technical":["string"],"languages":["string"],"other":["string"]},
  "certifications": [{"name":"","issuer":"","date":""}]
}`;
async function parseResumeWithOpenAI(rawText, apiKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6e4);
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: PARSE_SYSTEM_PROMPT },
          { role: "user", content: `Parse this resume:

${rawText}` }
        ],
        temperature: 0.1,
        max_tokens: 4e3
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      const msg = err.error?.message || `OpenAI error ${resp.status}`;
      if (resp.status === 401)
        throw new Error("Invalid API key. Double-check it in Settings \u2014 it should start with sk-.");
      if (resp.status === 429)
        throw new Error("OpenAI rate limit or quota exceeded. Check your usage at platform.openai.com.");
      if (resp.status === 400)
        throw new Error("Bad request to OpenAI: " + msg);
      throw new Error("OpenAI error: " + msg);
    }
    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || "";
    const content = raw.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    if (!content)
      throw new Error("OpenAI returned an empty response. Try again.");
    return JSON.parse(content);
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === "AbortError") {
      throw new Error("OpenAI request timed out after 60 seconds. Check your internet connection and try again.");
    }
    throw e;
  }
}
function mergeIntoProfile(parsed, name) {
  const profile = createEmptyProfile(name);
  if (parsed.personal) {
    profile.personal = { ...profile.personal, ...parsed.personal };
    if (parsed.personal.address)
      profile.personal.address = { ...profile.personal.address, ...parsed.personal.address };
  }
  profile.summary = parsed.summary || "";
  if (Array.isArray(parsed.experience))
    profile.experience = parsed.experience.map((e) => ({ id: crypto.randomUUID(), ...e }));
  if (Array.isArray(parsed.education))
    profile.education = parsed.education.map((e) => ({ id: crypto.randomUUID(), ...e }));
  if (parsed.skills)
    profile.skills = { technical: [], languages: [], other: [], ...parsed.skills };
  if (Array.isArray(parsed.certifications))
    profile.certifications = parsed.certifications.map((c) => ({ id: crypto.randomUUID(), ...c }));
  return profile;
}
async function validateApiKey(apiKey) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1e4);
    const resp = await fetch("https://api.openai.com/v1/models", {
      headers: { "Authorization": `Bearer ${apiKey}` },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (resp.status === 200)
      return { valid: true };
    if (resp.status === 401)
      return { valid: false, error: "Invalid API key. Check it at platform.openai.com." };
    if (resp.status === 429)
      return { valid: true, warning: "Key is valid but you have hit a rate limit or quota." };
    return { valid: false, error: `Unexpected response: ${resp.status}` };
  } catch (e) {
    if (e.name === "AbortError")
      return { valid: false, error: "Validation timed out. Check your internet connection." };
    return { valid: false, error: "Could not reach OpenAI: " + e.message };
  }
}
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case "GET_ALL_PROFILES":
          sendResponse({ ok: true, data: await getAllProfiles() });
          break;
        case "SAVE_PROFILE":
          sendResponse({ ok: true, data: await saveProfile(message.profile) });
          break;
        case "DELETE_PROFILE":
          await deleteProfile(message.profileId);
          sendResponse({ ok: true });
          break;
        case "GET_ACTIVE_PROFILE_ID":
          sendResponse({ ok: true, data: await getActiveProfileId() });
          break;
        case "SET_ACTIVE_PROFILE_ID":
          await setActiveProfileId(message.profileId);
          sendResponse({ ok: true });
          break;
        case "GET_API_KEY":
          sendResponse({ ok: true, data: await getApiKey() });
          break;
        case "SET_API_KEY":
          await setApiKey(message.apiKey);
          sendResponse({ ok: true });
          break;
        case "VALIDATE_API_KEY": {
          const result = await validateApiKey(message.apiKey);
          sendResponse({ ok: true, data: result });
          break;
        }
        case "PARSE_RESUME": {
          const apiKey = await getApiKey();
          if (!apiKey) {
            sendResponse({ ok: false, error: "No API key saved. Go to Settings and paste your OpenAI API key first." });
            break;
          }
          const rawText = message.rawText;
          if (!rawText || rawText.trim().length < 50) {
            sendResponse({ ok: false, error: "No text received from PDF. Make sure it is a text-based PDF (not a scanned image)." });
            break;
          }
          const parsed = await parseResumeWithOpenAI(rawText, apiKey);
          const profile = mergeIntoProfile(parsed, message.profileName || "Parsed Resume");
          const saved = await saveProfile(profile);
          await setActiveProfileId(saved.id);
          sendResponse({ ok: true, data: saved });
          break;
        }
        case "TRIGGER_AUTOFILL": {
          const profiles = await getAllProfiles();
          const activeId = await getActiveProfileId();
          const profile = profiles.find((p) => p.id === (message.profileId || activeId)) || profiles[0];
          if (!profile) {
            sendResponse({ ok: false, error: "No profile found. Please create one in the Profiles tab first." });
            break;
          }
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab) {
            sendResponse({ ok: false, error: "No active tab found." });
            break;
          }
          await chrome.tabs.sendMessage(tab.id, { type: "DO_AUTOFILL", profile });
          sendResponse({ ok: true });
          break;
        }
        case "GET_PROFILES_FOR_FILL": {
          const profiles = await getAllProfiles();
          const activeId = await getActiveProfileId();
          const defaultExpId = activeId ? await getDefaultExpId(activeId) : null;
          sendResponse({ ok: true, data: { profiles, activeId, defaultExpId } });
          break;
        }
        case "GET_DEFAULT_EXP": {
          const defaultExpId = await getDefaultExpId(message.profileId);
          sendResponse({ ok: true, data: defaultExpId });
          break;
        }
        case "SET_DEFAULT_EXP": {
          await setDefaultExpId(message.profileId, message.expId);
          sendResponse({ ok: true });
          break;
        }
        default:
          sendResponse({ ok: false, error: `Unknown message type: ${message.type}` });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true;
});
