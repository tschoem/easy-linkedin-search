(() => {
  "use strict";

  const {
    ATTR,
    CHIP_ATTR,
    EMAIL_RE,
    parseEmail,
    normalizePersonName,
    linkedInSearchUrl,
    createLink,
    extensionAlive,
    removeIconsIn,
    appEnabled,
    buildQuery,
    emailDomainExcluded,
    startSiteAdapter,
  } = globalThis.CLI;

  function chipEmail(chip) {
    const raw =
      chip.getAttribute("data-hovercard-id") ||
      chip.getAttribute("data-email") ||
      "";
    const normalized = String(raw).trim().toLowerCase();
    return EMAIL_RE.test(normalized) ? normalized : "";
  }

  function extractName(chip, emailInfo) {
    const selectors = [".SDqFWd > span", ".SDqFWd span", ".SDqFWd", ".ddPise > span"];
    for (const sel of selectors) {
      const node = chip.querySelector(sel);
      if (!node) continue;
      if (node.querySelector?.("[data-hovercard-id], [data-email]")) continue;
      const name = normalizePersonName(node.textContent || "");
      if (name) return name;
    }
    if (emailInfo?.name) return emailInfo.name;
    return "";
  }

  function findNameAnchor(chip) {
    return (
      chip.querySelector(".SDqFWd") ||
      chip.querySelector(".ddPise") ||
      chip.querySelector(".CVKLNd") ||
      null
    );
  }

  function isPeoplePickerContext(el) {
    if (!el) return true;

    const pickerRoot =
      el.closest('[role="listbox"], [role="dialog"], [role="menu"], [role="combobox"]') ||
      el.parentElement;
    if (!pickerRoot) return false;

    const probe = (pickerRoot.innerText || "").slice(0, 800);
    if (/meet with|search for people/i.test(probe)) return true;

    if (
      pickerRoot.querySelector?.(
        'input[placeholder*="Search for people" i], input[aria-label*="Search for people" i], input[placeholder*="Meet with" i]'
      )
    ) {
      return true;
    }

    if (el.closest('[role="option"]')) {
      const scope =
        el.closest('[role="dialog"]') ||
        el.closest('[role="listbox"]')?.parentElement ||
        document.body;
      if (
        scope?.querySelector?.(
          'input[placeholder*="Search for people" i], input[aria-label*="Search for people" i]'
        )
      ) {
        return true;
      }
      if (/meet with|search for people/i.test((scope?.innerText || "").slice(0, 400))) {
        return true;
      }
    }

    return false;
  }

  function placeIcon(chip, link) {
    const row = chip.querySelector(".ddPise");
    const name = chip.querySelector(".SDqFWd");

    if (row) {
      row.appendChild(link);
      return true;
    }
    if (name) {
      name.insertAdjacentElement("afterend", link);
      return true;
    }
    return false;
  }

  function ensureIcon(chip) {
    if (!appEnabled("calendar") || !chip) return;
    if (!extensionAlive()) return;

    if (isPeoplePickerContext(chip)) {
      removeIconsIn(chip);
      return;
    }

    const email = chipEmail(chip);
    if (!email || emailDomainExcluded(email)) {
      removeIconsIn(chip);
      return;
    }

    const info = parseEmail(email);
    if (!info) return;

    if (!findNameAnchor(chip)) {
      removeIconsIn(chip);
      return;
    }

    const existing = chip.querySelector(`a[${ATTR}]`);
    const extId = chrome.runtime.id;
    if (existing && existing.dataset.cliEmail === email && existing.dataset.cliExt === extId) {
      chip.setAttribute(CHIP_ATTR, email);
      return;
    }

    removeIconsIn(chip);

    const name = extractName(chip, info);
    const company = info.company;
    const query = buildQuery(name, company, email, info);
    if (!query) return;

    const payload = {
      name: name || info.name || "",
      company,
      email,
      query,
      url: linkedInSearchUrl(query),
    };

    const link = createLink(payload);
    try {
      if (placeIcon(chip, link)) {
        chip.setAttribute(CHIP_ATTR, email);
      } else {
        link.remove();
      }
    } catch (_) {
      try {
        link.remove();
      } catch (__) {}
    }
  }

  function scan(root = document.body) {
    if (!root) return;
    if (!appEnabled("calendar")) {
      document.querySelectorAll(`a[${ATTR}]`).forEach((a) => a.remove());
      return;
    }

    root.querySelectorAll?.(`a[${ATTR}]`).forEach((a) => {
      if (isPeoplePickerContext(a)) a.remove();
    });

    const chips = root.querySelectorAll?.(
      '[data-hovercard-id*="@"], [data-email*="@"]'
    );
    if (!chips) return;

    const seen = new Set();
    chips.forEach((el) => {
      if (isPeoplePickerContext(el)) {
        const bad = el.closest("[data-hovercard-id], [data-email]") || el;
        removeIconsIn(bad);
        return;
      }

      const email =
        (EMAIL_RE.test((el.getAttribute("data-hovercard-id") || "").toLowerCase()) &&
          el.getAttribute("data-hovercard-id").toLowerCase()) ||
        (EMAIL_RE.test((el.getAttribute("data-email") || "").toLowerCase()) &&
          el.getAttribute("data-email").toLowerCase()) ||
        "";
      if (!email || seen.has(email)) return;

      const chip =
        el.matches("[data-hovercard-id*='@'], [data-email*='@']") && chipEmail(el)
          ? el
          : el.closest("[data-hovercard-id*='@'], [data-email*='@']") || el;

      if (isPeoplePickerContext(chip)) {
        removeIconsIn(chip);
        return;
      }

      const parentChip = chip.parentElement?.closest?.(
        "[data-hovercard-id*='@'], [data-email*='@']"
      );
      if (parentChip && chipEmail(parentChip) === email) return;

      seen.add(email);
      ensureIcon(chip);
    });

    root.querySelectorAll?.(`a[${ATTR}]`).forEach((a) => {
      if (isPeoplePickerContext(a)) {
        a.remove();
        return;
      }
      const host = a.closest("[data-hovercard-id], [data-email]");
      if (!host) {
        a.remove();
        return;
      }
      if (isPeoplePickerContext(host) || !findNameAnchor(host)) {
        a.remove();
        return;
      }
      const email = chipEmail(host);
      if (!email || a.dataset.cliEmail !== email) a.remove();
    });
  }

  startSiteAdapter({
    appId: "calendar",
    scanFn: scan,
    attributeFilter: ["data-email", "data-hovercard-id", "aria-label"],
  });
})();
