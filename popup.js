(() => {
  const features = document.getElementById("features");
  const appsFieldset = document.getElementById("apps");
  const filters = document.getElementById("filters");
  const enabled = document.getElementById("enabled");
  const status = document.getElementById("status");
  const excludedDomains = document.getElementById("excludedDomains");
  const radios = [...document.querySelectorAll('input[name="clickTarget"]')];
  const appInputs = [...document.querySelectorAll("input[data-app]")];

  function readForm() {
    const selected = radios.find((r) => r.checked);
    const apps = {};
    for (const input of appInputs) {
      apps[input.dataset.app] = input.checked;
    }
    return {
      enabled: enabled.checked,
      clickTarget: selected?.value === "newTab" ? "newTab" : "sidePanel",
      apps,
      excludedDomains: cliNormalizeExcludedDomains(excludedDomains.value),
    };
  }

  function writeForm(settings) {
    enabled.checked = Boolean(settings.enabled);
    const target = settings.clickTarget === "newTab" ? "newTab" : "sidePanel";
    for (const radio of radios) radio.checked = radio.value === target;
    for (const input of appInputs) {
      input.checked = Boolean(settings.apps?.[input.dataset.app]);
    }
    if (document.activeElement !== excludedDomains) {
      excludedDomains.value = (settings.excludedDomains || []).join("\n");
    }
    features.disabled = !settings.enabled;
    appsFieldset.disabled = !settings.enabled;
    filters.disabled = !settings.enabled;
  }

  function flash(message) {
    status.textContent = message;
    clearTimeout(flash._t);
    flash._t = setTimeout(() => {
      status.textContent = "";
    }, 2200);
  }

  async function persist() {
    const settings = await cliSaveSettings(readForm());
    writeForm(settings);
    flash("Saved");
  }

  function debouncePersist() {
    clearTimeout(debouncePersist._t);
    debouncePersist._t = setTimeout(persist, 450);
  }

  cliGetSettings().then((settings) => {
    writeForm(settings);
    enabled.addEventListener("change", persist);
    for (const radio of radios) radio.addEventListener("change", persist);
    for (const input of appInputs) input.addEventListener("change", persist);
    excludedDomains.addEventListener("input", debouncePersist);
    excludedDomains.addEventListener("blur", persist);
  });
})();
