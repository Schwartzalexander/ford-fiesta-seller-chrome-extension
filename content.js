(() => {
  const A = FiestaAutomation;
  const ENTRY = "https://www.autoscout24.de/manual-listing-creation/private/vehicle-listing/?vehicleType=C&ref=mini-forms&event_source=navigation_bar_sell_cta";
  let busy = false;
  let cachedProfile;
  let current;
  const message = async data => {
    const reply = await chrome.runtime.sendMessage(data);
    if (reply.error) throw new Error(reply.error);
    return reply;
  };
  async function execute(run) {
    current = run;
    A.setCheck(async () => {
      const latest = (await message({ type: "GET_RUN" })).run;
      if (!latest || latest.id !== run.id || latest.status !== "running") {
        throw new DOMException("Ablauf gestoppt", "AbortError");
      }
    });
    const update = async patch => {
      const reply = await message({ type: "UPDATE", id: run.id, patch });
      if (!reply.accepted) throw new DOMException("Ablauf gestoppt", "AbortError");
      Object.assign(run, reply.run);
    };
    if (run.publishClicked) {
      await update({ status: "submitted", message: "Veröffentlichen wurde angeklickt. Bitte das Ergebnis auf AutoScout24 prüfen." });
      return;
    }
    const cookie = A.find('[data-testid="as24-cmp-decline-all-button"]');
    if (cookie) await A.click(cookie);
    const stage = await A.waitFor(() => A.stage(), "AutoScout24-Formular (gegebenenfalls anmelden oder Dialog schließen)", 30000);
    if (!cachedProfile) cachedProfile = FiestaProfile.fromHTML((await message({ type: "GET_TEMPLATE" })).html);
    const profile = cachedProfile;
    if (stage === "sell") {
      await update({ step: 0, message: "Inserat erstellen …" });
      const link = await A.waitFor(() => A.find("#market-place-link") || [...document.querySelectorAll("a, button")].find(el => A.visible(el) && A.norm(el.textContent) === "Inserat erstellen"), "Inserat erstellen");
      // The saved start-page link contains unrelated sample vehicle data and
      // opens a new tab. Use the requested entry route in the controlled tab.
      if (link instanceof HTMLAnchorElement) { link.href = ENTRY; link.target = "_self"; }
      await update({ step: 1, message: "Fahrzeugauswahl wird geöffnet …" });
      await A.click(link);
      return;
    }
    if (stage === "vehicle") {
      await update({ step: 1, message: "Fahrzeugdaten ausfüllen …" });
      await A.initialVehicle(profile);
      await A.waitFor(() => ["contact", "details"].includes(A.stage()), "Kontaktdaten oder Detailformular", 30000);
      return;
    }
    if (stage === "contact" || stage === "price") {
      await update({ step: stage === "contact" ? 2 : 3, message: stage === "contact" ? "Kontaktdaten ausfüllen …" : "Preis und Zustand ausfüllen …" });
      await A.fields(profile, stage === "contact" ? A.contactFields : A.priceFields);
      await A.click(await A.waitFor(() => {
        const next = A.find('[data-testid="steps-continue-button"]');
        return next && !next.disabled && next;
      }, "Weiter"));
      await A.waitFor(() => A.stage() && A.stage() !== stage, "Nächster Formularschritt", 30000);
      return;
    }
    if (stage === "images") {
      await update({ step: 4, message: "Fahrzeugbilder werden hochgeladen …" });
      await A.upload(profile, run, update);
      await A.click(await A.waitFor(() => {
        const next = A.find('[data-testid="steps-continue-button"]');
        return next && !next.disabled && next;
      }, "Weiter mit Bildern / Weiter ohne Bilder"));
      await A.waitFor(() => A.stage() === "details", "Detailformular", 30000);
      return;
    }
    if (stage === "details") await A.details(profile, run, update);
  }
  async function tick() {
    if (busy) return;
    busy = true;
    try {
      // The worker binds writes to sender.tab.id; a content script on any other
      // AutoScout24 tab must never start editing that tab.
      const { run, mine } = await message({ type: "GET_RUN_FOR_TAB" });
      if (!mine || run?.status !== "running") return;
      await execute(run);
    } catch (error) {
      if (error.name !== "AbortError" && current) {
        await message({ type: "UPDATE", id: current.id, patch: { status: "error", message: error.message } }).catch(() => {});
      }
    } finally { busy = false; }
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.autoscout24Run) void tick();
  });
  setInterval(tick, 1500);
  void tick();
})();
