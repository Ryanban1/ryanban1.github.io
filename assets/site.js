// Theme toggle, copy-email button and the one-time sweep of the activity capture.
// Everything on the site works without this file.
(function () {
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  var toggle = document.querySelector(".toggle");
  function theme() { return root.getAttribute("data-theme") || (mq && mq.matches ? "dark" : "light"); }
  function sync() {
    var t = theme();
    if (toggle) {
      var label = t === "dark" ? "Switch to light theme" : "Switch to dark theme";
      toggle.setAttribute("aria-label", label);
      toggle.setAttribute("title", label);
    }
    if (root.hasAttribute("data-theme")) {
      var metas = document.querySelectorAll('meta[name="theme-color"]');
      for (var i = 0; i < metas.length; i++) metas[i].setAttribute("content", t === "dark" ? "#111418" : "#FFFFFF");
    }
  }
  if (toggle) toggle.addEventListener("click", function () {
    var next = theme() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch (e) {}
    sync();
  });
  if (mq && mq.addEventListener) mq.addEventListener("change", sync);
  sync();

  var copy = document.querySelector("[data-copy]");
  if (copy && navigator.clipboard && window.isSecureContext) {
    var status = document.getElementById("copy-status"), timer;
    copy.hidden = false;
    copy.addEventListener("click", function () {
      navigator.clipboard.writeText(copy.getAttribute("data-copy")).then(function () {
        copy.textContent = "Copied";
        if (status) status.textContent = "Email address copied";
        clearTimeout(timer);
        timer = setTimeout(function () { copy.textContent = "Copy"; if (status) status.textContent = ""; }, 2000);
      });
    });
  }

  // The sweep starts as soon as any part of the capture is in the top 80% of the
  // viewport. A fixed visible fraction would never be reached in a short viewport
  // (for example 400% zoom), leaving the traces hidden. A capture much taller than
  // the viewport isn't armed at all, so its traces are simply shown.
  var cap = document.querySelector(".capture");
  var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (cap && !calm && "IntersectionObserver" in window && cap.offsetHeight <= 3 * window.innerHeight) {
    cap.classList.add("is-armed");
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) if (entries[i].isIntersecting) {
        cap.classList.add("is-live");
        io.disconnect();
        // The pass takes 1.55s; then the capture is marked done and stays still.
        setTimeout(function () { cap.classList.add("is-done"); }, 1700);
        return;
      }
    }, { threshold: 0, rootMargin: "0px 0px -20% 0px" });
    io.observe(cap);
  }
})();
