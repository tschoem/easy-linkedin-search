(() => {
  "use strict";

  if (!/^app(-[a-z0-9]+)?\.hubspot\.com$/i.test(location.hostname)) return;

  const {
    ATTR,
    CHIP_ATTR,
    EMAIL_RE,
    EMAIL_FIND_RE,
    parseEmail,
    normalizePersonName,
    linkedInSearchUrl,
    createLink,
    extensionAlive,
    removeIconsIn,
    appEnabled,
    startSiteAdapter,
    emailDomainExcluded,
  } = globalThis.CLI;

  const CARD_ATTR = "data-cli-hubspot-card";
  const META_RE =
    /^(email|phone|mobile|last contacted|contacts|actions|filters|sort|note|call|task|meetings?|more|view all|primary point|contact with primary)/i;
  const JOB_TITLE_RE =
    /\b(senior|junior|staff|principal|chief|director|manager|officer|lead|head|vice|president|engineer|engineering|designer|developer|analyst|specialist|coordinator|consultant|partner|founder|intern|associate|executive|account|sales|marketing|finance|operations|product|technical|technology|officer|cto|ceo|cfo|cmo|vp)\b/i;
  const STATUS_RE =
    /^(ex[- ]?employees?|former(\s+employees?)?|employees?|contractors?|vendors?|customers?|champions?|subscribers?|unqualified|marketing contact|sales contact)$/i;
  const CONTACT_HREF_RE = /\/(contact|contacts|record\/0-1)\b/i;

  function compact(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function emailFromMailto(href) {
    if (!href) return "";
    try {
      const raw = decodeURIComponent(String(href).replace(/^mailto:/i, "").split("?")[0]).trim();
      return EMAIL_RE.test(raw.toLowerCase()) ? raw.toLowerCase() : "";
    } catch (_) {
      return "";
    }
  }

  function emailFromText(text) {
    const m = String(text || "").match(EMAIL_FIND_RE);
    if (!m) return "";
    const email = m[0].toLowerCase();
    return EMAIL_RE.test(email) ? email : "";
  }

  function isJobTitle(text) {
    const t = compact(text);
    if (!t) return false;
    if (/\bat\b/i.test(t)) return true;
    return JOB_TITLE_RE.test(t);
  }

  function personName(raw) {
    const name = normalizePersonName(raw);
    if (!name || name.includes("@")) return "";
    const words = name.split(/\s+/);
    if (words.length < 2 || words.length > 4) return "";
    if (META_RE.test(name) || isJobTitle(name) || isStatusLabel(name)) return "";
    return name;
  }

  function isStatusLabel(text) {
    return STATUS_RE.test(compact(text));
  }

  function companyFromAtLine(line) {
    const m = String(line || "").match(/\bat\s+(.+)$/i);
    if (!m) return "";
    const company = compact(m[1].replace(/\s*[|•·].*$/, ""));
    if (!company || company.length < 2 || company.length > 60) return "";
    if (company.includes("@") || META_RE.test(company) || isJobTitle(company) || isStatusLabel(company)) {
      return "";
    }
    return company;
  }

  function matchesDomainBrand(text, brand) {
    if (!text || !brand) return false;
    return text.replace(/[\s._-]+/g, "").toLowerCase() === String(brand).replace(/[\s._-]+/g, "").toLowerCase();
  }

  function looksLikeCompanyOnly(line, brand) {
    const t = compact(line);
    if (!t || t.length > 50 || t.includes("@") || /\bat\b/i.test(t)) return "";
    if (META_RE.test(t) || isJobTitle(t) || isStatusLabel(t)) return "";
    if (!/^[A-Za-z0-9]/.test(t)) return "";
    if (t.split(/\s+/).length > 4) return "";
    if (personName(t) && !matchesDomainBrand(t, brand)) return "";
    return t;
  }

  function parseCardFields(card, emailHint) {
    const info = emailHint ? parseEmail(emailHint) : null;
    const brand = info?.company || "";
    const lines = String(card?.innerText || "")
      .split(/\n/)
      .map((l) => compact(l))
      .filter(Boolean);

    let name = "";
    let company = "";
    let email = emailHint || "";
    const nameCandidates = [];

    for (const line of lines) {
      if (META_RE.test(line) && !/^email\s*:/i.test(line)) continue;

      const em = emailFromText(line.replace(/^email\s*:\s*/i, ""));
      if (em) {
        if (!email) email = em;
        continue;
      }

      const fromAt = companyFromAtLine(line);
      if (fromAt) {
        if (!company) company = fromAt;
        continue;
      }

      const maybeName = personName(line);
      if (maybeName) {
        nameCandidates.push(maybeName);
        continue;
      }

      const onlyCompany = looksLikeCompanyOnly(line, brand);
      if (onlyCompany && !company) company = onlyCompany;
    }

    name =
      nameCandidates.find((n) => !matchesDomainBrand(n, brand) && n.toLowerCase() !== company.toLowerCase()) ||
      "";

    if (isStatusLabel(company) || META_RE.test(company)) company = "";
    if (!company && brand) company = brand;
    return { name, company, email, lines };
  }

  function collectEmailNodes(root) {
    const found = [];
    const seenEl = new WeakSet();

    const push = (email, el) => {
      if (!email || !el || seenEl.has(el)) return;
      seenEl.add(el);
      found.push({ email, el });
    };

    root.querySelectorAll?.('a[href^="mailto:"]').forEach((a) => {
      push(emailFromMailto(a.getAttribute("href")), a);
    });

    root.querySelectorAll?.("a, span, div, p, td, li, button, label").forEach((el) => {
      if (el.closest?.(`a[${ATTR}]`)) return;
      if ((el.children?.length || 0) > 6) return;
      const text = compact(el.innerText || el.textContent || "");
      if (!text || text.length > 120 || !text.includes("@")) return;
      push(emailFromText(text.replace(/^email\s*:\s*/i, "")), el);
    });

    return found;
  }

  function scoreCard(el, email) {
    if (!el) return -1;
    const text = el.innerText || "";
    if (text.length < 8 || text.length > 1400) return -1;
    if (!text.toLowerCase().includes(email)) return -1;

    const head = compact(text).slice(0, 30);
    if (/^contacts\b/i.test(head) && /actions/i.test(text)) return -1;

    const fields = parseCardFields(el, email);
    if (!fields.name) return -1;

    let score = 8;
    if (fields.company) score += 2;
    if (/email\s*:/i.test(text)) score += 2;
    if (/last contacted/i.test(text)) score += 1;
    // Prefer the tightest card that still includes the real name.
    score += Math.max(0, 10 - Math.floor(text.length / 80));
    return score;
  }

  function findCardRoot(emailEl, email) {
    let best = null;
    let bestScore = 0;
    let node = emailEl;

    for (let i = 0; i < 18 && node && node !== document.body; i++) {
      const score = scoreCard(node, email);
      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
      node = node.parentElement;
    }

    return bestScore >= 8 ? best : null;
  }

  function isContactHref(href) {
    return CONTACT_HREF_RE.test(String(href || ""));
  }

  function findNameElement(card, name) {
    if (!card || !name) return null;
    const target = name.toLowerCase();

    const usable = (el) => {
      if (!el || el.matches?.(`a[${ATTR}]`) || el.closest?.(`a[${ATTR}]`)) return false;
      const t = compact(el.innerText || "");
      if (t.toLowerCase() !== target) return false;
      if (t.includes("@") || /\bat\b/i.test(t) || isJobTitle(t)) return false;
      return true;
    };

    const links = [...(card.querySelectorAll?.("a[href]") || [])];
    const contactLink = links.find((a) => isContactHref(a.getAttribute("href")) && usable(a));
    if (contactLink) return contactLink;

    let best = null;
    for (const el of card.querySelectorAll("a, span, div, p, h1, h2, h3, h4, strong, button, label")) {
      if (!usable(el)) continue;
      if (!best || best.contains(el)) best = el;
    }
    return best;
  }

  function lastTextNode(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!compact(node.textContent)) return NodeFilter.FILTER_REJECT;
        if (node.parentElement?.closest?.(`a[${ATTR}]`)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let last = null;
    let node;
    while ((node = walker.nextNode())) last = node;
    return last;
  }

  function placeBesideName(card, name, link) {
    const el = findNameElement(card, name);
    if (!el) return false;

    // Keep name + icon on one row even when HubSpot uses flex-column / block names.
    el.classList.add("cli-linkedin-name-host");
    const text = lastTextNode(el);
    const parent = text?.parentElement || el;
    parent.classList.add("cli-linkedin-name-host");

    if (text) {
      parent.insertBefore(link, text.nextSibling);
    } else {
      el.appendChild(link);
    }
    return true;
  }

  function ensureIcon(card, email) {
    if (!appEnabled("hubspot") || !card || !email) return;
    if (!extensionAlive()) return;
    if (emailDomainExcluded(email)) {
      removeIconsIn(card);
      return;
    }

    const info = parseEmail(email);
    if (!info) return;

    const fields = parseCardFields(card, email);
    if (!fields.name) return;

    const company = fields.company || info.company || "";
    const query = [fields.name, company].filter(Boolean).join(" ").trim();
    if (!query) return;

    const existing = [...card.querySelectorAll(`a[${ATTR}]`)].find(
      (a) => a.dataset.cliEmail === email
    );
    const extId = chrome.runtime.id;
    if (
      existing &&
      existing.dataset.cliExt === extId &&
      existing.dataset.cliQuery === query &&
      existing.isConnected &&
      findNameElement(card, fields.name)?.contains(existing)
    ) {
      card.setAttribute(CARD_ATTR, email);
      card.setAttribute(CHIP_ATTR, email);
      return;
    }

    removeIconsIn(card);

    const payload = {
      name: fields.name,
      company,
      email,
      query,
      url: linkedInSearchUrl(query),
    };

    const link = createLink(payload);
    link.classList.add("cli-linkedin-link--hubspot");
    try {
      if (placeBesideName(card, fields.name, link)) {
        card.setAttribute(CARD_ATTR, email);
        card.setAttribute(CHIP_ATTR, email);
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
    if (!appEnabled("hubspot")) {
      document.querySelectorAll(`a[${ATTR}]`).forEach((a) => a.remove());
      return;
    }

    const byEmail = new Map();

    for (const { email, el } of collectEmailNodes(root)) {
      const card = findCardRoot(el, email);
      if (!card) continue;
      const score = scoreCard(card, email);
      const prev = byEmail.get(email);
      if (!prev || score > prev.score) {
        byEmail.set(email, { card, score });
      }
    }

    for (const [email, { card, score }] of byEmail.entries()) {
      if (score < 8) continue;
      ensureIcon(card, email);
    }

    root.querySelectorAll?.(`a[${ATTR}]`).forEach((a) => {
      const host = a.closest(`[${CARD_ATTR}]`) || a.parentElement;
      const email = a.dataset.cliEmail || "";
      const query = a.dataset.cliQuery || "";
      const name = query.split(" ").slice(0, 2).join(" ");
      if (!host) {
        a.remove();
        return;
      }
      const text = (host.innerText || "").toLowerCase();
      const stillValid =
        (email && text.includes(email)) || (name && text.includes(name.toLowerCase()));
      if (!stillValid) a.remove();
    });
  }

  startSiteAdapter({
    appId: "hubspot",
    scanFn: scan,
    attributeFilter: ["href", "aria-label"],
  });
})();
