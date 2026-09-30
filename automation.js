(() => {
  const norm = text => String(text ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
  const visible = el => !!el && !el.closest('[hidden], [aria-hidden="true"]') && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden" && el.getClientRects().length > 0;
  const find = selector => [...document.querySelectorAll(selector)].find(visible);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  let check = async () => {};
  async function waitFor(get, label, timeout = 20000) {
    const until = Date.now() + timeout;
    do {
      await check();
      const value = get();
      if (value) return value;
      await sleep(200);
    } while (Date.now() < until);
    throw new Error(`Nicht verfügbar: ${label}. Bitte auf der Seite prüfen und anschließend „Fortsetzen“ wählen.`);
  }
  async function click(el) {
    await check();
    if (!el || el.disabled || el.getAttribute("aria-disabled") === "true") throw new Error("Der benötigte Button ist deaktiviert.");
    el.scrollIntoView({ block: "center" });
    el.click();
    await sleep(200);
  }
  function nativeValue(el, value) {
    const prototype = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  async function setValue(selector, value) {
    const el = await waitFor(() => {
      const candidate = find(selector);
      return candidate && !candidate.disabled && candidate;
    }, selector);
    await check();
    if (typeof value === "boolean") {
      if (el.checked !== value) {
        // Equipment inputs can be visually clipped; clicking the associated label
        // still runs the site's real checkbox handler.
        const label = [...document.querySelectorAll("label[for]")].find(label => label.htmlFor === el.id && visible(label));
        await click(label || el);
      }
      await waitFor(() => document.querySelector(selector)?.checked === value, selector);
    } else if (el.value !== value) {
      el.focus();
      nativeValue(el, value);
      el.blur();
      await sleep(200);
      await waitFor(() => norm(find(selector)?.value) === norm(value), `Wert ${value} in ${selector}`, 4000);
    }
  }
  async function combo(selector, value, aliases = []) {
    let el = await waitFor(() => {
      const candidate = find(selector);
      return candidate && !candidate.disabled && candidate;
    }, selector);
    const current = el.matches("input") ? el.value : el.textContent;
    const choices = [value, ...aliases].map(norm);
    if (choices.includes(norm(current))) return;
    await click(el);
    if (el.matches("input")) nativeValue(el, value);
    const option = await waitFor(() => {
      el = find(selector);
      if (!el) return null;
      const listId = el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
      const list = listId ? document.getElementById(listId) : find('[role="listbox"]');
      const options = [...(list || document).querySelectorAll('[role="option"], li')].filter(visible);
      return options.find(option => choices.includes(norm(option.textContent))) || null;
    }, `Auswahl „${value}“ (${selector})`);
    await click(option);
    await waitFor(() => {
      const selected = find(selector);
      return selected && choices.includes(norm(selected.matches("input") ? selected.value : selected.textContent));
    }, `Übernahme von „${value}“`, 5000);
  }
  const miniNext = '[data-testid="steps-continue-button"]';
  function stage() {
    if (find('[data-testid="publish-button"]')) return "details";
    if (find("#psuf-vehicle-insertion-form-select-make")) return "vehicle";
    if (find(miniNext)) {
      if (document.querySelector("#image-upload")) return "images";
      if (find("#price")) return "price";
      if (find("#contactFieldPhoneNumberFull")) return "contact";
    }
    if (location.pathname.replace(/\/$/, "") === "/auto-verkaufen") return "sell";
    return null;
  }
  const byLabel = label => `[role="combobox"][aria-labelledby="${label}"]`;
  async function fields(profile, predicate) {
    for (const field of profile.fields.filter(predicate)) {
      // Mutually exclusive equipment is disabled by AutoScout24 itself.
      const el = document.querySelector(field.selector);
      if (el?.disabled && field.value === false) continue;
      if (field.combo) await combo(field.selector, field.value);
      else await setValue(field.selector, field.value);
    }
  }
  const selectorHas = (field, ...terms) => terms.some(term => field.selector.includes(`"${term}"`));
  const contactFields = field => selectorHas(field, "location", "contactFieldCountryCode", "contactFieldPhoneNumberFull", "hidePhoneNumber__false");
  const priceFields = field => selectorHas(field, "price", "priceNegotiable", "taxDeductible", "mileage", "previousOwnersLabel", "fullServiceHistory", "nonSmoking");

  async function initialVehicle(profile) {
    const prefix = "#psuf-vehicle-insertion-form-";
    const value = label => profile.fields.find(field => selectorHas(field, label))?.value;
    await combo(prefix + "select-make", profile.make);
    await combo(prefix + "select-model", profile.model);
    const [month, year] = profile.registration.split(".");
    await combo("#first-registration-year-from-input", year);
    const months = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
    await combo(prefix + "first-registration-month-from-input", months[Number(month) - 1], [month, String(Number(month))]);
    await combo(prefix + "select-body-type-and-doors", "Kleinwagen, 5 Türen", ["Kleinwagen (5 Türen)", "Kleinwagen / 5 Türen", "Kleinwagen, 4/5 Türen"]);
    await combo(prefix + "select-fuel-category", value("fuelCategory"));
    await combo(prefix + "select-transmission", value("motorSectionTransmissionLabel"));
    await combo(prefix + "select-power", "74 kW (101 PS)", ["74 kW (100 PS)", "74 kW / 101 PS", "101 PS (74 kW)", "100 PS (74 kW)"]);
    try {
      await combo(prefix + "select-model-version", value("modelVersion"), ["Fiesta 1.0 EcoBoost", "Vignale"]);
    } catch (error) {
      if (error.name === "AbortError") throw error;
      // AutoScout's catalog may not contain the saved free-text model variant.
      // The official manual-entry link carries the already selected vehicle data.
      const fallback = find('[data-testid="no-vehicle-fallback-link"]');
      if (!fallback) throw error;
      const url = new URL(fallback.href, location.href);
      url.searchParams.set("mileage", String(value("mileage")).replace(/\./g, ""));
      url.searchParams.set("version", value("modelVersion"));
      fallback.href = url.href;
      fallback.target = "_self";
      await click(fallback);
      return;
    }
    await setValue(prefix + "mileage", value("mileage"));
    await click(await waitFor(() => {
      const button = find(prefix + "go-next-button-default");
      return button && !button.disabled && button;
    }, "Weiter (Fahrzeug)"));
  }

  async function upload(profile, run, update) {
    if (run.images !== "pending") return;
    const count = () => document.querySelectorAll('button[aria-label="Bild entfernen"]').length;
    if (count() >= profile.images.length) {
      await update({ images: "uploaded" });
      return;
    }
    if (count() > 0) throw new Error("Es sind bereits einzelne Bilder vorhanden. Bitte den Upload manuell vervollständigen oder vorhandene Bilder entfernen und fortsetzen.");
    try {
      const transfer = new DataTransfer();
      for (const name of profile.images) {
        await check();
        const response = await fetch(chrome.runtime.getURL(`Bilder/${name}`));
        if (!response.ok) throw new Error(`Bild fehlt: ${name}`);
        transfer.items.add(new File([await response.blob()], name, { type: "image/jpeg" }));
      }
      const input = await waitFor(() => document.querySelector('#image-upload[type="file"]'), "Bilder-Upload");
      await check();
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await waitFor(() => count() >= profile.images.length && !find('[aria-busy="true"]'), "Abschluss aller 9 Bild-Uploads", 120000);
      await update({ images: "uploaded" });
    } catch (error) {
      if (error.name === "AbortError") throw error;
      if (count() > 0) throw new Error(`Bilder nur teilweise hochgeladen: ${error.message}`);
      const understood = [...document.querySelectorAll('button')].find(button => visible(button) && norm(button.textContent) === "Verstanden");
      if (understood) await click(understood);
      await update({ images: "skipped", message: `Bilder-Upload nicht möglich; ohne Bilder fortfahren. ${error.message}` });
    }
  }

  async function datePicker(container, value) {
    const button = container?.querySelector('button[aria-haspopup="dialog"]');
    if (!button) throw new Error(`Datumsfeld für ${value} wurde nicht gefunden.`);
    if (norm(button.textContent) === value) return;
    await click(button);
    const dialog = await waitFor(() => {
      const id = container.getAttribute("aria-describedby");
      return (id && find(`[id="${id}"]`)) || find('[role="dialog"]');
    }, `Datumsauswahl ${value}`);
    const [month, year] = value.split(".");
    // Support native selectors and semantic year/month buttons, without depending
    // on generated CSS module hashes. Unknown picker layouts stop with a clear error.
    const selects = [...dialog.querySelectorAll("select")];
    for (const select of selects) {
      const option = [...select.options].find(option => norm(option.textContent) === year);
      if (option) {
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    const control = text => [...dialog.querySelectorAll('button, [role="option"]')].find(el => visible(el) && norm(el.textContent) === text);
    const yearCombo = [...dialog.querySelectorAll('[role="combobox"]')].find(el => /jahr|year/i.test(`${el.getAttribute("aria-label")} ${el.getAttribute("aria-labelledby")}`));
    if (yearCombo) {
      const attr = yearCombo.id ? `[id="${yearCombo.id}"]` : `[role="combobox"][aria-labelledby="${yearCombo.getAttribute("aria-labelledby")}"]`;
      await combo(attr, year);
    }
    let yearButton = control(year);
    if (!yearButton && !selects.length && !yearCombo) {
      const header = [...dialog.querySelectorAll('button')].find(el => visible(el) && /^\d{4}$/.test(norm(el.textContent)));
      if (header) {
        await click(header);
        yearButton = control(year);
      }
      // Some pickers show a grid of years, others offer previous/next year.
      for (let attempts = 0; !yearButton && attempts < 30; attempts++) {
        const displayed = norm(dialog.textContent).match(/\b(?:19|20)\d{2}\b/);
        if (!displayed || Number(displayed[0]) === Number(year)) break;
        const backward = Number(displayed[0]) > Number(year);
        const navigation = [...dialog.querySelectorAll('button')].find(el => visible(el) && (
          backward ? /previous|prev|vorher|zurück/i : /next|nächst|weiter/i
        ).test(`${el.getAttribute('aria-label')} ${el.title}`));
        if (!navigation) break;
        await click(navigation);
        yearButton = control(year);
      }
    }
    if (yearButton) await click(yearButton);
    for (const select of [...dialog.querySelectorAll('select')]) {
      const option = [...select.options].find(option => [month, String(Number(month)), ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'][Number(month) - 1]].includes(norm(option.textContent)));
      if (option) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    if (norm(button.textContent) === value) return;
    const monthNames = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
    const monthButton = [...dialog.querySelectorAll('button, [role="option"]')].find(el => visible(el) && (
      el.getAttribute("aria-label")?.includes(value) ||
      [month, String(Number(month)), monthNames[Number(month) - 1], ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"][Number(month) - 1]].includes(norm(el.textContent))
    ));
    if (!monthButton) throw new Error(`Bitte Datum ${value} manuell auswählen und „Fortsetzen“ klicken (Datumsdialog nicht im Snapshot enthalten).`);
    await click(monthButton);
    const confirm = [...dialog.querySelectorAll('button')].find(el => visible(el) && /^(übernehmen|ok|bestätigen|fertig)$/i.test(norm(el.textContent)));
    if (confirm) await click(confirm);
    await waitFor(() => norm(container.querySelector('button[aria-haspopup="dialog"]')?.textContent) === value, `Datum ${value}`, 3000);
  }

  const sections = [
    ["vehicle-data", "vehicle", field => selectorHas(field, "make", "model", "modelVersion")],
    ["characteristics", "characteristics", field => selectorHas(field, "vehicleBody-label", "seats-label", "doors-label", "bodyColor__2", "metallic", "upholstery-label", "interiorColor__2", "emptyWeight")],
    ["condition", "condition", field => priceFields(field) && !selectorHas(field, "price", "priceNegotiable", "taxDeductible") || selectorHas(field, "vehicleOfferType-label", "damaged__false", "accident__false", "roadworthy__true")],
    ["equipment", "equipment", field => field.equipment || selectorHas(field, "alloyWheelSize")],
    ["motor", "motor", field => selectorHas(field, "motorSectionDriveTypeLabel", "motorSectionTransmissionLabel", "powerKw", "powerPS", "motorgearLabel", "motorcylinderLabel", "cylinderCapacity")],
    ["fuel", "fuel", field => selectorHas(field, "fuelCategory", "environmentalProtocol-nedc", "primaryFuelType", "fuelConsumptionCombined", "co2", "efficiencyClass", "pollutionClass", "emissionSticker__4")],
    ["photos", "image", () => false],
    ["description", "description", () => false],
    ["financing-offer", "financingOffer", field => selectorHas(field, "price", "priceNegotiable", "taxDeductible")],
    ["contact", null, contactFields]
  ];
  async function description(profile) {
    const editor = await waitFor(() => find('#description[contenteditable="true"]'), "Beschreibung");
    await check();
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    if (!document.execCommand("insertHTML", false, profile.descriptionHTML)) {
      throw new Error("Die Beschreibung konnte nicht in den Texteditor übernommen werden.");
    }
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" }));
    editor.blur();
    const expected = new DOMParser().parseFromString(profile.descriptionHTML, "text/html").body.textContent;
    await waitFor(() => norm(editor.textContent) === norm(expected), "Vollständige Beschreibung", 4000);
  }

  async function details(profile, run, update) {
    for (const [section, nextId, predicate] of sections) {
      if (run.completed.includes(section)) continue;
      await update({ step: 5, message: `Details: ${section}` });
      await click(await waitFor(() => find(`[data-testid="sidebar-item-${section}"]`), `Abschnitt ${section}`));
      await fields(profile, predicate);
      if (section === "condition") {
        await datePicker(await waitFor(() => find('[data-testid="registrationDate-datePicker"]'), "Erstzulassung"), profile.registration);
        const pickers = [...document.querySelectorAll('[class*="DatePicker_datepicker-input__"]')].filter(visible);
        await datePicker(pickers[1], profile.inspection);
      }
      if (section === "photos") await upload(profile, run, update);
      if (section === "description") await description(profile);
      if (nextId) {
        await click(await waitFor(() => {
          const button = find(`[data-testid="${nextId}-continue-button"]`);
          return button && !button.disabled && button;
        }, `Weiter (${section})`));
        await sleep(500);
        const invalid = [...document.querySelectorAll('[aria-invalid="true"]')].find(visible);
        if (invalid) throw new Error(`Validierungsfehler im Abschnitt ${section}: ${invalid.getAttribute("aria-labelledby") || invalid.id}`);
      }
      run.completed = [...run.completed, section];
      await update({ completed: run.completed });
    }
    const publish = await waitFor(() => {
      const button = find('[data-testid="publish-button"]');
      return button && !button.disabled && button;
    }, "Veröffentlichen");
    // Record before the real click so a navigation/reload never publishes twice.
    await update({ publishClicked: true, message: "Veröffentlichen wird angeklickt …" });
    await click(publish);
    await sleep(2500);
    const invalid = [...document.querySelectorAll('[aria-invalid="true"], [role="alert"]')].find(el => visible(el) && (el.getAttribute("aria-invalid") === "true" || norm(el.textContent)));
    if (invalid) throw new Error(`Veröffentlichung prüfen: ${invalid.getAttribute("aria-label") || invalid.textContent || invalid.id}`);
    const success = [...document.querySelectorAll('h1, h2, [role="status"]')].find(el => visible(el) && /(?:Inserat|Anzeige).*(?:erfolgreich|veröffentlicht|online)/i.test(el.textContent));
    await update({ status: success ? "done" : "submitted", message: success ? "AutoScout24 bestätigt die Veröffentlichung." : "„Veröffentlichen“ wurde angeklickt. Bitte das Ergebnis auf AutoScout24 prüfen." });
  }
  globalThis.FiestaAutomation = {
    norm, visible, find, waitFor, click, setValue, combo, stage, fields,
    initialVehicle, upload, details, contactFields, priceFields, datePicker,
    setCheck: callback => { check = callback; }
  };
})();
