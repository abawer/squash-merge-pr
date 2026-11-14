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

  const handledBoxes = new Set();
  const appliedKeys = new Set();
  const attemptCounts = new Map();
  let inProgress = false;
  let mainObserver = null;
  let debounceTimer = 0;

  /* =========================================================
   * Work indicator badge
   *
   * A small floating badge that vibrates while the extension is
   * actively selecting "Squash and merge". Pure DOM/CSS — no
   * browser extension APIs — so it behaves identically in every
   * browser this extension is loaded into. It is temporary: it
   * appears while work is in progress, stops vibrating once the
   * pass finishes, and disappears a few seconds later.
   * ========================================================= */
  let workBadge = null;
  let badgeStyleInjected = false;
  let badgeHideTimer = 0;
  // Plugin icon (icons/icon32.png) inlined as a data URL so the badge
  // needs no web_accessible_resources entry and works in any browser.
  const ICON_DATA_URL = "data:image/png;base64,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";

  function injectBadgeStyle() {
    if (badgeStyleInjected) return;
    badgeStyleInjected = true;
    const style = document.createElement("style");
    style.textContent = `
      @keyframes squash-merge-vibrate {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-3px); }
        75% { transform: translateX(3px); }
      }
      @keyframes squash-merge-pulse {
        0% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.6); }
        70% { box-shadow: 0 0 0 6px rgba(255, 255, 255, 0); }
        100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
      }
      .squash-merge-work-badge {
        position: fixed;
        top: 12px;
        right: 12px;
        z-index: 2147483647;
        display: none;
        pointer-events: none;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        font: 600 14px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #fff;
        background: #2da44e;
        border: 1px solid #1f883d;
        border-radius: 999px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
        cursor: default;
        user-select: none;
      }
      .squash-merge-work-badge .icon {
        width: 24px;
        height: 24px;
        padding: 2px;
        background: #fff;
        border-radius: 6px;
        box-sizing: border-box;
      }
      .squash-merge-work-badge.visible { display: inline-flex; }
      .squash-merge-work-badge.vibrating { animation: squash-merge-vibrate 0.3s infinite; }
      .squash-merge-work-badge .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #fff;
        animation: squash-merge-pulse 1.2s infinite;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureBadge() {
    injectBadgeStyle();
    if (workBadge) return workBadge;
    workBadge = document.createElement("div");
    workBadge.className = "squash-merge-work-badge";
    workBadge.setAttribute("aria-live", "polite");
    workBadge.setAttribute("role", "status");
    workBadge.setAttribute("title", "GitHub Default Squash Merge is setting the merge method");
    workBadge.innerHTML =
      '<img class="icon" src="' + ICON_DATA_URL + '" alt="">' +
      '<span class="dot"></span>Squash';
    (document.body || document.documentElement).appendChild(workBadge);
    return workBadge;
  }

  function showWorkBadge() {
    clearTimeout(badgeHideTimer);
    const badge = ensureBadge();
    badge.classList.toggle("vibrating", inProgress);
    badge.classList.add("visible");
  }

  function hideWorkBadge() {
    if (!workBadge) return;
    // Stop vibrating, but leave the badge up briefly so the user can
    // see the extension finished its pass.
    workBadge.classList.remove("vibrating");
    clearTimeout(badgeHideTimer);
    badgeHideTimer = setTimeout(() => {
      if (workBadge) workBadge.classList.remove("visible");
    }, 5000);
  }

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
    // Only accept real menu entries. Confirm buttons are not menu items.
    const menuItems = all.filter((el) => {
      const role = (el.getAttribute("role") || "").toLowerCase();
      if (role.startsWith("menuitem") || role === "option") return true;
      return Boolean(el.closest && el.closest('[role="menu"], [role="listbox"]'));
    });
    const inMenu = all.filter((el) => Boolean(el.closest && el.closest('[role="menu"], [role="listbox"]')));
    const pools = [];
    if (menuItems.length) pools.push(menuItems);
    if (inMenu.length && inMenu !== menuItems) pools.push(inMenu);
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

  function getMergeBoxes() {
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]')).filter(
      (b) => PRIMARY_LABELS.includes(getControlLabel(b)) && isElementVisible(b)
    );
    const boxes = [];
    const seen = new Set();
    for (const btn of buttons) {
      let node = btn.parentElement;
      let box = null;
      while (node && node !== document.body && node !== document.documentElement) {
        const popups = Array.from(node.querySelectorAll('button, [role="button"]')).filter(
          (b) => isPopupTrigger(b) && b !== btn
        );
        if (popups.length >= 1) {
          box = node;
          break;
        }
        node = node.parentElement;
      }
      if (!box) box = btn.parentElement || document;
      if (seen.has(box)) continue;
      seen.add(box);
      boxes.push(box);
    }
    return boxes;
  }

  async function tryDefaultToSquash() {
    if (inProgress) return;
    const boxes = getMergeBoxes();
    const toHandle = boxes.filter(
      (box) => !handledBoxes.has(box) && (attemptCounts.get(box) || 0) < 5
    );
    if (toHandle.length === 0) return;

    inProgress = true;
    showWorkBadge();
    try {
      for (const box of toHandle) {
        const action = findExactControl(PRIMARY_LABELS, box);
        if (!action) continue;

        const currentLabel = getControlLabel(action);
        if (currentLabel === SQUASH_LABEL) {
          handledBoxes.add(box);
          continue;
        }

        attemptCounts.set(box, (attemptCounts.get(box) || 0) + 1);

        const menuButton = findMethodButton(box);
        if (!menuButton) continue;

        if (menuButton.getAttribute("aria-expanded") !== "true") {
          try { menuButton.focus(); } catch (e) {}
          menuButton.click();
        }

        const item = await waitFor(() => findMenuItem(MENU_ITEM_LABEL));
        if (!item) continue;
        item.click();
        try { menuButton.blur(); } catch (e) {}
        try { document.body.focus(); } catch (e) {}

        await waitFor(() => {
          const a = findExactControl(PRIMARY_LABELS, box);
          return a && getControlLabel(a) === SQUASH_LABEL ? a : null;
        }, 3000);

        const finalAction = findExactControl(PRIMARY_LABELS, box);
        if (finalAction && getControlLabel(finalAction) === SQUASH_LABEL) {
          handledBoxes.add(box);
        }
      }
    } catch (e) {
      // ignore
    } finally {
      inProgress = false;
      hideWorkBadge();
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
    hideWorkBadge();
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
