// popup.html is now only reached from the side panel's "Manage profiles":
// float a way back to the panel home over the React editor.
(() => {
  const btn = document.createElement("button");
  btn.textContent = "← Back";
  btn.style.cssText =
    "position:fixed;top:8px;right:8px;z-index:99999;padding:5px 12px;" +
    "border:1px solid #334155;border-radius:8px;background:#1e293b;" +
    "color:#f1f5f9;font:600 12px -apple-system,system-ui,sans-serif;" +
    "cursor:pointer;opacity:.9;";
  btn.addEventListener("mouseenter", () => { btn.style.opacity = "1"; });
  btn.addEventListener("mouseleave", () => { btn.style.opacity = ".9"; });
  btn.addEventListener("click", () => { location.href = "sidepanel.html"; });
  document.body.appendChild(btn);
})();
