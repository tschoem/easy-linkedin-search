(() => {
  "use strict";

  if (globalThis.__cliSharedLoaded) return;
  globalThis.__cliSharedLoaded = true;

  const ATTR = "data-cli-linkedin";
  const CHIP_ATTR = "data-cli-chip";
  const EMAIL_RE =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  const EMAIL_FIND_RE =
    /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+/;
  const NOISE_WORDS =
    /\b(organizer|guest|optional|accepted|declined|needs action|yes|no|maybe|home|office|edit|working location|out of office)\b/gi;

  const GENERIC_MAILBOXES = new Set([
    "info",
    "contact",
    "hello",
    "support",
    "admin",
    "sales",
    "team",
    "noreply",
    "no-reply",
    "mail",
    "office",
    "help",
    "billing",
    "hr",
    "jobs",
    "careers",
  ]);

  const LINKEDIN_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#0A66C2" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  `.trim();

  let settings =
    typeof cliNormalizeSettings === "function" && typeof CLI_DEFAULTS !== "undefined"
      ? cliNormalizeSettings(CLI_DEFAULTS)
      : { enabled: true, clickTarget: "sidePanel", apps: { calendar: true, gmail: true, hubspot: true }, excludedDomains: [] };

  function titleCase(parts) {
    return parts
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
      .join(" ");
  }

  function companyFromDomain(domain) {
    if (!domain) return "";
    const host = domain.toLowerCase().replace(/^www\./, "");
    const labels = host.split(".");
    const skip = new Set([
      "com",
      "org",
      "net",
      "io",
      "co",
      "ai",
      "app",
      "dev",
      "edu",
      "gov",
      "uk",
      "us",
      "fr",
      "de",
      "es",
      "it",
      "nl",
      "be",
      "ca",
      "au",
      "jp",
      "in",
    ]);
    const brand = labels.find((l) => !skip.has(l)) || labels[0];
    if (
      !brand ||
      ["gmail", "googlemail", "outlook", "hotmail", "yahoo", "icloud", "me", "live", "msn"].includes(
        brand
      )
    ) {
      return "";
    }
    return brand.charAt(0).toUpperCase() + brand.slice(1);
  }

  function nameFromLocalPart(local) {
    if (!local) return "";
    const cleaned = local
      .split("+")[0]
      .replace(/\d+$/g, "")
      .replace(/[._-]+/g, " ")
      .trim();
    if (!cleaned) return "";
    const firstToken = cleaned.split(/\s+/)[0].toLowerCase();
    if (GENERIC_MAILBOXES.has(firstToken) || GENERIC_MAILBOXES.has(cleaned.toLowerCase())) {
      return "";
    }
    const parts = cleaned.split(/\s+/).filter((p) => p.length > 1 || /[A-Za-z]/.test(p));
    if (parts.length === 0) return "";
    if (parts.length >= 3) return titleCase([parts[0], parts[parts.length - 1]]);
    return titleCase(parts);
  }

  function parseEmail(email) {
    const normalized = String(email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(normalized)) return null;
    const at = normalized.lastIndexOf("@");
    return {
      email: normalized,
      name: nameFromLocalPart(normalized.slice(0, at)),
      company: companyFromDomain(normalized.slice(at + 1)),
    };
  }

  function normalizePersonName(raw) {
    if (!raw) return "";
    let name = String(raw)
      .replace(EMAIL_FIND_RE, "")
      .replace(NOISE_WORDS, " ")
      .replace(/[<>()[\]|]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (name.includes(",")) {
      const [last, ...rest] = name
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      if (last && rest.length) name = `${rest.join(" ")} ${last}`.replace(/\s+/g, " ").trim();
    }

    const words = name.split(/\s+/).filter(Boolean);
    if (words.length > 4) name = words.slice(0, 3).join(" ");
    if (!name || name.length < 2 || name.includes("@")) return "";
    if (/^(organizer|guest|home|office|edit|email|contacts|actions|me|you)$/i.test(name)) return "";
    return name;
  }

  function isFullPersonName(raw) {
    const name = normalizePersonName(raw);
    if (!name) return "";
    const words = name.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 4) return "";
    if (!words.every((w) => /^[\p{L}][\p{L}'’.-]*$/u.test(w))) return "";
    return name;
  }

  function emailDomainExcluded(email) {
    if (typeof cliEmailDomainExcluded === "function") {
      return cliEmailDomainExcluded(email, settings);
    }
    return false;
  }

  function linkedInSearchUrl(query) {
    return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`;
  }

  function extensionAlive() {
    try {
      return Boolean(chrome.runtime?.id);
    } catch (_) {
      return false;
    }
  }

  function openInNewTab(url) {
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (_) {}
  }

  function openLookup(payload) {
    const url = payload.url || linkedInSearchUrl(payload.query);
    if (!url) return;

    if (settings.clickTarget === "sidePanel") {
      if (!extensionAlive()) {
        openInNewTab(url);
        return;
      }
      try {
        chrome.runtime.sendMessage({ type: "cli-open-linkedin-window", url }, (response) => {
          if (chrome.runtime.lastError || !response?.ok) {
            openInNewTab(url);
          }
        });
      } catch (_) {
        openInNewTab(url);
      }
      return;
    }

    openInNewTab(url);
  }

  function createLink(payload) {
    const a = document.createElement("a");
    a.className = "cli-linkedin-link";
    a.href = payload.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.title = `Search LinkedIn for “${payload.query}”`;
    a.setAttribute("aria-label", a.title);
    a.setAttribute(ATTR, "1");
    a.dataset.cliEmail = payload.email || "";
    a.dataset.cliQuery = payload.query || "";
    a.dataset.cliExt = chrome.runtime?.id || "";
    a.innerHTML = LINKEDIN_SVG;

    a.addEventListener("mousedown", (e) => e.stopPropagation(), true);
    a.addEventListener("pointerdown", (e) => e.stopPropagation(), true);
    for (const type of ["mouseover", "mouseenter", "mousemove", "mouseout", "mouseleave", "pointerover", "pointerenter"]) {
      a.addEventListener(type, (e) => e.stopPropagation(), true);
    }
    a.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        openLookup({
          name: payload.name,
          company: payload.company,
          email: payload.email,
          query: payload.query,
          url: payload.url,
        });
      },
      true
    );
    return a;
  }

  function removeIconsIn(root) {
    root?.querySelectorAll?.(`a[${ATTR}]`).forEach((a) => a.remove());
    if (root?.nextElementSibling?.matches?.(`a[${ATTR}]`)) {
      root.nextElementSibling.remove();
    }
  }

  function clearAllIcons() {
    document.querySelectorAll(`a[${ATTR}]`).forEach((a) => a.remove());
    document.querySelectorAll(`[${CHIP_ATTR}]`).forEach((el) => el.removeAttribute(CHIP_ATTR));
  }

  function appEnabled(appId) {
    if (typeof cliAppEnabled === "function") return cliAppEnabled(settings, appId);
    return Boolean(settings.enabled && settings.apps?.[appId]);
  }

  function getSettingsSnapshot() {
    return settings;
  }

  function applySettings(next) {
    settings =
      typeof cliNormalizeSettings === "function"
        ? cliNormalizeSettings(next)
        : { ...settings, ...next };
  }

  function buildQuery(name, company, email, emailInfo) {
    const person = name || emailInfo?.name || (email ? email.split("@")[0] : "");
    const org = company || emailInfo?.company || "";
    return [person, org].filter(Boolean).join(" ");
  }

  /**
   * Boot a site adapter: settings sync, mutation observer, burst rescans.
   * scanFn(root) should inject/remove icons for the current document.
   */
  function startSiteAdapter({ appId, scanFn, attributeFilter = [] }) {
    const flag = `__cliAdapter_${appId}`;
    if (globalThis[flag]) {
      globalThis[`__cliRescan_${appId}`]?.();
      return;
    }
    globalThis[flag] = true;

    let scheduled = false;
    function scheduleScan() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        if (!appEnabled(appId)) {
          clearAllIcons();
          return;
        }
        scanFn(document.body);
      });
    }

    globalThis[`__cliRescan_${appId}`] = () => {
      clearAllIcons();
      scheduleScan();
    };

    clearAllIcons();

    const getSettings =
      typeof cliGetSettings === "function" ? cliGetSettings : () => Promise.resolve(settings);

    getSettings()
      .then((s) => {
        applySettings(s);
        scheduleScan();
      })
      .catch(() => scheduleScan());

    let bursts = 0;
    const burstTimer = setInterval(() => {
      scheduleScan();
      bursts += 1;
      if (bursts >= 20) clearInterval(burstTimer);
    }, 600);

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) scheduleScan();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      const next = { ...settings };
      if (changes.enabled) next.enabled = changes.enabled.newValue;
      if (changes.clickTarget) next.clickTarget = changes.clickTarget.newValue;
      if (changes.apps) next.apps = changes.apps.newValue;
      if (changes.excludedDomains) next.excludedDomains = changes.excludedDomains.newValue;
      applySettings(next);
      if (!appEnabled(appId)) {
        clearAllIcons();
        return;
      }
      scheduleScan();
    });

    const observer = new MutationObserver(() => scheduleScan());
    function startObserver() {
      if (!document.body) return;
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: attributeFilter.length > 0,
        attributeFilter: attributeFilter.length ? attributeFilter : undefined,
      });
      scheduleScan();
    }

    if (document.body) startObserver();
    else document.addEventListener("DOMContentLoaded", startObserver);
  }

  globalThis.CLI = {
    ATTR,
    CHIP_ATTR,
    EMAIL_RE,
    EMAIL_FIND_RE,
    parseEmail,
    normalizePersonName,
    isFullPersonName,
    companyFromDomain,
    linkedInSearchUrl,
    createLink,
    openLookup,
    extensionAlive,
    removeIconsIn,
    clearAllIcons,
    appEnabled,
    emailDomainExcluded,
    getSettingsSnapshot,
    applySettings,
    buildQuery,
    startSiteAdapter,
  };
})();
