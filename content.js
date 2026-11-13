(() => {
  "use strict";

  /* =========================================================
   * Shared constants
   * ========================================================= */
  const PRIMARY_LABELS = [
    "Merge pull request",
    "Squash and merge",
    "Rebase and merge",
    "Enable auto-merge",
    "Merge when ready",
    "Add to merge queue",
  ];
  const SQUASH_LABEL = "Squash and merge";
  const LEGACY_METHOD_BUTTON_LABEL = "Select merge method";
  const MENU_ITEM_LABEL = "Squash and merge";

  let appliedForUrl = null;
  let inProgress = false;
  let mainObserver = null;
  let debounceTimer = 0;
  const attemptCounts = new Map();

  /* =========================================================
   * Shared utilities
   * ========================================================= */
  function normalizeText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function isElementVisible(element) {
    if (!(element instanceof Element)) return false;
    if (element.hidden || element.getAttribute("aria-hidden") === "true") {
      return false;
    }
    const style = (typeof getComputedStyle === "function")
      ? getComputedStyle(element)
      : null;
    if (!style) return true;
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function getControlLabel(element) {
    if (!(element instanceof Element)) return "";
    if (element instanceof HTMLInputElement) {
      return normalizeText(element.value || element.getAttribute("aria-label"));
    }
    return normalizeText(
      element.getAttribute("aria-label") || element.textContent
    );
  }

  function findControls(root) {
    if (!root) return [];
    const selector =
      'button, [role="button"], [role^="menuitem"], a, input[type="button"], input[type="submit"]';
    try {
      return Array.from(root.querySelectorAll(selector));
    } catch (e) {
      return [];
    }
  }

  function findExactControl(labels, root) {
    const accepted = new Set(labels);
    const scope = root || document;
    const controls = findControls(scope);
    for (const control of controls) {
      if (control.disabled || control.getAttribute("aria-disabled") === "true") {
        continue;
      }
      if (!isElementVisible(control)) continue;
      if (accepted.has(getControlLabel(control))) {
        return control;
      }
    }
    if (root && root !== document) {
      return findExactControl(labels, document);
    }
    return null;
  }

  function isPopupTrigger(el) {
    if (!el || el.disabled || el.getAttribute("aria-disabled") === "true") {
      return false;
    }
    if (!isElementVisible(el)) return false;
    const hp = el.getAttribute("aria-haspopup");
    return hp === "true" || hp === "menu" || hp === "listbox";
  }

  function findMenuItem(label) {
    const lower = label.toLowerCase();
    const candidates = Array.from(
      document.querySelectorAll('button, [role^="menuitem"], a, [role="option"]')
    );
    for (const el of candidates) {
      if (el.disabled || el.getAttribute("aria-disabled") === "true") continue;
      if (!isElementVisible(el)) continue;
      const text = getControlLabel(el).toLowerCase();
      if (text === lower || text.includes(lower)) {
        if (el.getAttribute("aria-haspopup")) continue;
        return el;
      }
    }
    return null;
  }

  /* =========================================================
   * Classic mode (legacy GitHub merge box)
   * ========================================================= */
  function getClassicMergeBox() {
    const headings = Array.from(document.querySelectorAll("main h2, h2"));
    const heading = headings.find(
      (el) => normalizeText(el.textContent) === "Merge info"
    );
    if (heading && heading.parentElement) return heading.parentElement;
    return null;
  }

  function findClassicMethodButton(mergeBox) {
    const scope = mergeBox || document;
    return findExactControl([LEGACY_METHOD_BUTTON_LABEL], scope);
  }

  /* =========================================================
   * Preview / new mode (current GitHub merge box)
   * ========================================================= */
  function getPreviewMergeBox() {
    const action = findExactControl(PRIMARY_LABELS, document);
    if (!action) return null;
    let node = action.parentElement;
    while (node && node !== document.body && node !== document.documentElement) {
      const popups = Array.from(
        node.querySelectorAll("button, [role=\"button\"]")
      ).filter((b) => isPopupTrigger(b) && b !== action);
      if (popups.length >= 1) {
        return node;
      }
      node = node.parentElement;
    }
    return action.parentElement || null;
  }

  function findPreviewMethodButton(mergeBox) {
    if (!mergeBox) return null;
    const popups = Array.from(
      mergeBox.querySelectorAll("button, [role=\"button\"]")
    ).filter(isPopupTrigger);
    if (popups.length) return popups[0];
    return null;
  }

  /* =========================================================
   * Mode dispatch
   * ========================================================= */
  function getMergeBox() {
    // Classic mode takes priority when its marker is present.
    const classic = getClassicMergeBox();
    if (classic) return classic;
    // Otherwise treat as preview/new mode.
    return getPreviewMergeBox();
  }

  function isClassicMode() {
    return Boolean(getClassicMergeBox());
  }

  function findMethodButton(mergeBox) {
    if (isClassicMode()) {
      const btn = findClassicMethodButton(mergeBox);
      if (btn) return btn;
    }
    const previewBtn = findPreviewMethodButton(mergeBox);
    if (previewBtn) return previewBtn;
    // Legacy text fallback (classic only).
    return findExactControl([LEGACY_METHOD_BUTTON_LABEL], mergeBox || document);
  }

  /* =========================================================
   * Auto-selection logic
   * ========================================================= */
  function waitFor(getter, timeout) {
    timeout = timeout || 2500;
    const existing = getter();
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve) => {
      let settled = false;
      let localObs = null;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        try { if (localObs) localObs.disconnect(); } catch (e) {}
        clearTimeout(timeoutId);
        resolve(value);
      };
      localObs = new MutationObserver(() => {
        const value = getter();
        if (value) finish(value);
      });
      localObs.observe(document.documentElement, { childList: true, subtree: true });
      const timeoutId = setTimeout(() => finish(null), timeout);
    });
  }

  async function tryDefaultToSquash() {
    if (inProgress) return;
    const url = location.href;
    if (appliedForUrl === url) return;

    const attempts = attemptCounts.get(url) || 0;
    if (attempts >= 5) return;

    const mergeBox = getMergeBox();
    if (!mergeBox) return;

    const action = findExactControl(PRIMARY_LABELS, mergeBox);
    if (!action) return;

    const currentLabel = getControlLabel(action);
    if (currentLabel === SQUASH_LABEL) {
      appliedForUrl = url;
      return;
    }

    const menuButton = findMethodButton(mergeBox);
    if (!menuButton) return;

    attemptCounts.set(url, attempts + 1);
    inProgress = true;
    try {
      if (menuButton.getAttribute("aria-expanded") !== "true") {
        menuButton.click();
      }

      const item = await waitFor(() => findMenuItem(MENU_ITEM_LABEL));
      if (!item) {
        return;
      }
      item.click();

      await waitFor(() => {
        const box = getMergeBox() || document;
        const a = findExactControl(PRIMARY_LABELS, box);
        return a && getControlLabel(a) === SQUASH_LABEL ? a : null;
      }, 3000);

      const finalBox = getMergeBox() || document;
      const finalAction = findExactControl(PRIMARY_LABELS, finalBox);
      if (finalAction && getControlLabel(finalAction) === SQUASH_LABEL) {
        appliedForUrl = url;
      }
    } catch (e) {
      // ignore
    } finally {
      inProgress = false;
    }
  }

  function schedule() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void tryDefaultToSquash();
    }, 150);
  }

  function resetForNavigation() {
    appliedForUrl = null;
    inProgress = false;
    attemptCounts.clear();
  }

  function startObserver() {
    if (mainObserver) {
      try { mainObserver.disconnect(); } catch (e) {}
    }
    mainObserver = new MutationObserver(() => schedule());
    mainObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      startObserver();
      schedule();
    }, { once: true });
  } else {
    startObserver();
    schedule();
  }

  for (const evt of ["turbo:load", "turbo:render", "pjax:end", "popstate"]) {
    window.addEventListener(evt, () => {
      resetForNavigation();
      schedule();
    });
  }

  let attempts = 0;
  const poll = setInterval(() => {
    attempts += 1;
    schedule();
    if (attempts > 20) clearInterval(poll);
  }, 500);
})();
