// popup.html is now only reached from the side panel's "Manage profiles":
// float a way back to the panel home over the React editor.
(() => {
  const btn = document.createElement("button");
  btn.textContent = "← Back";
  btn.style.cssText =
    "position:fixed;top:8px;right:8px;z-index:99999;padding:5px 12px;" +
    "border:1px solid #E7DFD2;border-radius:8px;background:#FFFDF8;" +
    "color:#173F6B;font:700 12px 'Nunito Sans',-apple-system,system-ui,sans-serif;" +
    "cursor:pointer;opacity:.95;";
  btn.addEventListener("mouseenter", () => { btn.style.opacity = "1"; });
  btn.addEventListener("mouseleave", () => { btn.style.opacity = ".9"; });
  btn.addEventListener("click", () => { location.href = "sidepanel.html"; });
  document.body.appendChild(btn);
})();
