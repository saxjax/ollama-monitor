// Surface controller. Keeps Classic and the prototype surfaces in one document
// over the shared store, so switching between them never navigates or reloads:
// the live data stays warm and the selected session is preserved across the
// switch. The prototype lab remains reachable; because a single prototype
// instance is fixed to its lab mode at first start, entering the lab from the
// month surface uses a normal link, while the primary Classic <-> Run the month
// toggle is instant.
(() => {
  const SURFACE_KEY = "saxjax.surface.v1";
  const params = new URLSearchParams(location.search);
  const labRoute =
    params.get("prototype") === "monitor" &&
    params.get("surface") !== "default";
  // The prototype identity for this page load. A page reload is only needed to
  // move between "month" and "lab", not for the primary Classic toggle.
  const prototypeSurface = labRoute ? "lab" : "month";

  function readStoredSurface() {
    try {
      return localStorage.getItem(SURFACE_KEY);
    } catch {
      return null;
    }
  }

  function storeSurface(name) {
    try {
      localStorage.setItem(SURFACE_KEY, name);
    } catch {
      // Surface memory is best-effort when storage is unavailable.
    }
  }

  function initialSurface() {
    if (labRoute) return "lab";
    if (params.get("prototype") === "monitor") return "month";
    const stored = readStoredSurface();
    return stored === "month" ? "month" : "classic";
  }

  const loadedBundles = new Set();

  function loadScript(src, { module }) {
    return new Promise((resolve, reject) => {
      if (loadedBundles.has(src)) {
        resolve();
        return;
      }
      const element = document.createElement("script");
      if (module) element.type = "module";
      else element.defer = true;
      element.src = src;
      element.addEventListener("load", () => {
        loadedBundles.add(src);
        resolve();
      });
      element.addEventListener("error", () =>
        reject(new Error(`Failed to load ${src}`)),
      );
      document.body.append(element);
    });
  }

  async function ensureBundle(name) {
    if (name === "classic") {
      await loadScript("/monitor/app.js", { module: false });
      await loadScript("/monitor/usage-timeline.js", { module: true });
      return;
    }
    await loadScript("/monitor/monitor-ux-prototypes.js", { module: true });
    window.SaxjaxMonitorSurfaces?.prototype?.ensureStarted({
      lab: name === "lab",
      variant: name === "month" ? "I" : undefined,
    });
  }

  let currentSurface = initialSurface();

  function reflectUrl(name) {
    const url = new URL(location.href);
    if (name === "classic") {
      url.searchParams.delete("prototype");
      url.searchParams.delete("surface");
    } else if (name === "month") {
      url.searchParams.set("prototype", "monitor");
      url.searchParams.set("surface", "default");
      if (!url.searchParams.get("variant"))
        url.searchParams.set("variant", "I");
    }
    history.replaceState(null, "", `${url.pathname}${url.search}`);
  }

  function reflectVisibility(name) {
    document.documentElement.classList.toggle(
      "monitor-ux-prototype-active",
      name !== "classic",
    );
    document.body.dataset.surface = name;
  }

  async function setSurface(name) {
    if (name !== "classic" && name !== prototypeSurface) return;
    await ensureBundle(name);
    currentSurface = name;
    reflectVisibility(name);
    if (name === "classic" || name === "month") {
      storeSurface(name);
      reflectUrl(name);
    }
    updateSwitcher();
    window.dispatchEvent(
      new CustomEvent("saxjax-surface-change", { detail: { surface: name } }),
    );
  }

  let switcher;
  function updateSwitcher() {
    if (!switcher) return;
    switcher.querySelectorAll("[data-shell-surface]").forEach((button) => {
      const active = button.dataset.shellSurface === currentSurface;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function buildSwitcher() {
    switcher = document.createElement("nav");
    switcher.id = "saxjax-surface-switch";
    switcher.className = "surface-switch shell-switch";
    switcher.setAttribute("aria-label", "Monitor surface switch");

    const prototypeLabel =
      prototypeSurface === "lab" ? "Prototype lab" : "Run the month";
    switcher.innerHTML = `
      <button type="button" class="surface-link" data-shell-surface="classic" aria-pressed="false" title="Classic monitor">Classic</button>
      <button type="button" class="surface-link" data-shell-surface="${prototypeSurface}" aria-pressed="false" title="${prototypeLabel}">${prototypeLabel}</button>
      ${
        prototypeSurface === "month"
          ? `<a class="surface-link surface-link-secondary" href="/monitor/?prototype=monitor&surface=lab" title="Open the full prototype lab">Lab</a>`
          : `<a class="surface-link surface-link-secondary" href="/monitor/?prototype=monitor&surface=default&variant=I" title="Open the Run the month monitor">Run the month</a>`
      }
    `;

    switcher.addEventListener("click", (event) => {
      const button = event.target.closest("[data-shell-surface]");
      if (!button) return;
      event.preventDefault();
      void setSurface(button.dataset.shellSurface);
    });

    document.body.append(switcher);
  }

  window.SaxjaxMonitorShell = {
    getSurface: () => currentSurface,
    isActive: (name) => currentSurface === name,
    setSurface,
  };

  function start() {
    reflectVisibility(currentSurface);
    buildSwitcher();
    updateSwitcher();
    void ensureBundle(currentSurface).then(() => {
      window.dispatchEvent(
        new CustomEvent("saxjax-surface-change", {
          detail: { surface: currentSurface },
        }),
      );
    });
    // Warm the other primary surface once idle so the first toggle is instant.
    const other = currentSurface === "classic" ? prototypeSurface : "classic";
    const warm = () => {
      void ensureBundle(other).catch(() => {});
    };
    if ("requestIdleCallback" in window)
      requestIdleCallback(warm, { timeout: 4000 });
    else setTimeout(warm, 2000);
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start);
  else start();
})();
