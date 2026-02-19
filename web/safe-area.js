(function () {
  const root = document.documentElement;
  if (!root) return;

  const ua = navigator.userAgent || "";
  const isIOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!isIOS) return;

  const probe = document.createElement("div");
  probe.style.position = "fixed";
  probe.style.top = "0";
  probe.style.left = "0";
  probe.style.width = "0";
  probe.style.height = "constant(safe-area-inset-top)";
  probe.style.height = "env(safe-area-inset-top)";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.zIndex = "-1";

  document.body.appendChild(probe);
  const detected = parseFloat(window.getComputedStyle(probe).height) || 0;
  probe.remove();

  if (detected > 0) {
    root.style.setProperty("--safe-area-inset-top", `${detected}px`);
    return;
  }

  // Fallback for iOS in-app browsers that return 0 for safe-area env vars.
  const fallbackTop = /iPad/i.test(ua) ? 24 : 44;
  root.style.setProperty("--safe-area-inset-top", `${fallbackTop}px`);
})();
