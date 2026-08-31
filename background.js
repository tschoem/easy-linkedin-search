importScripts("settings.js");

const SITE_URLS = [
  "https://calendar.google.com/*",
  "https://mail.google.com/*",
  "https://*.hubspot.com/*",
];

const SITE_INJECT = {
  calendar: {
    match: (url) => url.startsWith("https://calendar.google.com/"),
    files: ["settings.js", "shared.js", "content-calendar.js"],
  },
  gmail: {
    match: (url) => /^https:\/\/mail\.google\.com\//i.test(url),
    files: ["settings.js", "shared.js", "content-gmail.js"],
    allFrames: true,
  },
  hubspot: {
    match: (url) => /^https:\/\/app(-[a-z0-9]+)?\.hubspot\.com\//i.test(url),
    files: ["settings.js", "shared.js", "content-hubspot.js"],
  },
};

const LINKEDIN_WINDOW_KEY = "cliLinkedInWindowId";
const HOST_RESTORE_KEY = "cliHostRestore";

const SIDE_WIDTH = 440;
const SIDE_GAP = 8;
const MIN_HOST_WIDTH = 640;

function siteForUrl(url) {
  if (!url) return null;
  for (const [id, site] of Object.entries(SITE_INJECT)) {
    if (site.match(url)) return { id, ...site };
  }
  return null;
}

async function injectIntoTab(tabId, url) {
  const site = siteForUrl(url);
  if (!site) return;

  const target = site.allFrames ? { tabId, allFrames: true } : { tabId };

  try {
    await chrome.scripting.insertCSS({
      target,
      files: ["styles.css"],
    });
  } catch (_) {}

  try {
    await chrome.scripting.executeScript({
      target,
      files: site.files,
    });
  } catch (err) {
    console.debug("[CLI] inject", tabId, err);
  }
}

async function injectIntoOpenSiteTabs() {
  const tabs = await chrome.tabs.query({ url: SITE_URLS });
  await Promise.all(
    tabs.map((tab) => (tab.id && tab.url ? injectIntoTab(tab.id, tab.url) : null))
  );
}

async function initExtension() {
  try {
    const current = await chrome.storage.sync.get(null);
    await chrome.storage.sync.set(cliNormalizeSettings({ ...CLI_DEFAULTS, ...current }));
  } catch (_) {
    await chrome.storage.sync.set({
      ...CLI_DEFAULTS,
      apps: { ...CLI_DEFAULTS.apps },
    });
  }
  await injectIntoOpenSiteTabs();
}

chrome.runtime.onInstalled.addListener(() => {
  initExtension();
});

chrome.runtime.onStartup.addListener(() => {
  injectIntoOpenSiteTabs();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab.url || !siteForUrl(tab.url)) return;
  injectIntoTab(tabId, tab.url);
});

async function resolveAnchorWindow(anchorWindowId) {
  if (anchorWindowId != null) {
    try {
      return await chrome.windows.get(anchorWindowId);
    } catch (_) {}
  }

  const siteTabs = await chrome.tabs.query({
    url: SITE_URLS,
    active: true,
  });
  if (siteTabs[0]?.windowId != null) {
    try {
      return await chrome.windows.get(siteTabs[0].windowId);
    } catch (_) {}
  }

  try {
    return await chrome.windows.getLastFocused();
  } catch (_) {
    return null;
  }
}

/**
 * Shrink the host app window to free a strip on the right, then return bounds
 * for the LinkedIn popup. Original size is restored when that popup closes.
 * Coordinates are not clamped — secondary displays often use negative origins.
 */
