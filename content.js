(() => {
  // src/content/content.js
  (function() {
    "use strict";
    if (window.__smartAutofillLoaded)
      return;
    window.__smartAutofillLoaded = true;
    const FIELD_RULES = [
      // ── Personal ──
      { patterns: ["first.?name", "fname", "given.?name", "firstName"], extract: (p) => p.personal.firstName },
      { patterns: ["last.?name", "lname", "surname", "family.?name", "lastName"], extract: (p) => p.personal.lastName },
      { patterns: ["full.?name", "applicant.?name", "your.?name", "legal.?name", "^name"], extract: (p) => `${p.personal.firstName} ${p.personal.lastName}`.trim() },
      { patterns: ["email", "e.?mail", "emailAddress"], extract: (p) => p.personal.email },
      { patterns: ["phone", "mobile", "telephone", "cell", "phoneNumber"], extract: (p) => p.personal.phone },
      { patterns: ["address.?1", "street.?address", "address.?line.?1", "street", "addr1"], extract: (p) => p.personal.address.street },
      { patterns: ["city", "town", "municipality"], extract: (p) => p.personal.address.city },
      { patterns: ["state", "province", "region"], extract: (p) => p.personal.address.state },
      { patterns: ["zip", "postal", "postcode", "zip.?code"], extract: (p) => p.personal.address.zip },
      { patterns: ["country"], extract: (p) => p.personal.address.country },
      { patterns: ["linkedin", "linked.?in"], extract: (p) => p.personal.linkedIn },
      { patterns: ["website", "portfolio", "personal.?site", "url"], extract: (p) => p.personal.website },
      { patterns: ["github"], extract: (p) => p.personal.github },
      { patterns: ["summary", "objective", "about.?me", "cover", "profile.?summary"], extract: (p) => p.personal.summary || p.summary },
      // ── Most Recent Experience (generic single-job forms) ──
      { patterns: ["current.?employer", "current.?company", "employer.?name", "company.?name", "organization"], extract: (p) => p.experience[0]?.company || "", experienceField: "company" },
      { patterns: ["current.?title", "job.?title", "position.?title", "title", "role"], extract: (p) => p.experience[0]?.title || "", experienceField: "title" },
      { patterns: ["start.?date", "from.?date", "employment.?start"], extract: (p) => p.experience[0]?.startDate || "", experienceField: "startDate" },
      { patterns: ["end.?date", "to.?date", "employment.?end"], extract: (p) => p.experience[0]?.endDate || "", experienceField: "endDate" },
      { patterns: ["job.?description", "responsibilities", "duties", "work.?description", "description"], extract: (p) => p.experience[0]?.description || "", experienceField: "description" },
      { patterns: ["^location", "work.?location", "job.?location", "office.?location"], extract: (p) => p.experience[0]?.location || "", experienceField: "location" },
      // ── Education ──
      { patterns: ["school", "university", "college", "institution", "alma.?mater"], extract: (p) => p.education[0]?.institution || "" },
      { patterns: ["degree", "qualification"], extract: (p) => p.education[0]?.degree || "" },
      { patterns: ["major", "field.?of.?study", "concentration", "discipline"], extract: (p) => p.education[0]?.field || "" },
      { patterns: ["gpa", "grade.?point"], extract: (p) => p.education[0]?.gpa || "" },
      { patterns: ["graduation.?date", "grad.?date", "edu.*end"], extract: (p) => p.education[0]?.endDate || "" },
      // ── Skills ──
      { patterns: ["skills", "technical.?skills", "competencies"], extract: (p) => [...p.skills.technical || [], ...p.skills.other || []].join(", ") },
      { patterns: ["languages", "spoken.?languages"], extract: (p) => (p.skills.languages || []).join(", ") }
    ];
    const WORKDAY_SELECTORS = {
      firstName: '[data-automation-id="legalNameSection_firstName"]',
      lastName: '[data-automation-id="legalNameSection_lastName"]',
      email: '[data-automation-id="email"]',
      phone: '[data-automation-id="phone"]',
      addressLine1: '[data-automation-id="addressSection_addressLine1"]',
      city: '[data-automation-id="addressSection_city"]',
      state: '[data-automation-id="addressSection_stateProvince"]',
      zip: '[data-automation-id="addressSection_postalCode"]',
      country: '[data-automation-id="addressSection_countryRegion"]',
      linkedin: '[data-automation-id="linkedinUrl"], [data-automation-id="linkedin"]',
      website: '[data-automation-id="portfolioUrl"], [data-automation-id="website"]',
      summary: '[data-automation-id="coverLetter"], [data-automation-id="summary"]'
    };
    function simulateInput(el, value) {
      if (!el || value === void 0 || value === null)
        return;
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
        "value"
      )?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(el, value);
      } else {
        el.value = value;
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("blur", { bubbles: true }));
    }
    function simulateSelectInput(el, value) {
      if (!el || !value)
        return;
      const options = Array.from(el.options);
      const match = options.find((o) => o.text.toLowerCase() === value.toLowerCase()) || options.find((o) => o.text.toLowerCase().includes(value.toLowerCase())) || options.find((o) => o.value.toLowerCase() === value.toLowerCase());
      if (match) {
        el.value = match.value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    function getFieldLabel(el) {
      if (el.getAttribute("aria-label"))
        return el.getAttribute("aria-label").toLowerCase();
      if (el.placeholder)
        return el.placeholder.toLowerCase();
      if (el.name)
        return el.name.toLowerCase();
      if (el.id) {
        const label = document.querySelector(`label[for="${el.id}"]`);
        if (label)
          return label.textContent.toLowerCase();
        return el.id.toLowerCase();
      }
      const parentLabel = el.closest("label");
      if (parentLabel)
        return parentLabel.textContent.toLowerCase();
      const parent = el.parentElement;
      if (parent) {
        const labelEl = parent.querySelector("label, .label, [class*='label']");
        if (labelEl)
          return labelEl.textContent.toLowerCase();
      }
      const autoId = el.getAttribute("data-automation-id");
      if (autoId)
        return autoId.toLowerCase();
      let ancestor = el.parentElement;
      for (let i = 0; i < 4 && ancestor && ancestor !== document.body; i++, ancestor = ancestor.parentElement) {
        const aId = ancestor.getAttribute("data-automation-id");
        if (aId)
          return aId.toLowerCase();
      }
      return "";
    }
    function matchFieldToRule(el) {
      const label = getFieldLabel(el);
      if (!label)
        return null;
      for (const rule of FIELD_RULES) {
        for (const pattern of rule.patterns) {
          if (new RegExp(pattern, "i").test(label)) {
            return rule;
          }
        }
      }
      return null;
    }
    function fillWorkdayExperienceSections(profile) {
      const expSections = document.querySelectorAll(
        '[data-automation-id*="workExperience"], [data-automation-id*="workHistory"], .WGDC, [class*="workExperience"]'
      );
      if (expSections.length === 0) {
        fillExperienceByIndex(profile);
        return;
      }
      expSections.forEach((section, idx) => {
        const exp = profile.experience[idx];
        if (!exp)
          return;
        fillSectionField(section, ["company", "employer", "organization"], exp.company);
        fillSectionField(section, ["title", "position", "role"], exp.title);
        fillSectionField(section, ["start", "from"], exp.startDate);
        fillSectionField(section, ["end", "to"], exp.endDate);
        fillSectionField(section, ["location", "city"], exp.location);
        fillSectionField(section, ["description", "responsibilities", "duties"], exp.description);
      });
    }
    function fillSectionField(section, patterns, value) {
      const inputs = section.querySelectorAll("input, textarea");
      for (const input of inputs) {
        const label = getFieldLabel(input);
        if (patterns.some((p) => new RegExp(p, "i").test(label))) {
          simulateInput(input, value);
          return;
        }
      }
    }
    function fillExperienceByIndex(profile) {
      for (let i = 0; i < profile.experience.length; i++) {
        const exp = profile.experience[i];
        const n = i + 1;
        const selectors = [
          `[name*="job${n}"], [id*="job${n}"], [data-automation-id*="${n}"]`,
          `[name*="employer${n}"], [id*="employer${n}"]`,
          `[name*="position${n}"], [id*="position${n}"]`
        ];
        selectors.forEach((sel) => {
          try {
            document.querySelectorAll(sel).forEach((el) => {
              const label = getFieldLabel(el);
              if (/company|employer|organization/.test(label))
                simulateInput(el, exp.company);
              else if (/title|position|role/.test(label))
                simulateInput(el, exp.title);
              else if (/start|from/.test(label))
                simulateInput(el, exp.startDate);
              else if (/end|to/.test(label))
                simulateInput(el, exp.endDate);
              else if (/description|duties|responsibilities/.test(label))
                simulateInput(el, exp.description);
            });
          } catch (_) {
          }
        });
      }
    }
    function autofillPage(profile) {
      let filledCount = 0;
      const workdayFilled = new Set();
      const isWorkday = window.location.hostname.includes("myworkdayjobs") || window.location.hostname.includes("workday") || document.querySelector("[data-automation-id]") !== null;
      if (isWorkday) {
        Object.entries(WORKDAY_SELECTORS).forEach(([key, selector]) => {
          const el = document.querySelector(selector);
          if (!el)
            return;
          let value = "";
          switch (key) {
            case "firstName":
              value = profile.personal.firstName;
              break;
            case "lastName":
              value = profile.personal.lastName;
              break;
            case "email":
              value = profile.personal.email;
              break;
            case "phone":
              value = profile.personal.phone;
              break;
            case "addressLine1":
              value = profile.personal.address.street;
              break;
            case "city":
              value = profile.personal.address.city;
              break;
            case "state":
              value = profile.personal.address.state;
              break;
            case "zip":
              value = profile.personal.address.zip;
              break;
            case "country":
              value = profile.personal.address.country;
              break;
            case "linkedin":
              value = profile.personal.linkedIn;
              break;
            case "website":
              value = profile.personal.website;
              break;
            case "summary":
              value = profile.summary || "";
              break;
          }
          if (value) {
            simulateInput(el, value);
            workdayFilled.add(el);
            filledCount++;
          }
        });
        fillWorkdayExperienceSections(profile);
      }
      const allFields = document.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea, select'
      );
      allFields.forEach((el) => {
        if (workdayFilled.has(el))
          return;
        if (el.tagName === "SELECT") {
          if (el.value && el.value.trim())
            return;
          const rule2 = matchFieldToRule(el);
          if (rule2) {
            simulateSelectInput(el, rule2.extract(profile));
            filledCount++;
          }
          return;
        }
        if (el.value && el.value.trim())
          return;
        const rule = matchFieldToRule(el);
        if (rule) {
          const value = rule.extract(profile);
          if (value) {
            simulateInput(el, value);
            filledCount++;
          }
        }
      });
      return filledCount;
    }
    let suggestionState = { profiles: [], activeId: null, defaultExpId: null };
    const injectedButtons = /* @__PURE__ */ new WeakSet();
    function injectSuggestionButtons(profiles, activeId, defaultExpId) {
      suggestionState = { profiles, activeId, defaultExpId: defaultExpId || null };
      const allInputs = document.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]), textarea'
      );
      allInputs.forEach((el) => {
        if (injectedButtons.has(el))
          return;
        const rule = matchFieldToRule(el);
        if (!rule)
          return;
        injectedButtons.add(el);
        const btn = document.createElement("button");
        btn.className = "sja-suggest-btn";
        btn.title = "Smart Autofill suggestion";
        btn.innerHTML = "\u26A1";
        btn.setAttribute("data-sja", "true");
        const wrapper = document.createElement("span");
        wrapper.style.cssText = "position:relative;display:inline-block;width:100%;";
        const parent = el.parentNode;
        if (!parent || el.getAttribute("data-sja-wrapped"))
          return;
        el.setAttribute("data-sja-wrapped", "true");
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          showSuggestionDropdown(el, rule, btn);
        });
        el.insertAdjacentElement("afterend", btn);
      });
    }
    function findExperienceSection(el) {
      let parent = el.parentElement;
      while (parent && parent !== document.body) {
        const expInputs = Array.from(parent.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea'))
          .filter((inp) => matchFieldToRule(inp)?.experienceField);
        if (expInputs.length >= 2)
          return parent;
        parent = parent.parentElement;
      }
      return null;
    }
    function renderExperienceList(dropdown, allExps, section) {
      dropdown.innerHTML = "";
      const header = document.createElement("div");
      header.className = "sja-dropdown-header";
      header.textContent = "Choose an experience:";
      dropdown.appendChild(header);
      if (allExps.length === 0) {
        const empty = document.createElement("div");
        empty.className = "sja-dropdown-item";
        empty.textContent = "No experience entries found in your profiles.";
        empty.style.color = "#94a3b8";
        dropdown.appendChild(empty);
        return;
      }
      allExps.forEach((exp) => {
        const item = document.createElement("div");
        item.className = "sja-dropdown-item sja-exp-item";
        const info = document.createElement("div");
        info.style.cssText = "flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;";
        const titleLine = document.createElement("div");
        titleLine.className = "sja-exp-title";
        titleLine.textContent = `${exp.title || "Untitled"} \u2014 ${exp.company || "Unknown"}`;
        const metaLine = document.createElement("div");
        metaLine.className = "sja-exp-meta";
        const dates = [exp.startDate, exp.endDate].filter(Boolean).join(" \u2013 ");
        metaLine.textContent = [dates, exp.location].filter(Boolean).join(" \xB7 ");
        const fromProfile = document.createElement("div");
        fromProfile.className = "sja-dropdown-label";
        fromProfile.textContent = exp._profileName;
        info.appendChild(titleLine);
        if (metaLine.textContent)
          info.appendChild(metaLine);
        info.appendChild(fromProfile);
        const editBtn = document.createElement("button");
        editBtn.className = "sja-exp-edit-btn";
        editBtn.title = "Edit this experience";
        editBtn.textContent = "\u270f";
        editBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          renderExperienceEditForm(dropdown, exp, allExps, section);
        });
        item.appendChild(info);
        item.appendChild(editBtn);
        item.addEventListener("click", (e) => {
          if (e.target === editBtn)
            return;
          e.preventDefault();
          e.stopPropagation();
          renderFieldSelector(dropdown, exp, allExps, section);
        });
        dropdown.appendChild(item);
      });
    }
    function renderFieldSelector(dropdown, exp, allExps, section) {
      dropdown.innerHTML = "";
      const header = document.createElement("div");
      header.className = "sja-dropdown-header";
      header.textContent = `${exp.title || "Untitled"} \u2014 ${exp.company || "Unknown"}`;
      dropdown.appendChild(header);
      if (allExps.length > 1) {
        const backBtn = document.createElement("button");
        backBtn.className = "sja-back-btn";
        backBtn.textContent = "\u2190 Back";
        backBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          renderExperienceList(dropdown, allExps, section);
        });
        dropdown.appendChild(backBtn);
      }
      const EXP_FIELDS = [
        { key: "title", label: "Job Title" },
        { key: "company", label: "Company" },
        { key: "startDate", label: "Start Date" },
        { key: "endDate", label: "End Date" },
        { key: "location", label: "Location" },
        { key: "description", label: "Description" }
      ];
      EXP_FIELDS.forEach(({ key, label }) => {
        const val = exp[key];
        if (!val)
          return;
        const item = document.createElement("div");
        item.className = "sja-dropdown-item sja-field-item";
        const labelSpan = document.createElement("span");
        labelSpan.className = "sja-field-label";
        labelSpan.textContent = label;
        const valSpan = document.createElement("span");
        valSpan.className = "sja-field-val";
        valSpan.textContent = val.length > 45 ? val.slice(0, 45) + "\u2026" : val;
        const check = document.createElement("span");
        check.className = "sja-field-check";
        check.textContent = "\u2713";
        item.appendChild(labelSpan);
        item.appendChild(valSpan);
        item.appendChild(check);
        item.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const container = section || document.body;
          let filled = false;
          container.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea').forEach((inp) => {
            const r = matchFieldToRule(inp);
            if (r?.experienceField === key) {
              simulateInput(inp, val);
              filled = true;
            }
          });
          if (filled) {
            item.classList.add("sja-field-item--done");
          }
        });
        dropdown.appendChild(item);
      });
    }
    function renderExperienceEditForm(dropdown, exp, allExps, section) {
      dropdown.innerHTML = "";
      const header = document.createElement("div");
      header.className = "sja-dropdown-header";
      header.textContent = "Edit Experience";
      dropdown.appendChild(header);
      const backBtn = document.createElement("button");
      backBtn.className = "sja-back-btn";
      backBtn.textContent = "\u2190 Cancel";
      backBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        renderExperienceList(dropdown, allExps, section);
      });
      dropdown.appendChild(backBtn);
      const EXP_EDIT_FIELDS = [
        { key: "title", label: "Job Title", multiline: false },
        { key: "company", label: "Company", multiline: false },
        { key: "startDate", label: "Start Date", multiline: false },
        { key: "endDate", label: "End Date", multiline: false },
        { key: "location", label: "Location", multiline: false },
        { key: "description", label: "Description", multiline: true }
      ];
      const inputs = {};
      EXP_EDIT_FIELDS.forEach(({ key, label, multiline }) => {
        const group = document.createElement("div");
        group.className = "sja-edit-group";
        const lbl = document.createElement("label");
        lbl.className = "sja-edit-label";
        lbl.textContent = label;
        group.appendChild(lbl);
        const inp = multiline ? document.createElement("textarea") : document.createElement("input");
        inp.className = "sja-edit-input";
        inp.value = exp[key] || "";
        if (multiline)
          inp.rows = 3;
        inputs[key] = inp;
        group.appendChild(inp);
        dropdown.appendChild(group);
      });
      const saveBtn = document.createElement("button");
      saveBtn.className = "sja-fill-btn";
      saveBtn.textContent = "Save Changes";
      saveBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        saveBtn.textContent = "Saving\u2026";
        saveBtn.disabled = true;
        chrome.runtime.sendMessage({ type: "GET_ALL_PROFILES" }, (res) => {
          if (!res?.ok) {
            saveBtn.textContent = "Error \u2014 try again";
            saveBtn.disabled = false;
            return;
          }
          const profile = res.data.find((p) => p.id === exp._profileId);
          if (!profile) {
            saveBtn.textContent = "Error \u2014 profile not found";
            saveBtn.disabled = false;
            return;
          }
          const expIdx = profile.experience.findIndex((e) => e.id === exp.id);
          if (expIdx < 0) {
            saveBtn.textContent = "Error \u2014 entry not found";
            saveBtn.disabled = false;
            return;
          }
          profile.experience[expIdx] = {
            id: exp.id,
            isCurrent: exp.isCurrent,
            company: inputs.company.value,
            title: inputs.title.value,
            startDate: inputs.startDate.value,
            endDate: inputs.endDate.value,
            location: inputs.location.value,
            description: inputs.description.value
          };
          chrome.runtime.sendMessage({ type: "SAVE_PROFILE", profile }, (saveRes) => {
            if (!saveRes?.ok) {
              saveBtn.textContent = "Save failed";
              saveBtn.disabled = false;
              return;
            }
            chrome.runtime.sendMessage({ type: "GET_PROFILES_FOR_FILL" }, (fillRes) => {
              if (fillRes?.ok) {
                suggestionState.profiles = fillRes.data.profiles;
                const newAllExps = [];
                fillRes.data.profiles.forEach((p) => {
                  (p.experience || []).forEach((e) => newAllExps.push({ ...e, _profileName: p.name, _profileId: p.id }));
                });
                renderExperienceList(dropdown, newAllExps, section);
              }
            });
          });
        });
      });
      dropdown.appendChild(saveBtn);
    }
    function showSuggestionDropdown(inputEl, rule, anchorBtn) {
      document.querySelectorAll(".sja-dropdown").forEach((d) => d.remove());
      const { profiles, defaultExpId } = suggestionState;
      if (profiles.length === 0)
        return;
      if (!rule.experienceField) {
        const dropdown = document.createElement("div");
        dropdown.className = "sja-dropdown";
        profiles.forEach((profile) => {
          const value = rule.extract(profile);
          if (!value)
            return;
          const item = document.createElement("div");
          item.className = "sja-dropdown-item";
          const label = document.createElement("span");
          label.className = "sja-dropdown-label";
          label.textContent = profile.name;
          const preview = document.createElement("span");
          preview.className = "sja-dropdown-preview";
          preview.textContent = value.length > 60 ? value.slice(0, 60) + "\u2026" : value;
          item.appendChild(label);
          item.appendChild(preview);
          item.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            simulateInput(inputEl, value);
            dropdown.remove();
          });
          dropdown.appendChild(item);
        });
        if (dropdown.children.length === 0) {
          const empty = document.createElement("div");
          empty.className = "sja-dropdown-item";
          empty.textContent = "No data for this field in your profiles.";
          empty.style.color = "#94a3b8";
          dropdown.appendChild(empty);
        }
        const rect = anchorBtn.getBoundingClientRect();
        dropdown.style.top = `${rect.bottom + 4}px`;
        dropdown.style.left = `${rect.left}px`;
        document.body.appendChild(dropdown);
        const ch = (e) => {
          if (!dropdown.contains(e.target) && e.target !== anchorBtn) {
            dropdown.remove();
            document.removeEventListener("click", ch);
          }
        };
        setTimeout(() => document.addEventListener("click", ch), 0);
        return;
      }
      const section = findExperienceSection(inputEl);
      const allExps = [];
      profiles.forEach((p) => {
        (p.experience || []).forEach((e) => allExps.push({ ...e, _profileName: p.name, _profileId: p.id }));
      });
      const dropdown = document.createElement("div");
      dropdown.className = "sja-dropdown";
      const rect = anchorBtn.getBoundingClientRect();
      dropdown.style.top = `${rect.bottom + 4}px`;
      dropdown.style.left = `${rect.left}px`;
      document.body.appendChild(dropdown);
      const closeHandler = (e) => {
        if (!dropdown.contains(e.target) && e.target !== anchorBtn) {
          dropdown.remove();
          document.removeEventListener("click", closeHandler);
        }
      };
      setTimeout(() => document.addEventListener("click", closeHandler), 0);
      const defaultExp = defaultExpId ? allExps.find((e) => e.id === defaultExpId) : null;
      if (defaultExp) {
        renderFieldSelector(dropdown, defaultExp, allExps, section);
      } else {
        renderExperienceList(dropdown, allExps, section);
      }
    }
    function injectStyles() {
      if (document.getElementById("sja-styles"))
        return;
      const style = document.createElement("style");
      style.id = "sja-styles";
      style.textContent = `
      .sja-suggest-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        background: #6366f1;
        color: white;
        border: none;
        border-radius: 4px;
        font-size: 11px;
        cursor: pointer;
        margin-left: 4px;
        vertical-align: middle;
        opacity: 0.85;
        transition: opacity 0.15s, transform 0.15s;
        position: relative;
        z-index: 9999;
        flex-shrink: 0;
      }
      .sja-suggest-btn:hover {
        opacity: 1;
        transform: scale(1.1);
      }
      .sja-dropdown {
        position: fixed;
        z-index: 999999;
        background: #1e293b;
        border: 1px solid #334155;
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        min-width: 280px;
        max-width: 400px;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      }
      .sja-dropdown-item {
        padding: 8px 12px;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 2px;
        border-bottom: 1px solid #273549;
        transition: background 0.1s;
      }
      .sja-dropdown-item:last-child { border-bottom: none; }
      .sja-dropdown-item:hover { background: rgba(99,102,241,0.15); }
      .sja-dropdown-label {
        font-size: 12px;
        font-weight: 600;
        color: #818cf8;
      }
      .sja-dropdown-preview {
        font-size: 11px;
        color: #94a3b8;
        line-height: 1.4;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .sja-dropdown-header {
        padding: 6px 12px;
        font-size: 10px;
        font-weight: 600;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        border-bottom: 1px solid #273549;
      }
      .sja-exp-item { flex-direction: row !important; align-items: flex-start; gap: 6px; }
      .sja-exp-title { font-size: 12px; font-weight: 600; color: #e2e8f0; }
      .sja-exp-meta { font-size: 11px; color: #818cf8; }
      .sja-exp-edit-btn {
        background: none; border: none; color: #475569; cursor: pointer;
        font-size: 13px; padding: 0; flex-shrink: 0; align-self: center; line-height: 1;
      }
      .sja-exp-edit-btn:hover { color: #818cf8; }
      .sja-back-btn {
        display: block; background: none; border: none; color: #818cf8;
        cursor: pointer; font-size: 11px; padding: 5px 12px; text-align: left;
        width: 100%; border-bottom: 1px solid #273549;
      }
      .sja-back-btn:hover { color: #e2e8f0; }
      .sja-field-item { flex-direction: row !important; align-items: center; gap: 8px; }
      .sja-field-item--done { background: rgba(34,197,94,0.08) !important; }
      .sja-field-item--done .sja-field-label { color: #22c55e; }
      .sja-field-item--done .sja-field-check { opacity: 1; }
      .sja-field-label { font-size: 11px; font-weight: 600; color: #94a3b8; min-width: 72px; flex-shrink: 0; }
      .sja-field-val { font-size: 11px; color: #cbd5e1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
      .sja-field-check { font-size: 12px; color: #22c55e; flex-shrink: 0; opacity: 0; transition: opacity 0.15s; }
      .sja-fill-btn {
        display: block; width: calc(100% - 24px); margin: 8px 12px; padding: 7px;
        background: #6366f1; color: #fff; border: none; border-radius: 6px;
        font-size: 12px; font-weight: 600; cursor: pointer;
      }
      .sja-fill-btn:hover { background: #4f46e5; }
      .sja-fill-btn:disabled { opacity: 0.6; cursor: default; }
      .sja-edit-group { padding: 3px 12px; }
      .sja-edit-label {
        display: block; font-size: 10px; font-weight: 600; color: #64748b;
        text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 2px;
      }
      .sja-edit-input {
        width: 100%; box-sizing: border-box; background: #0f172a; border: 1px solid #334155;
        border-radius: 4px; color: #e2e8f0; font-size: 12px; padding: 4px 6px;
        font-family: inherit; resize: vertical;
      }
      .sja-edit-input:focus { outline: none; border-color: #6366f1; }
    `;
      document.head.appendChild(style);
    }
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === "DO_AUTOFILL") {
        injectStyles();
        const count = autofillPage(message.profile);
        chrome.runtime.sendMessage({ type: "GET_PROFILES_FOR_FILL" }, (res) => {
          if (res?.ok)
            injectSuggestionButtons(res.data.profiles, res.data.activeId, res.data.defaultExpId);
        });
        sendResponse({ ok: true, filledCount: count });
      }
      return true;
    });
    function tryInjectSuggestions() {
      chrome.runtime.sendMessage({ type: "GET_PROFILES_FOR_FILL" }, (res) => {
        if (chrome.runtime.lastError)
          return;
        if (res?.ok && res.data.profiles.length > 0) {
          injectStyles();
          injectSuggestionButtons(res.data.profiles, res.data.activeId, res.data.defaultExpId);
        }
      });
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => setTimeout(tryInjectSuggestions, 1500));
    } else {
      setTimeout(tryInjectSuggestions, 1500);
    }
    const observer = new MutationObserver(() => {
      clearTimeout(window.__sjaObserverTimer);
      window.__sjaObserverTimer = setTimeout(tryInjectSuggestions, 800);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  })();
})();
