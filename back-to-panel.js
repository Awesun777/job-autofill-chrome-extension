// The editor's bottom menu must offer the same three destinations as the
// panel home. React renders "Fill" wired to its old in-app fill view; swap it
// for one that navigates back to the side-panel home, once the tab bar exists.
(() => {
  const started = Date.now();
  const timer = setInterval(() => {
    const tabs = document.querySelector(".header-tabs");
    if (!tabs) {
      if (Date.now() - started > 4000) clearInterval(timer);
      return;
    }
    clearInterval(timer);
    for (const b of tabs.querySelectorAll(".tab-btn")) {
      if (b.textContent.trim() === "Fill") b.remove();
    }
    const fill = document.createElement("button");
    fill.className = "tab-btn";
    fill.textContent = "Fill";
    fill.addEventListener("click", () => { location.href = "sidepanel.html"; });
    tabs.prepend(fill);

    // Match the panel's header lockup: dog mark + two-tone "Smart JobFill"
    // instead of the React app's ⚡ square + plain text.
    const logo = document.querySelector(".header-logo");
    if (logo) {
      logo.innerHTML =
        '<img src="icons/icon48.png" alt="" style="height:24px" />' +
        '<span style="font-weight:800;font-size:16px">' +
        '<span style="color:#173F6B">Smart</span> <span style="color:#A63D4A">JobFill</span></span>';
    }
  }, 50);
})();