async function layoutBesideHost(anchor) {
  const fallback = {
    left: 80,
    top: 40,
    width: SIDE_WIDTH,
    height: 900,
  };
  if (!anchor?.id) return fallback;

  const session = await chrome.storage.session.get(HOST_RESTORE_KEY);
  let restore = session[HOST_RESTORE_KEY];

  if (!restore || restore.windowId !== anchor.id) {
    restore = {
      windowId: anchor.id,
      left: anchor.left ?? 0,
      top: anchor.top ?? 0,
      width: anchor.width ?? 1200,
      height: anchor.height ?? 900,
      state: anchor.state || "normal",
    };
    await chrome.storage.session.set({ [HOST_RESTORE_KEY]: restore });
  }

  const sideTotal = SIDE_WIDTH + SIDE_GAP;
  const newHostWidth = Math.max(MIN_HOST_WIDTH, restore.width - sideTotal);
  const freed = restore.width - newHostWidth;

  if (freed >= 120) {
    try {
      await chrome.windows.update(anchor.id, {
        state: "normal",
        left: restore.left,
        top: restore.top,
        width: newHostWidth,
        height: restore.height,
      });
    } catch (err) {
      console.debug("[CLI] resize host", err);
    }

    return {
      left: restore.left + newHostWidth + SIDE_GAP,
      top: restore.top,
      width: SIDE_WIDTH,
      height: Math.max(700, restore.height - 40),
    };
  }

  return {
    left: (anchor.left || 0) + Math.max(0, (anchor.width || 1200) - SIDE_WIDTH - SIDE_GAP),
    top: (anchor.top || 0) + 24,
    width: SIDE_WIDTH,
    height: Math.max(700, (anchor.height || 900) - 40),
  };
}

async function restoreHostWindow() {
  const stored = await chrome.storage.session.get(HOST_RESTORE_KEY);
  const restore = stored[HOST_RESTORE_KEY];
  if (!restore?.windowId) return;

  try {
    if (restore.state === "maximized" || restore.state === "fullscreen") {
      await chrome.windows.update(restore.windowId, { state: restore.state });
    } else {
      await chrome.windows.update(restore.windowId, {
        state: "normal",
        left: restore.left,
        top: restore.top,
        width: restore.width,
        height: restore.height,
      });
    }
  } catch (_) {}

  await chrome.storage.session.remove(HOST_RESTORE_KEY);
}

async function openOrFocusLinkedInWindow(url, anchorWindowId) {
  let bounds = { left: 80, top: 40, width: SIDE_WIDTH, height: 900 };

  try {
    const anchor = await resolveAnchorWindow(anchorWindowId);
    bounds = await layoutBesideHost(anchor);
  } catch (err) {
    console.debug("[CLI] layout", err);
  }

  const stored = await chrome.storage.session.get(LINKEDIN_WINDOW_KEY);
  const existingId = stored[LINKEDIN_WINDOW_KEY];

  if (existingId) {
    try {
      const win = await chrome.windows.get(existingId);
      if (win?.id) {
        await chrome.windows.update(win.id, {
          focused: true,
          left: bounds.left,
          top: bounds.top,
          width: bounds.width,
          height: bounds.height,
        });
        const tabs = await chrome.tabs.query({ windowId: win.id });
        if (tabs[0]?.id) await chrome.tabs.update(tabs[0].id, { url });
        return { ok: true, mode: "reuse" };
      }
    } catch (_) {}
  }

  const win = await chrome.windows.create({
    url,
    type: "popup",
    width: bounds.width,
    height: bounds.height,
    left: bounds.left,
    top: bounds.top,
    focused: true,
  });

  if (win?.id) await chrome.storage.session.set({ [LINKEDIN_WINDOW_KEY]: win.id });
  return { ok: true, mode: "create" };
}

chrome.windows.onRemoved.addListener(async (windowId) => {
  const stored = await chrome.storage.session.get(LINKEDIN_WINDOW_KEY);
  if (stored[LINKEDIN_WINDOW_KEY] === windowId) {
    await chrome.storage.session.remove(LINKEDIN_WINDOW_KEY);
    await restoreHostWindow();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === "cli-open-linkedin-window") {
    if (!message.url) {
      sendResponse({ ok: false, error: "Missing url" });
      return false;
    }
    openOrFocusLinkedInWindow(message.url, sender.tab?.windowId)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  return false;
});
