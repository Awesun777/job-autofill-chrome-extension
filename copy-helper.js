// Double-click to copy, for the side-panel workflow: keep the panel open on
// the right, scroll to any piece of resume info, double-click it and paste it
// into the application form. Works on top of the React UI without touching the
// bundle: pure event delegation on whatever is rendered.
(() => {
  // Containers that represent one meaningful piece of information. Order
  // matters: the closest match wins, so a click inside an experience card's
  // title copies just that card, not the whole list.
  const COPYABLE =
    ".form-group, .experience-card, .education-card, .skill-tag, " +
    ".profile-card, .profile-list-item, .settings-card";

  let toastEl = null;
  let toastTimer = 0;

  function showToast(x, y, msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.style.cssText =
        "position:fixed;z-index:99999;pointer-events:none;padding:4px 10px;" +
        "border-radius:6px;background:#22c55e;color:#fff;font-size:12px;" +
        "font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,.4);" +
        "transition:opacity .2s;opacity:0;";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.left = `${Math.min(x, window.innerWidth - 90)}px`;
    toastEl.style.top = `${Math.max(y - 30, 4)}px`;
    toastEl.style.opacity = "1";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.style.opacity = "0"; }, 1100);
  }

  function flash(el) {
    const prev = el.style.outline;
    el.style.outline = "2px solid #22c55e";
    el.style.outlineOffset = "1px";
    setTimeout(() => { el.style.outline = prev; el.style.outlineOffset = ""; }, 450);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API can be denied in extension pages on some setups; the
      // textarea fallback always works inside a user gesture.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  }

  document.addEventListener("dblclick", async (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;

    // A form control copies its own value; a container copies the value of
    // the control inside it, or failing that its visible text.
    const control = target.closest("input, textarea, select");
    let box = control ?? target.closest(COPYABLE);
    if (!box) return;

    let text = "";
    if (control && "value" in control) {
      text = String(control.value ?? "");
    } else {
      const inner = box.querySelector("input, textarea, select");
      text = inner && inner.value ? String(inner.value) : (box.innerText ?? "");
    }
    text = text.trim();
    if (!text) return;

    await copyText(text);
    flash(box);
    showToast(e.clientX, e.clientY, "Copied ✓");
    // Double-click also selects a word by default; keep the visual state
    // consistent with "the whole value was copied".
    window.getSelection?.()?.removeAllRanges();
  });
})();
