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

  const appliedKeys = new Set();
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

  function hasDropdownCaret(el) {
    if (!el) return false;
    const svgs = el.querySelectorAll("svg");
    for (const svg of svgs) {
      const cls = (svg.getAttribute("class") || "").toLowerCase();
      if (cls.includes("triangle-down") || cls.includes("chevron-down")) {
        return true;
      }
    }
    return false;
  }

  function isPopupTrigger(el) {
    if (!el || el.disabled || el.getAttribute("aria-disabled") === "true") {
      return false;
    }
    if (!isElementVisible(el)) return false;
    const hp = el.getAttribute("aria-haspopup");
    if (hp === "true" || hp === "menu" || hp === "listbox") return true;
    // Fallback: GitHub renders a down-caret icon in merge-method selectors.
    return hasDropdownCaret(el);
  }

  function findMenuItem(label) {
    const lower = label.toLowerCase();
    const all = Array.from(
      document.querySelectorAll('button, [role^="menuitem"], a, [role="option"]')
    );
    // Prefer actual menu entries: role menuitem/option, or anything inside a menu/listbox/popover.
    const prioritized = all.filter((el) => {
      const role = (el.getAttribute("role") || "").toLowerCase();
      if (role.startsWith("menuitem") || role === "option") return true;
      // Only treat as a menu entry if it sits inside an actual menu/listbox,
      // not anywhere within the dialog (avoids "Confirm ..." buttons).
      return Boolean(el.closest && el.closest('[role="menu"], [role="listbox"]'));
    });
    // Remove the main merge buttons from the fallback pool.
    const fallback = all.filter((el) => {
      const cls = (el.className || "").toString();
      return !cls.includes("flex-1");
    });
    const pools = prioritized.length ? [prioritized, fallback] : [fallback, all];
    for (const pool of pools) {
      for (const el of pool) {
        if (el.disabled || el.getAttribute("aria-disabled") === "true") continue;
        if (!isElementVisible(el)) continue;
        const text = getControlLabel(el).toLowerCase();
        if (text.includes("confirm")) continue;
        if (text === lower || text.includes(lower)) {
          if (el.getAttribute("aria-haspopup")) continue;
          return el;
        }
      }
    }
    return null;
  }

  /* =========================================================
   * Helpers for choosing the active merge box (handles dialogs)
   * ========================================================= */
  function isInDialog(el) {
    return Boolean(
      el &&
        el.closest &&
        el.closest(
          '[role="dialog"], [aria-modal="true"], dialog, [class*="SidePanel"]'
        )
    );
  }

  function findPreferredMergeButton() {
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]')).filter(
      (b) => PRIMARY_LABELS.includes(getControlLabel(b)) && isElementVisible(b)
    );
    if (!buttons.length) return null;
    const inDialog = buttons.filter(isInDialog);
    const pool = inDialog.length ? inDialog : buttons;
    return pool[pool.length - 1];
  }

  /* =========================================================
   * Classic mode (legacy GitHub merge box)
   * ========================================================= */
  function getClassicMergeBox() {
    const headings = Array.from(document.querySelectorAll("main h2, h2")).filter(
      (el) => normalizeText(el.textContent) === "Merge info"
    );
    if (!headings.length) return null;
    const inDialog = headings.filter(isInDialog);
    const pool = inDialog.length ? inDialog : headings;
    const heading = pool[pool.length - 1];
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
    const action = findPreferredMergeButton();
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
    // A merge box inside an open dialog takes priority over the
    // background page's classic merge box.
    const preferred = findPreferredMergeButton();
    if (preferred && isInDialog(preferred)) {
      return getPreviewMergeBox();
    }
    // If a dialog is open but its merge button hasn't rendered yet, wait
    // instead of falling back to the background merge box.
    if (document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]')) {
      return null;
    }
    const classic = getClassicMergeBox();
    if (classic) return classic;
    return getPreviewMergeBox();
  }

  function isClassicMode() {
    const preferred = findPreferredMergeButton();
    if (preferred && isInDialog(preferred)) return false;
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
    const dialogOpen = Boolean(
      document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]')
    );

    // Keep the cases separate: handle only the active case.
    const candidates = [];
    const preferred = findPreferredMergeButton();
    if (preferred && isInDialog(preferred)) {
      const b = getPreviewMergeBox();
      if (b) candidates.push({ box: b, key: url + "::dialog" });
    } else {
      const classic = getClassicMergeBox();
      if (classic) {
        candidates.push({ box: classic, key: url });
      } else {
        const pm = getPreviewMergeBox();
        if (pm) candidates.push({ box: pm, key: url });
      }
    }

    // De-duplicate by key.
    const unique = [];
    const seen = new Set();
    for (const c of candidates) {
      if (seen.has(c.key)) continue;
      seen.add(c.key);
      unique.push(c);
    }

    const toHandle = unique.filter((c) => !appliedKeys.has(c.key));
    if (toHandle.length === 0) return;

    // Respect per-key attempt limits.
    const allowed = toHandle.filter((c) => (attemptCounts.get(c.key) || 0) < 5);
    if (allowed.length === 0) return;

    inProgress = true;
    try {
      for (const { box, key } of allowed) {
        const action = findExactControl(PRIMARY_LABELS, box);
        if (!action) continue;

        const currentLabel = getControlLabel(action);
        if (currentLabel === SQUASH_LABEL) {
          appliedKeys.add(key);
          continue;
        }

        attemptCounts.set(key, (attemptCounts.get(key) || 0) + 1);

        const menuButton = findMethodButton(box);
        if (!menuButton) continue;

        if (menuButton.getAttribute("aria-expanded") !== "true") {
          menuButton.click();
        }

        const item = await waitFor(() => findMenuItem(MENU_ITEM_LABEL));
        if (!item) continue;
        item.click();

        await waitFor(() => {
          const a = findExactControl(PRIMARY_LABELS, box);
          return a && getControlLabel(a) === SQUASH_LABEL ? a : null;
        }, 3000);

        const finalAction = findExactControl(PRIMARY_LABELS, box);
        if (finalAction && getControlLabel(finalAction) === SQUASH_LABEL) {
          appliedKeys.add(key);
        }
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
    appliedKeys.clear();
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
