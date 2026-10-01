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
    if (run.freeContinueClicked) {
      await update({ status: "submitted", step: 6, message: "Kostenlos weiter wurde bereits angeklickt. Bitte das Inserat unter „Meine Inserate“ prüfen." });
      return;
    }
    const cookie = A.find('[data-testid="as24-cmp-decline-all-button"]');
    if (cookie) await A.click(cookie);
    if (run.publishClicked) {
      // Publication is checkpointed across navigations, but the free package
      // choice is a separate step. Never re-enter/re-publish the detail form.
      const result = await A.waitFor(() => A.freeContinueButton() || A.publicationSuccess() || (location.pathname.replace(/\/$/, "") === "/account/listings" && "listings"), "Paket-Auswahl mit „Kostenlos weiter“ nach Veröffentlichung", 30000);
      if (A.freeContinueButton()) await A.finishFree(run, update);
      else await update({ status: result === "listings" ? "submitted" : "done", step: 6,
        message: result === "listings" ? "„Meine Inserate“ ist geöffnet. Bitte das Veröffentlichungsergebnis dort prüfen." : "AutoScout24 bestätigt die Veröffentlichung." });
      return;
    }
    const stage = await A.waitFor(() => A.stage(), "AutoScout24-Formular (gegebenenfalls anmelden oder Dialog schließen)", 30000);
    if (stage === "packages") {
      await update({ step: 6, publishClicked: true, message: "Paket-Auswahl: kostenlos abschließen …" });
      await A.finishFree(run, update);
      return;
    }
    if (!cachedProfile) cachedProfile = FiestaProfile.fromHTML((await message({ type: "GET_TEMPLATE" })).html);
    const profile = cachedProfile;
    if (stage === "sell") {
      await update({ step: 1, message: "Fahrzeugauswahl wird geöffnet …" });
      await A.waitFor(() => A.stage() !== "sell", "Fahrzeugauswahl oder Verkaufsoptionen", 5000).catch(error => {
        if (error.name === "AbortError") throw error;
        location.assign(ENTRY);
      });
      return;
    }
    if (stage === "marketplace") {
      await update({ step: run.step > 0 ? 1 : 0, message: "Verkaufsoptionen: Inserat erstellen …" });
      const link = await A.waitFor(() => A.marketplaceLink(), "Inserat erstellen (AutoScout24-Marktplatz)");
      // Keep AutoScout's freshly generated URL, including selected vehicle
      // parameters. Only prevent its target=_blank from leaving the run tab.
      if (link instanceof HTMLAnchorElement) link.target = "_self";
      await A.click(link);
      await A.waitFor(() => ["contact", "details", "vehicle"].includes(A.stage()), "Kontaktdaten nach „Inserat erstellen“", 30000);
      return;
    }
    if (stage === "vehicle") {
      await update({ step: 1, message: "Fahrzeugdaten ausfüllen …" });
      await A.initialVehicle(profile);
      await A.waitFor(() => ["marketplace", "contact", "details"].includes(A.stage()), "Verkaufsoptionen, Kontaktdaten oder Detailformular", 30000);
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
