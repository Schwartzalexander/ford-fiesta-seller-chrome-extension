(() => {
  const A = FiestaAutomation;
  const listingTitle = "Ford Fiesta Vignale 1,0 l EcoBoost Automatik - Top Ausstattung";
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const id = value => `[id="${value}"]`;
  const text = value => A.norm(value).toLocaleLowerCase("de-DE");
  const buttonText = label => [...document.querySelectorAll("button")].find(el => A.visible(el) && A.norm(el.textContent) === label);
  const basicPackage = () => [...document.querySelectorAll('button[role="radio"]')].find(el => A.visible(el) && A.norm(el.textContent) === "Basis Paket");
  const bundleHydrationPending = button => !!button?.closest('astro-island[component-export="BundleSelection"][ssr]');
  const basicSelected = () => {
    const basic = basicPackage();
    if (!basic || bundleHydrationPending(basic) || basic.getAttribute("aria-checked") !== "true") return false;
    const group = basic.closest('[role="radiogroup"]') || basic.parentElement.parentElement;
    return ![...group.querySelectorAll('button[role="radio"]')].some(other => other !== basic && other.getAttribute("aria-checked") === "true");
  };
  async function selectBasicPackage() {
    let attempts = 0;
    let nextClickAt = 0;
    let lastButton;
    let stableSince = 0;
    try {
      await A.waitFor(async () => {
        const basic = basicPackage();
        if (!basic || bundleHydrationPending(basic)) { lastButton = null; stableSince = 0; return false; }
        if (basicSelected()) return true;
        if (basic !== lastButton) { lastButton = basic; stableSince = Date.now(); }
        if (basic.getAttribute("aria-checked") !== "true" && !basic.disabled && basic.getAttribute("aria-disabled") !== "true" && attempts < 3 && Date.now() - stableSince >= 500 && Date.now() >= nextClickAt) {
          // A click before Astro/React hydration can be ignored. Retry only
          // unconfirmed selection, always on the current (possibly new) node.
          attempts++;
          await A.click(basic);
          nextClickAt = Date.now() + 800;
        }
        return basicSelected();
      }, "Interaktive Auswahl des kostenlosen Basis Pakets", 30000);
    } catch (error) {
      if (error.name === "AbortError") throw error;
      if (bundleHydrationPending(basicPackage())) throw new Error("Die Kleinanzeigen-Paket-Auswahl lädt noch und ist nicht interaktiv. Bitte die Seite fertig laden lassen und „Fortsetzen“ wählen.");
      throw new Error("Kleinanzeigen hat die Auswahl des Basis Pakets noch nicht bestätigt. Bitte auf „Basis Paket“ klicken und anschließend „Fortsetzen“ wählen. Es wurde noch keine Anzeige aufgegeben.");
    }
  }
  function stage() {
    if (basicPackage()) return "package";
    if (document.querySelector(id("autos.km"))) return "details";
    if (document.querySelector("#ad-title")) return "form";
    if (document.querySelector("#ad-category-picker-216")) return "category";
    return null;
  }
  function plainDescription(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const walk = node => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (node.nodeType !== Node.ELEMENT_NODE) return "";
      if (["SCRIPT", "STYLE"].includes(node.tagName)) return "";
      if (node.tagName === "BR") return "\n";
      if (node.tagName === "HR") return "\n\n";
      const content = [...node.childNodes].map(walk).join("");
      if (node.tagName === "LI") return "- " + content.trim() + "\n";
      return ["P", "DIV", "UL", "OL", "H1", "H2", "H3"].includes(node.tagName) ? content + "\n\n" : content;
    };
    return [...doc.body.childNodes].map(walk).join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function fromProfile(profile) {
    const value = key => {
      const field = profile.fields.find(field => field.selector.includes(`"${key}"`));
      if (!field) throw new Error(`Es fehlen Fahrzeugdaten für Kleinanzeigen: ${key}. Bitte diese Angabe ergänzen.`);
      return field.value;
    };
    const equipment = (...numbers) => profile.fields.some(field => field.equipment && field.value === true && numbers.some(number => field.selector.includes(`-equipments-${number}"`)));
    const title = listingTitle;
    const description = plainDescription(profile.descriptionHTML);
    if (title.length > 65) throw new Error("Der Kleinanzeigen-Titel ist länger als 65 Zeichen. Bitte einen kürzeren Titel festlegen.");
    if (description.length > 4000) throw new Error("Die vollständige Beschreibung überschreitet 4.000 Zeichen. Bitte einen kürzeren Text festlegen; die Mängelangaben dürfen nicht verloren gehen.");
    if (value("damaged__false") !== true || value("accident__false") !== true) throw new Error("Der Fahrzeugzustand muss vor Kleinanzeigen anhand der vorhandenen Schäden/Unfalldaten geklärt werden.");
    const [month, year] = profile.registration.split(".");
    const [huMonth, huYear] = profile.inspection.split(".");
    const months = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
    const monthOptions = number => [months[Number(number) - 1], number, String(Number(number))];
    return {
      title, description, images: profile.images,
      inputs: {
        "autos.km": String(value("mileage")).replace(/\./g, ""), "autos.ez": year,
        "autos.power": value("powerPS"), "ad-price-amount": String(value("price")).replace(/\./g, ""),
        "ad-zip-code": String(value("location")).slice(0, 5), "ad-description": description
      },
      selects: [
        ["autos.marke", [profile.make]], ["autos.model", [profile.model]],
        ["autos.schaden", ["Unbeschädigtes Fahrzeug", "Unbeschädigt", "Unbeschädigtes Fahrzeug (unfallfrei)"]],
        ["autos.ezm", monthOptions(month)], ["autos.fuel", [value("fuelCategory")]],
        ["autos.shift", [value("motorSectionTransmissionLabel")]], ["autos.typ", [value("vehicleBody-label")]],
        ["autos.anzahl_tueren", [String(value("doors-label")), "4/5", "4/5 Türen", "5 Türen"]],
        ["autos.tuevm", monthOptions(huMonth)], ["autos.tuevy", [huYear]],
        ["autos.umweltplakette", ["4 (Grün)", "4 (grün)", "Grün", "4 - Grün"]],
        ["autos.schadstoffklasse", [value("pollutionClass"), "Euro 6", "Euro6"]],
        ["autos.aussenfarbe", ["Blau"]], ["autos.material_innenausstattung", [value("upholstery-label"), "Leder"]],
        ["ad-price-type", [value("priceNegotiable") ? "VB" : "Festpreis"]]
      ],
      checks: {
        "ad-type-OFFER": true,
        "autos.trailer_coupling": equipment(20), "autos.park_assistant": equipment(128, 129, 130, 131),
        "autos.alluminium_rims": equipment(15), "autos.xenon_led_light": equipment(39, 140),
        "autos.air_conditioning": equipment(5, 30), "autos.navi": equipment(23),
        "autos.radio_tuner": equipment(10, 138), "autos.bluetooth": equipment(122),
        "autos.handsfree_speaker": equipment(124), "autos.sunroof": equipment(4, 50),
        "autos.seat_heating": equipment(34), "autos.speed_control": equipment(38, 133),
        "autos.non_smoking": value("nonSmoking"), "autos.abs": equipment(1),
        "autos.full_service_history": value("fullServiceHistory")
      }
    };
  }
  async function setInput(key, value) {
    if (key === "ad-description") return setDescription(value);
    const el = await A.waitFor(() => {
      const input = A.find(id(key));
      return input && !input.disabled && input;
    }, `Kleinanzeigen-Feld ${key}`);
    const expected = String(value);
    const equivalent = actual => ["autos.km", "autos.power", "ad-price-amount"].includes(key) ? String(actual).replace(/[.\s]/g, "") === expected : String(actual) === expected;
    if (equivalent(el.value)) return;
    if (el.readOnly) throw new Error(`Das Feld ${key} ist schreibgeschützt. Bitte die Angabe im Kleinanzeigen-Konto prüfen.`);
    if (el.maxLength > 0 && expected.length > el.maxLength) throw new Error(`Die Angabe für ${key} überschreitet das Zeichenlimit.`);
    await A.assertActive();
    el.focus();
    A.nativeValue(el, expected);
    el.blur();
    await A.waitFor(() => equivalent(A.find(id(key))?.value), `Übernahme von ${key}`, 5000);
  }
  // Textareas/browser handlers can normalize line endings, blank lines and
  // surrounding whitespace and decorative heading icons. All actual wording,
  // including the known defects, must still match the source in full.
  const descriptionComparable = value => A.norm(String(value || "").normalize("NFC"))
    .replace(/⭐\uFE0F?\s*(?=Highlights\b)/gu, "")
    .replace(/🔎\uFE0F?\s*(?=Bekannte Mängel\b)/gu, "");
  const descriptionMatches = expected => {
    const el = A.find("#ad-description");
    return !!el && el.getAttribute("data-empty") !== "true" && descriptionComparable(el.value) === descriptionComparable(expected);
  };
  async function setDescription(value) {
    const expected = String(value || "");
    if (!descriptionComparable(expected)) throw new Error("Die Kleinanzeigen-Beschreibung ist leer. Bitte den vollständigen Text ergänzen.");
    let el = await A.waitFor(() => A.find("#ad-description"), "Kleinanzeigen-Beschreibung");
    if (el.readOnly || el.disabled) throw new Error("Das Kleinanzeigen-Beschreibungsfeld ist nicht bearbeitbar.");
    if (el.maxLength > 0 && expected.length > el.maxLength) throw new Error("Die vollständige Kleinanzeigen-Beschreibung überschreitet das Zeichenlimit. Der Text wird nicht gekürzt.");
    if (descriptionMatches(expected)) return;
    for (let attempt = 0; attempt < 2; attempt++) {
      await A.assertActive();
      el = await A.waitFor(() => A.find("#ad-description"), "Aktuelles Kleinanzeigen-Beschreibungsfeld");
      el.focus();
      let inserted = false;
      if (attempt > 0 && typeof document.execCommand === "function") {
        el.setSelectionRange(0, el.value.length);
        inserted = document.execCommand("insertText", false, expected);
      }
      if (!inserted) A.nativeValue(el, expected);
      // Let React commit its controlled value before blur can validate/normalize
      // it. Reacquire the textarea as the component may replace the old DOM node.
      await pause(300);
      await A.assertActive();
      try {
        await A.waitFor(() => descriptionMatches(expected), "Beschreibung im kontrollierten Kleinanzeigen-Formular", 2000);
      } catch (error) {
        if (error.name === "AbortError") throw error;
        continue;
      }
      const current = A.find("#ad-description");
      if (current) {
        current.dispatchEvent(new Event("change", { bubbles: true }));
        current.blur();
      }
      await pause(300);
      await A.assertActive();
      if (descriptionMatches(expected)) return;
    }
    const actual = A.find("#ad-description");
    const emptyState = actual?.getAttribute("data-empty") === "true" ? " Das Formular meldet das Feld weiterhin als leer." : "";
    throw new Error(`Kleinanzeigen hat die vollständige Beschreibung nicht gespeichert (${expected.length} Zeichen vorgesehen, ${actual?.value.length || 0} Zeichen im aktuellen Feld).${emptyState} Bitte das Feld „Beschreibung“ prüfen und anschließend „Fortsetzen“ wählen. Die Ausstattungs-Checkboxen wurden davor bearbeitet.`);
  }
  function selectedText(el) {
    const labels = (el.getAttribute("aria-labelledby") || "").split(/\s+/);
    const selected = labels.find(label => label.endsWith("-selected-option"));
    return selected && document.getElementById(selected) ? document.getElementById(selected).textContent : el.textContent;
  }
  async function select(key, choices) {
    let el = await A.waitFor(() => {
      const candidate = A.find(id(key));
      return candidate && !candidate.disabled && candidate.getAttribute("aria-disabled") !== "true" && candidate;
    }, `Kleinanzeigen-Auswahl ${key}`);
    const matches = label => choices.map(text).includes(text(label));
    if (matches(selectedText(el))) return;
    if (el.getAttribute("aria-expanded") !== "true") await A.click(el);
    const option = await A.waitFor(() => {
      el = A.find(id(key));
      if (!el) return null;
      const listId = el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
      const lists = listId ? [document.getElementById(listId)].filter(Boolean) : [...document.querySelectorAll('[role="listbox"]')].filter(A.visible);
      if (lists.length !== 1) return null;
      return [...lists[0].querySelectorAll('[role="option"]')].find(option => A.visible(option) && matches(option.textContent));
    }, `Kleinanzeigen: ${choices[0]} in ${key}`);
    await A.click(option);
    await A.waitFor(() => {
      const current = A.find(id(key));
      return current && matches(selectedText(current)) && current.getAttribute("aria-expanded") !== "true";
    }, `Bestätigung von ${key}`, 5000);
  }
  async function category() {
    if (document.querySelector('input[name="categoryId"]')?.value === "216" && document.querySelector(id("autos.km"))) return;
    const label = await A.waitFor(() => A.find('label[for="ad-category-picker-216"]'), "Kategorie Auto, Rad & Boot › Autos › Ford › Fiesta", 30000);
    if (!/Autos.*Ford.*Fiesta/.test(label.textContent)) throw new Error("Der Kategorie-Vorschlag 216 entspricht nicht Ford Fiesta. Bitte die Kategorie prüfen.");
    await A.click(label);
    await A.waitFor(() => document.querySelector('input[name="categoryId"]')?.value === "216" && document.querySelector(id("autos.km")), "Ford-Fiesta-Fahrzeugfelder", 30000);
  }
  function uploadedURLs() {
    return new Set([...document.querySelectorAll('input[name^="adImages["][name$="].url"]')].map(input => input.value).filter(url => {
      try { const parsed = new URL(url); return parsed.protocol === "https:" && parsed.hostname === "img.kleinanzeigen.de"; } catch { return false; }
    }));
  }
  const imageCount = () => document.querySelectorAll('button[aria-label="Bild entfernen"]').length;
  const uploading = () => !!A.find('[aria-busy="true"], [role="progressbar"], .animate-spin, [data-title="spinner"], [data-title="loading"]');
  async function waitImages(data, update, timeout = 120000) {
    let stable = 0;
    let last = "";
    await A.waitFor(async () => {
      const count = uploadedURLs().size;
      const message = `Kleinanzeigen-Bilder: ${Math.min(count, data.images.length)}/${data.images.length} fertig hochgeladen …`;
      if (message !== last) { last = message; await update({ message }); }
      if (count < data.images.length || imageCount() < data.images.length || uploading()) { stable = 0; return false; }
      if (!stable) stable = Date.now();
      return Date.now() - stable >= 600;
    }, "Alle Kleinanzeigen-Bilder mit bestätigten Server-URLs ohne Ladeanzeige", timeout);
  }
  async function upload(data, run, update) {
    if (imageCount() > 0 || run.images === "uploaded") {
      await waitImages(data, update);
      await update({ images: "uploaded" });
      return;
    }
    const transfer = new DataTransfer();
    for (const name of data.images) {
      await A.assertActive();
      const response = await fetch(chrome.runtime.getURL(`Bilder/${name}`));
      if (!response.ok) throw new Error(`Kleinanzeigen-Bild fehlt: ${name}`);
      transfer.items.add(new File([await response.blob()], name, { type: "image/jpeg" }));
    }
    const input = await A.waitFor(() => document.querySelector('input[type="file"][multiple]'), "Kleinanzeigen-Dateiupload");
    await A.assertActive();
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await waitImages(data, update);
    await update({ images: "uploaded" });
  }
  function validate() {
    const invalid = [...document.querySelectorAll('[aria-invalid="true"], input:invalid, textarea:invalid')].find(A.visible);
    if (invalid) throw new Error(`Kleinanzeigen meldet eine ungültige Angabe: ${invalid.labels?.[0]?.textContent || invalid.getAttribute("aria-label") || invalid.id}. Bitte prüfen und fortsetzen.`);
  }
  async function fill(data) {
    await setInput("ad-title", data.title);
    for (const [key, choices] of data.selects) await select(key, choices);
    for (const [key, value] of Object.entries(data.inputs)) if (key !== "ad-description") await setInput(key, value);
    for (const [key, checked] of Object.entries(data.checks)) await A.setValue(id(key), checked);
    await setDescription(data.description);
    // Both optional consent/address controls retain the user's existing state.
    await A.waitFor(async () => {
      const city = document.querySelector("#ad-city");
      if (city?.value && /münchen/i.test(city.value) && document.querySelector('input[name="locationId"]')?.value) return true;
      const option = [...document.querySelectorAll('[role="option"]')].find(el => A.visible(el) && /München.*Bogenhausen/i.test(el.textContent));
      if (option) await A.click(option);
      return false;
    }, "Standort München für PLZ 81925", 20000);
    const name = document.querySelector("#ad-name");
    if (!name?.value.trim()) throw new Error("Es fehlt der Kontaktname im Kleinanzeigen-Konto. Bitte im Profil ergänzen und fortsetzen.");
    validate();
  }
  async function verifyFields(data) {
    // Upload waiting can expose delayed form re-renders: check again before
    // submitting instead of trusting the earlier DOM or completed checkpoint.
    for (const [key, checked] of Object.entries(data.checks)) await A.setValue(id(key), checked);
    if (!descriptionMatches(data.description)) await setDescription(data.description);
    for (const [key, checked] of Object.entries(data.checks)) {
      if (document.getElementById(key)?.checked !== checked) throw new Error(`Kleinanzeigen hat die Checkbox ${key} nach der Beschreibungseingabe zurückgesetzt. Bitte prüfen und fortsetzen.`);
    }
    if (!descriptionMatches(data.description)) throw new Error("Die Kleinanzeigen-Beschreibung fehlt oder ist unvollständig. Es wurde noch nicht zum nächsten Schritt gewechselt.");
    validate();
  }
  async function next(run, update) {
    const button = await A.waitFor(() => {
      const candidate = buttonText("Nächster Schritt");
      return candidate && !candidate.disabled && candidate.getAttribute("aria-disabled") !== "true" && candidate;
    }, "Nächster Schritt zur Kleinanzeigen-Paket-Auswahl");
    await update({ formSubmitted: true, message: "Kleinanzeigen: Nächster Schritt …" });
    await A.click(button);
    try { validate(); } catch (error) { await update({ formSubmitted: false }); throw error; }
    await A.waitFor(() => stage() === "package", "Kleinanzeigen-Paket-Auswahl", 30000);
  }
  const success = () => [...document.querySelectorAll('h1, h2, [role="status"]')].find(el => A.visible(el) && /(?:Anzeige|Inserat).*(?:erfolgreich|veröffentlicht|online)/i.test(el.textContent));
  async function publish(run, update) {
    await selectBasicPackage();
    await A.waitFor(() => {
      const candidate = buttonText("Anzeige aufgeben");
      return basicSelected() && candidate && !candidate.disabled && candidate.getAttribute("aria-disabled") !== "true" && candidate;
    }, "Aktiviertes „Anzeige aufgeben“ nach Basis-Auswahl", 30000);
    if (!/kostenlos/i.test(basicPackage().parentElement.textContent)) throw new Error("Das Basis Paket ist nicht eindeutig als kostenlos erkennbar. Bitte die Paket-Auswahl prüfen.");
    await update({ step: 3, publishClicked: true, message: "Kleinanzeigen: Anzeige mit Basis Paket aufgeben …" });
    const currentButton = buttonText("Anzeige aufgeben");
    if (!basicSelected() || !currentButton || currentButton.disabled || currentButton.getAttribute("aria-disabled") === "true") {
      await update({ publishClicked: false });
      throw new Error("Die Kleinanzeigen-Paket-Auswahl hat sich vor dem Absenden geändert. Bitte das Basis Paket prüfen und fortsetzen.");
    }
    await A.click(currentButton);
    const error = [...document.querySelectorAll('[role="alert"]')].find(el => A.visible(el) && A.norm(el.textContent));
    if (error) throw new Error(`Kleinanzeigen: ${A.norm(error.textContent)}`);
    await update({ status: success() ? "done" : "submitted", message: success() ? "Kleinanzeigen bestätigt die Veröffentlichung." : "„Anzeige aufgeben“ wurde mit Basis Paket angeklickt. Bitte das Ergebnis unter deinen Anzeigen prüfen." });
  }
  globalThis.FiestaKleinanzeigen = { stage, fromProfile, plainDescription, setInput, setDescription, descriptionMatches, verifyFields, select, category, uploadedURLs, imageCount, uploading, waitImages, upload, fill, next, selectBasicPackage, basicSelected, publish, success };
})();
