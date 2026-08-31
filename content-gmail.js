(() => {
  "use strict";

  if (!/^mail\.google\.com$/i.test(location.hostname)) return;

  const {
    ATTR,
    CHIP_ATTR,
    EMAIL_RE,
    parseEmail,
    isFullPersonName,
    linkedInSearchUrl,
    createLink,
    extensionAlive,
    removeIconsIn,
    appEnabled,
    emailDomainExcluded,
    startSiteAdapter,
  } = globalThis.CLI;

  function chipEmail(el) {
    const raw = (el.getAttribute("email") || el.getAttribute("data-hovercard-id") || "")
      .trim()
      .toLowerCase();
    return EMAIL_RE.test(raw) ? raw : "";
  }

  function isAutocomplete(el) {
    return Boolean(el.closest('[role="listbox"], [role="option"], [role="menu"]'));
  }

  function isMessageBody(el) {
    return Boolean(el.closest(".a3s, .gmail_quote, .ii.gt"));
  }

  function isThreadListRow(el) {
    if (el.closest("[data-legacy-message-id], [data-message-id]")) return false;
    if (el.closest("h3")) return false;
    if (el.closest('[role="dialog"]')) return false;

    const row =
      el.closest("tr.zA, tr.yW") ||
      el.closest("tr") ||
      el.closest('[role="listitem"]');
    if (!row) return false;

    return Boolean(
      row.querySelector?.(
        "[data-thread-id], [data-legacy-thread-id], span[data-thread-id]"
      )
    );
  }

  function isAllowedContext(el) {
    if (!el || isAutocomplete(el) || isMessageBody(el)) return false;
    if (isThreadListRow(el)) return true;

    if (el.closest("[data-legacy-message-id], [data-message-id]")) return true;
    if (el.closest("h3")) return true;
    if (el.matches(".gD, .g2, [email][name]")) return true;
    if (el.querySelector?.(".vT") && el.hasAttribute("email")) return true;

    if (
      el.closest(
        '[aria-label="To"], [aria-label="Cc"], [aria-label="Bcc"], [name="to"], [name="cc"], [name="bcc"]'
      )
    ) {
      return true;
    }

    if (el.closest('[role="dialog"]') && chipEmail(el)) return true;
    return false;
  }

  function looksLikeNameList(text) {
    const raw = String(text || "");
    if (!raw.includes(",")) return false;
    const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
    return parts.length >= 2 && parts.every((p) => p.split(/\s+/).length <= 2);
  }

  function extractName(chip) {
    const rawName = chip.getAttribute("name") || "";
    if (rawName && !looksLikeNameList(rawName)) {
      const attrName = isFullPersonName(rawName);
      if (attrName) return attrName;
    }

    const vt = chip.querySelector(".vT");
    if (vt) {
      const name = isFullPersonName(vt.textContent || "");
      if (name) return name;
    }

    const label = chip.getAttribute("aria-label") || "";
    if (!looksLikeNameList(label)) {
      const fromLabel = isFullPersonName(label);
      if (fromLabel) return fromLabel;
    }

    const text = chip.getAttribute("name") ? "" : chip.textContent || "";
    if (text && !looksLikeNameList(text)) {
      const fromText = isFullPersonName(text);
      if (fromText) return fromText;
    }

    return "";
  }

  function iconHost(a) {
    const prev = a.previousElementSibling;
    if (prev && chipEmail(prev)) return prev;
    return a.closest("[email], [data-hovercard-id], [data-cli-chip]");
  }

  function existingIcon(chip) {
    return (
      chip.querySelector(`a[${ATTR}]`) ||
      (chip.nextElementSibling?.matches?.(`a[${ATTR}]`) ? chip.nextElementSibling : null)
    );
  }

  function placeIcon(chip, link) {
    // Sit beside the name, not inside it — Gmail's contact hovercard targets the name span.
    chip.insertAdjacentElement("afterend", link);
    return true;
  }

  function pointInRect(x, y, rect) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function stealOverlayClicks() {
    if (globalThis.__cliGmailClickGuard) return;
    globalThis.__cliGmailClickGuard = true;

    document.addEventListener(
      "pointerdown",
      (e) => {
        if (e.button !== 0) return;
        if (e.target.closest?.(`a[${ATTR}]`)) return;

        const icons = document.querySelectorAll(`a[${ATTR}]`);
        for (const icon of icons) {
          if (!pointInRect(e.clientX, e.clientY, icon.getBoundingClientRect())) continue;
          e.preventDefault();
          e.stopPropagation();
          icon.click();
          return;
        }
      },
      true
    );
  }

  function ensureIcon(chip) {
    if (!appEnabled("gmail") || !chip) return;
    if (!extensionAlive()) return;

    if (!isAllowedContext(chip)) {
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

    const name = extractName(chip);
    if (!name) {
      removeIconsIn(chip);
      return;
    }

    const company = info.company;
    const query = [name, company].filter(Boolean).join(" ").trim();
    if (!query) {
      removeIconsIn(chip);
      return;
    }

    const existing = existingIcon(chip);
    const extId = chrome.runtime.id;
    if (
      existing &&
      existing.dataset.cliEmail === email &&
      existing.dataset.cliQuery === query &&
      existing.dataset.cliExt === extId
    ) {
      chip.setAttribute(CHIP_ATTR, email);
      return;
    }

    removeIconsIn(chip);

    const payload = {
      name,
      company,
      email,
      query,
      url: linkedInSearchUrl(query),
    };

    const link = createLink(payload);
    link.classList.add("cli-linkedin-link--gmail");
    try {
      if (placeIcon(chip, link)) {
        chip.setAttribute(CHIP_ATTR, email);
        stealOverlayClicks();
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
    if (!appEnabled("gmail")) {
      document.querySelectorAll(`a[${ATTR}]`).forEach((a) => a.remove());
      return;
    }

    root.querySelectorAll?.(`a[${ATTR}]`).forEach((a) => {
      const host = iconHost(a);
      if (!host || !isAllowedContext(host) || emailDomainExcluded(a.dataset.cliEmail || "")) {
        a.remove();
      }
    });

    const chips = root.querySelectorAll?.('[email], [data-hovercard-id*="@"]');
    if (!chips) return;

    chips.forEach((el) => {
      if (!isAllowedContext(el)) {
        removeIconsIn(el);
        return;
      }

      const email = chipEmail(el);
      if (!email) return;

      const parentChip = el.parentElement?.closest?.("[email], [data-hovercard-id]");
      if (parentChip && chipEmail(parentChip) === email) return;

      ensureIcon(el);
    });

    root.querySelectorAll?.(`a[${ATTR}]`).forEach((a) => {
      const host = iconHost(a);
      if (!host || !isAllowedContext(host)) {
        a.remove();
        return;
      }
      const email = chipEmail(host);
      if (!email || a.dataset.cliEmail !== email || emailDomainExcluded(email)) a.remove();
    });
  }

  startSiteAdapter({
    appId: "gmail",
    scanFn: scan,
    attributeFilter: ["email", "data-hovercard-id", "name", "aria-label"],
  });
})();
