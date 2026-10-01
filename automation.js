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
      const value = await get();
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
  async function combo(selector, value, aliases = [], settings = {}) {
    let el = await waitFor(() => {
      const candidate = find(selector);
      return candidate && !candidate.disabled && candidate;
    }, selector);
    const current = el.matches("input") ? el.value : el.textContent;
    const choices = [value, ...aliases].map(norm);
    const matches = text => choices.includes(norm(text));
    const ready = () => !settings.ready || settings.ready();
    const loading = input => {
      const wrapper = input?.closest('[data-autosuggest], .scr-autosuggest') || input?.closest('.input-wrapper');
      return !!wrapper && [...wrapper.querySelectorAll('.loader, [aria-busy="true"]')].some(visible);
    };
    // A typed label can look selected while the site's catalog value is still
    // empty. In the dependent vehicle form the next enabled field is evidence
    // that AutoScout24 actually accepted the selection.
    if (matches(current) && ready() && !loading(el)) return;
    const optionsFor = input => {
      const ids = `${input.getAttribute("aria-controls") || ""} ${input.getAttribute("aria-owns") || ""}`.trim().split(/\s+/);
      const lists = ids.map(id => document.getElementById(id)).filter(list => visible(list));
      if (!lists.length && !ids.some(Boolean)) lists.push(...document.querySelectorAll('[role="listbox"]'));
      return lists.filter(visible).flatMap(list => [...list.querySelectorAll('[role="option"], li, button, [data-value]')]).filter(option => visible(option) && !option.disabled && option.getAttribute("aria-disabled") !== "true");
    };
    // Start with the existing catalog options instead of filtering with a
    // compound display label such as "Kleinwagen, 5 Türen". The site's search
    // can use only the body name even though its display label includes doors.
    const open = async () => {
      await check();
      el = find(selector);
      if (!el) return;
      if (el.matches("input")) {
        // The live component resets cancelFetchSuggestions only on focus.
        // focus() on an already focused input does not emit a new focus event.
        if (document.activeElement === el) el.blur();
        el.focus();
        // AutoScout's searchable input opens on focus; its icon toggles the
        // dropdown. Do not accidentally toggle a newly opened list closed.
        if (!el.closest('[data-autosuggest]')) await click(el);
      } else if (el.getAttribute("aria-expanded") !== "true") await click(el);
    };
    await open();
    let searched = false;
    let offered = [];
    const searchAt = Date.now() + 600;
    let reopenAt = Date.now() + 1500;
    let loadingSince = 0;
    let loadingRecoveries = 0;
    let option;
    try {
      option = await waitFor(async () => {
        el = find(selector);
        if (!el) return null;
        // Selection can be automatically accepted while catalog data loads.
        if (matches(el.matches("input") ? el.value : el.textContent) && ready() && !loading(el) && settings.ready) return { confirmed: true };
        const options = optionsFor(el);
        offered = options.map(option => norm(option.textContent));
        const match = options.find(option => matches(option.textContent) || matches(option.getAttribute("aria-label")));
        if (match) return match;
        if (loading(el)) {
          if (!loadingSince) loadingSince = Date.now();
          // A canceled local suggestion promise leaves the loader running.
          // Re-focus at most twice to reset that state; real catalog loading
          // otherwise gets the full timeout without repeatedly changing text.
          if (el.getAttribute("aria-expanded") !== "true" && Date.now() - loadingSince >= 5000 && loadingRecoveries < 2) {
            loadingRecoveries++;
            loadingSince = Date.now();
            await open();
          }
          return null;
        }
        loadingSince = 0;
        if (el.getAttribute("aria-expanded") === "false" && Date.now() >= reopenAt) {
          reopenAt = Date.now() + 1500;
          await open();
          return null;
        }
        if (!searched && el.matches("input") && Date.now() >= searchAt) {
          searched = true;
          const search = settings.searchText || value;
          // React ignores an input event when the value is unchanged. Clear
          // first in that case, then let the component render before retyping.
          if (el.value === search) {
            nativeValue(el, "");
            await sleep(100);
            await check();
            el = find(selector);
          }
          if (el) nativeValue(el, search);
        }
        return null;
      }, `Vorschlag für „${value}“ (${selector})`, settings.timeout || 20000);
    } catch (error) {
      if (error.name === "AbortError") throw error;
      const current = find(selector);
      const typed = current?.matches("input") ? norm(current.value) : norm(current?.textContent);
      if (loading(current)) throw new Error(`AutoScout24 lädt weiterhin die Vorschläge für „${value}“ (${selector}). Sichtbarer Feldtext: „${typed}“. Die Auswahl konnte noch nicht geprüft werden. Bitte warten, bis der Ladeindikator verschwindet, und anschließend „Fortsetzen“ wählen.`);
      throw new Error(`„${value}“ wurde noch nicht als Auswahl bestätigt (${selector}). Sichtbarer Feldtext: „${typed}“. ${offered.length ? `Angebotene Vorschläge: ${offered.slice(0, 8).join("; ")}.` : "Kein passender Dropdown-Vorschlag sichtbar."} Bitte den passenden Vorschlag auswählen und anschließend „Fortsetzen“ wählen.`);
    }
    if (option.confirmed) return;
    // Some catalog options select on mousedown, not click. Dispatch the mouse
    // sequence before click, while keeping focus in the combobox.
    await check();
    option.scrollIntoView({ block: "center" });
    if (!el.closest('[data-autosuggest]')) option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    if (option.isConnected) {
      option.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
      await click(option);
    }
    await waitFor(() => {
      const selected = find(selector);
      return selected && matches(selected.matches("input") ? selected.value : selected.textContent) && ready();
    }, `Bestätigung von „${value}“ durch AutoScout24${settings.ready ? " (Folgefeld muss freigeschaltet sein)" : ""}`, settings.timeout || 5000);
  }
  const miniNext = '[data-testid="steps-continue-button"]';
  const marketplaceLink = () => find("#market-place-link") || [...document.querySelectorAll("a, button")].find(el => visible(el) && norm(el.textContent) === "Inserat erstellen");
  const freeContinueButton = () => find('[data-testid="productSelection-continueFree"]') || [...document.querySelectorAll("a, button")].find(el => visible(el) && norm(el.textContent) === "Kostenlos weiter");
  const publicationSuccess = () => [...document.querySelectorAll('h1, h2, [role="status"]')].find(el => visible(el) && /(?:Inserat|Anzeige).*(?:erfolgreich|veröffentlicht|online)/i.test(el.textContent));
  function stage() {
    if (freeContinueButton()) return "packages";
    if (find('[data-testid="publish-button"]')) return "details";
    if (find("#psuf-vehicle-insertion-form-select-make")) return "vehicle";
    if (find(miniNext)) {
      if (document.querySelector("#image-upload")) return "images";
      if (find("#price")) return "price";
      if (find("#contactFieldPhoneNumberFull")) return "contact";
    }
    if (marketplaceLink()) return "marketplace";
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
    const nextEnabled = selector => () => {
      const next = find(selector);
      return next && !next.disabled && next.getAttribute("aria-disabled") !== "true";
    };
    await combo(prefix + "select-make", profile.make, [], { ready: nextEnabled(prefix + "select-model") });
    await combo(prefix + "select-model", profile.model, [], { ready: nextEnabled("#first-registration-year-from-input") });
    const [month, year] = profile.registration.split(".");
    await combo("#first-registration-year-from-input", year, [], { ready: nextEnabled(prefix + "first-registration-month-from-input") });
    const months = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
    await combo(prefix + "first-registration-month-from-input", months[Number(month) - 1], [month, String(Number(month))], { ready: nextEnabled(prefix + "select-body-type-and-doors") });
    await combo(prefix + "select-body-type-and-doors", "Kleinwagen, 5 Türen", ["Kleinwagen 5 Türen", "Kleinwagen (5 Türen)", "Kleinwagen / 5 Türen", "Kleinwagen, 4/5 Türen"], { searchText: "Kleinwagen", ready: nextEnabled(prefix + "select-fuel-category") });
    await combo(prefix + "select-fuel-category", value("fuelCategory"), [], { ready: nextEnabled(prefix + "select-transmission") });
    await combo(prefix + "select-transmission", value("motorSectionTransmissionLabel"), [], { ready: nextEnabled(prefix + "select-power") });
    await combo(prefix + "select-power", "74 kW (101 PS)", ["74 kW (100 PS)", "74 kW / 101 PS", "101 PS (74 kW)", "100 PS (74 kW)"], { ready: nextEnabled(prefix + "select-model-version") });
    try {
      // The saved free-text title is only the prefix of several catalog trims.
      // Match the complete Vignale entry from the live catalog, never the first
      // prefix match or the currently highlighted (aria-selected) suggestion.
      await combo(prefix + "select-model-version", value("modelVersion"), ["Fiesta 1.0 EcoBoost S&S Aut. VIGNALE (2017 - 2020)"], { ready: nextEnabled(prefix + "mileage") });
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

  const imageCards = () => [...new Set([...document.querySelectorAll('button[aria-label="Bild entfernen"]')].map(button => button.closest('[class*="SortableImage_imageContainer"]') || button.parentElement))];
  const imageLoading = card => !!card.querySelector('[class*="SortableImage_loadingWrapper"], [class*="SortableImage_imageLoading"], .sr-spinner-wrapper, .sr-spinner, [aria-busy="true"]') || [...card.querySelectorAll("p")].some(el => /^(lädt|wird hochgeladen|uploading|loading)(?:\s|[.…]|$)/i.test(norm(el.textContent)));
  async function waitForImageUploads(profile, update, timeout = 120000) {
    let stableSince = 0;
    let lastMessage = "";
    await waitFor(async () => {
      const cards = imageCards();
      const finished = cards.filter(card => !imageLoading(card)).length;
      const text = `Fahrzeugbilder: ${finished}/${profile.images.length} fertig hochgeladen …`;
      if (text !== lastMessage) { lastMessage = text; await update({ message: text }); }
      if (cards.length < profile.images.length || cards.some(imageLoading)) { stableSince = 0; return false; }
      if (!stableSince) stableSince = Date.now();
      // Require a quiet period as cards can briefly exist before their spinner.
      return Date.now() - stableSince >= 600;
    }, `Alle ${profile.images.length} Bilder fertig hochgeladen (ohne „Lädt“, Lade-Overlay oder Spinner)`, timeout);
  }
  async function upload(profile, run, update) {
    if (run.images === "skipped") return;
    const count = () => imageCards().length;
    if (run.images === "uploaded" || count() >= profile.images.length || imageCards().some(imageLoading)) {
      // Existing preview cards, including a previously checkpointed upload,
      // still need completion checks. Never submit the same files again.
      await waitForImageUploads(profile, update);
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
      await waitForImageUploads(profile, update);
      await update({ images: "uploaded" });
    } catch (error) {
      if (error.name === "AbortError") throw error;
      if (count() > 0) throw new Error(`Bilder-Upload noch nicht vollständig abgeschlossen: ${error.message}`);
      const understood = [...document.querySelectorAll('button')].find(button => visible(button) && norm(button.textContent) === "Verstanden");
      if (understood) await click(understood);
      await update({ images: "skipped", message: `Bilder-Upload nicht möglich; ohne Bilder fortfahren. ${error.message}` });
    }
  }

  async function finishFree(run, update) {
    if (run.freeContinueClicked) return;
    const button = await waitFor(() => {
      const el = freeContinueButton();
      return el && !el.disabled && el.getAttribute("aria-disabled") !== "true" && el;
    }, "Kostenlos weiter (Abschluss der Paket-Auswahl)", 30000);
    await update({ step: 6, freeContinueClicked: true, message: "Kostenlos weiter wird angeklickt …" });
    if (button instanceof HTMLAnchorElement) button.target = "_self";
    await click(button);
    const success = publicationSuccess();
    await update({ status: success ? "done" : "submitted", step: 6,
      message: success ? "Kostenloser Abschluss erledigt; AutoScout24 bestätigt die Veröffentlichung." : "„Kostenlos weiter“ wurde angeklickt. Bitte das Inserat unter „Meine Inserate“ prüfen." });
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
  const sectionNames = {
    "vehicle-data": "Fahrzeugdaten", characteristics: "Merkmale", condition: "Zustand",
    equipment: "Ausstattung", motor: "Antrieb", fuel: "Umwelt", photos: "Bilder",
    description: "Beschreibung", "financing-offer": "Preis", contact: "Kontakt"
  };
  const stackedDetails = () => !!find("#modelVersion") && !!find(byLabel("vehicleBody-label"));
  function validateSection(profile, predicate, name) {
    for (const field of profile.fields.filter(predicate)) {
      const control = find(field.selector);
      if (!control || !(control.getAttribute("aria-invalid") === "true" || control.closest('[aria-invalid="true"]'))) continue;
      const label = control.getAttribute("aria-label") || (control.getAttribute("aria-labelledby") || "").split(/\s+/).map(id => document.getElementById(id)?.textContent || "").join(" ") || control.labels?.[0]?.textContent || control.id;
      throw new Error(`AutoScout24 meldet einen ungültigen Wert im Abschnitt „${name}“: ${norm(label)}. Bitte dieses Feld auf der Seite prüfen und anschließend „Fortsetzen“ wählen.`);
    }
  }
  const descriptionEditor = () => find('#description[contenteditable="true"]');
  const descriptionText = html => new DOMParser().parseFromString(html, "text/html").body.textContent;
  const descriptionComparable = text => String(text || "").normalize("NFKC").replace(/\s+/g, "");
  function descriptionMarkup(root) {
    const walk = node => {
      if (node.nodeType === Node.TEXT_NODE) return descriptionComparable(node.textContent);
      if (node.nodeType !== Node.ELEMENT_NODE) return "";
      const tag = ({ B: "STRONG", I: "EM" })[node.tagName] || node.tagName;
      if (node.matches('br.ProseMirror-trailingBreak')) return "";
      const content = [...node.childNodes].map(walk).join("");
      // Empty spacing paragraphs and editor-generated attributes can differ
      // after ProseMirror parses a paste. Content-bearing formatting must match.
      if (["P", "DIV"].includes(tag) && !descriptionComparable(node.textContent)) return "";
      if (!["P", "UL", "OL", "LI", "STRONG", "EM", "H1", "H2", "H3", "HR", "BR"].includes(tag)) return content;
      return `<${tag}>${content}</${tag}>`;
    };
    return [...root.childNodes].map(walk).join("");
  }
  const descriptionMatches = profile => {
    const editor = descriptionEditor();
    const expected = new DOMParser().parseFromString(profile.descriptionHTML, "text/html").body;
    return !!editor && descriptionComparable(editor.textContent) === descriptionComparable(expected.textContent) && descriptionMarkup(editor) === descriptionMarkup(expected);
  };
  function selectEditorContents(editor) {
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }
  async function description(profile) {
    if (typeof profile.descriptionHTML !== "string" || !descriptionComparable(descriptionText(profile.descriptionHTML))) throw new Error("Die Beschreibungsvorlage ist leer. Bitte den vollständigen Text ergänzen.");
    let editor = await waitFor(descriptionEditor, "AutoScout24-Beschreibungseditor");
    await check();
    if (descriptionMatches(profile)) return;
    selectEditorContents(editor);
    // ProseMirror/Tiptap handles paste by dispatching an editor transaction.
    // A synthetic input event alone does not update the editor/form state.
    if (typeof DataTransfer === "function" && typeof ClipboardEvent === "function") {
      const clipboard = new DataTransfer();
      clipboard.setData("text/html", profile.descriptionHTML);
      clipboard.setData("text/plain", descriptionText(profile.descriptionHTML));
      editor.dispatchEvent(new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true }));
      await sleep(300);
    }
    if (!descriptionMatches(profile)) {
      await check();
      editor = await waitFor(descriptionEditor, "AutoScout24-Beschreibungseditor nach Neurendern");
      selectEditorContents(editor);
      if (typeof document.execCommand !== "function" || !document.execCommand("insertHTML", false, profile.descriptionHTML)) {
        throw new Error("Der AutoScout24-Editor hat die Beschreibung nicht übernommen. Bitte den vollständigen Text im Abschnitt „Beschreibung“ einfügen und anschließend „Fortsetzen“ wählen.");
      }
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" }));
    }
    descriptionEditor()?.blur();
    // Never verify a captured node: React can replace it with an empty editor.
    await waitFor(() => descriptionMatches(profile), "Vollständige Beschreibung im aktuellen AutoScout24-Editor", 4000);
    await sleep(300);
    await check();
    if (!descriptionMatches(profile)) throw new Error("Die Beschreibung wurde beim Neurendern des AutoScout24-Editors wieder entfernt. Bitte den Text auf der Seite prüfen und fortsetzen.");
  }
  async function verifyDescriptionBeforePublish(profile, update) {
    const sidebar = '[data-testid="sidebar-item-description"]';
    await update({ message: "Beschreibung vor Veröffentlichung vollständig prüfen …" });
    await click(await waitFor(() => find(sidebar), "Abschnitt „Beschreibung“"));
    await description(profile);
    // Changing sections flushes form/editor updates and exposes values that
    // looked correct only in the old DOM. Always check, even with a checkpoint.
    await click(await waitFor(() => find('[data-testid="sidebar-item-contact"]'), "Abschnitt „Kontakt“ für Speicherprüfung"));
    await sleep(300);
    await click(await waitFor(() => find(sidebar), "Abschnitt „Beschreibung“ für Speicherprüfung"));
    await waitFor(descriptionEditor, "Gespeicherte Beschreibung");
    if (!descriptionMatches(profile)) {
      throw new Error("AutoScout24 hat die Beschreibung beim Abschnittswechsel nicht gespeichert. Bitte den vollständigen Text im Abschnitt „Beschreibung“ einfügen und anschließend „Fortsetzen“ wählen. Es wurde noch nicht veröffentlicht.");
    }
    await update({ message: "Vollständige Beschreibung einschließlich bekannter Mängel übernommen und geprüft." });
  }

  async function details(profile, run, update) {
    for (const [section, nextId, predicate] of sections) {
      if (run.completed.includes(section)) continue;
      const name = sectionNames[section];
      await update({ step: 5, message: `Details: ${name} prüfen und ergänzen …` });
      await click(await waitFor(() => find(`[data-testid="sidebar-item-${section}"]`), `Abschnitt „${name}“`));
      await fields(profile, predicate);
      if (section === "condition") {
        await datePicker(await waitFor(() => find('[data-testid="registrationDate-datePicker"]'), "Erstzulassung"), profile.registration);
        const pickers = [...document.querySelectorAll('[class*="DatePicker_datepicker-input__"]')].filter(visible);
        await datePicker(pickers[1], profile.inspection);
      }
      if (section === "photos") await upload(profile, run, update);
      if (section === "description") await description(profile);
      validateSection(profile, predicate, name);
      if (nextId) {
        const nextSelector = `[data-testid="${nextId}-continue-button"]`;
        const next = find(nextSelector);
        // The desktop all-sections layout saves edits through the form handlers
        // and omits/hides section continue buttons. Sidebar navigation suffices.
        // A visible disabled button is still required and must not be skipped.
        if (next || !stackedDetails()) {
          if (!next && !document.querySelector(nextSelector)) {
            throw new Error(`Im Abschnitt „${name}“ wurde kein „Weiter“-Button gefunden, und das durchgehende Detailformular wurde nicht erkannt. Bitte die Formularansicht prüfen und anschließend „Fortsetzen“ wählen.`);
          }
          await click(await waitFor(() => {
            const button = find(nextSelector);
            return button && !button.disabled && button.getAttribute("aria-disabled") !== "true" && button;
          }, `Aktivierter „Weiter“-Button im Abschnitt „${name}“`));
          await sleep(500);
          validateSection(profile, predicate, name);
        }
      }
      run.completed = [...run.completed, section];
      await update({ completed: run.completed });
    }
    await verifyDescriptionBeforePublish(profile, update);
    const invalidBeforePublish = [...document.querySelectorAll('[aria-invalid="true"]')].find(visible);
    if (invalidBeforePublish) throw new Error(`AutoScout24 meldet noch einen ungültigen Formularwert (${invalidBeforePublish.getAttribute("aria-label") || invalidBeforePublish.id || invalidBeforePublish.getAttribute("aria-labelledby")}). Bitte das Feld prüfen und anschließend „Fortsetzen“ wählen.`);
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
    const success = publicationSuccess();
    if (freeContinueButton()) {
      await update({ step: 6, message: "Paket-Auswahl: kostenlos abschließen …" });
      await finishFree(run, update);
    } else if (success) {
      await update({ status: "done", message: "AutoScout24 bestätigt die Veröffentlichung." });
    } else {
      await update({ step: 6, message: "„Veröffentlichen“ wurde angeklickt. Auf den kostenlosen Abschluss warten …" });
    }
  }
  globalThis.FiestaAutomation = {
    norm, visible, find, waitFor, click, nativeValue, assertActive: () => check(), setValue, combo, stage, marketplaceLink, freeContinueButton, publicationSuccess, fields,
    initialVehicle, upload, waitForImageUploads, imageCards, imageLoading, finishFree, description, descriptionMatches, verifyDescriptionBeforePublish, details, contactFields, priceFields, datePicker,
    setCheck: callback => { check = callback; }
  };
})();
