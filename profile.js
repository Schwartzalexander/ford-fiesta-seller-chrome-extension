/* Vehicle data comes from the inert saved HTML; the current asking price is configured here. */
(() => {
  const listingPrice = "14.500";
  const images = ["Ford Fiesta.jpg", "Front.jpg", "Heck.jpg", "hinten rechts.jpg", "links.jpg", "rechts.jpg", "Vorne rechts.jpg", "Specs.jpg", "Mängel.jpg"];
  function fromHTML(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const priceInput = doc.querySelector("#price");
    if (priceInput) priceInput.value = listingPrice;
    const fields = [];
    for (const el of doc.querySelectorAll("input, button[role=combobox]")) {
      if (el.matches("input[type=hidden], input[type=file]") || el.id.startsWith("exb")) continue;
      if (!el.id && !el.getAttribute("aria-labelledby")) continue;
      const selector = el.id ? `[id="${el.id}"]` : `[role="combobox"][aria-labelledby="${el.getAttribute("aria-labelledby")}"]`;
      if (el.type === "radio" && !el.checked) continue;
      const value = el.matches("button") ? el.textContent.trim() : el.matches("[type=checkbox], [type=radio]") ? el.checked : el.value;
      if (value === "") continue;
      fields.push({ selector, value, combo: el.getAttribute("role") === "combobox", equipment: el.id.includes("-equipments-") });
    }
    const read = label => doc.querySelector(`[role=combobox][aria-labelledby="${label}"]`)?.value;
    const profile = {
      fields, images,
      descriptionHTML: doc.querySelector("#description")?.innerHTML,
      make: read("make"), model: read("model"),
      registration: doc.querySelector('[data-testid="registrationDate-datePicker"] button')?.textContent.trim(),
      // The second date picker in the source is the next HU/AU.
      inspection: doc.querySelectorAll('[class*="DatePicker_datepicker-input-main"]')[1]?.textContent.trim()
    };
    if (!profile.make || !profile.model || !profile.descriptionHTML || !/^\d{2}\.\d{4}$/.test(profile.registration || "")) {
      throw new Error("Die gespeicherte Fahrzeugvorlage ist unvollständig.");
    }
    return profile;
  }
  globalThis.FiestaProfile = { fromHTML, images };
})();
