(() => {
  const A = FiestaAutomation;
  const K = FiestaKleinanzeigen;
  let busy = false;
  let current;
  let data;
  async function message(request) {
    const result = await chrome.runtime.sendMessage(request);
    if (result.error) throw new Error(result.error);
    return result;
  }
  async function execute(run) {
    current = run;
    A.setCheck(async () => {
      const latest = (await message({ type: "GET_RUN" })).run;
      if (!latest || latest.id !== run.id || latest.status !== "running" || latest.platform !== "kleinanzeigen") throw new DOMException("Ablauf gestoppt", "AbortError");
    });
    const update = async patch => {
      const result = await message({ type: "UPDATE", id: run.id, patch });
      if (!result.accepted) throw new DOMException("Ablauf gestoppt", "AbortError");
      Object.assign(run, result.run);
    };
    if (run.publishClicked) {
      await update({ step: 3, status: K.success() ? "done" : "submitted", message: "Anzeige aufgeben wurde bereits angeklickt. Bitte das Ergebnis bei Kleinanzeigen prüfen." });
      return;
    }
    const stage = await A.waitFor(() => K.stage(), "Kleinanzeigen-Formular (gegebenenfalls anmelden oder einen Dialog schließen)", 30000);
    if (stage === "package") { await update({ step: 3 }); await K.publish(run, update); return; }
    if (run.formSubmitted) {
      await A.waitFor(() => K.stage() === "package", "Paket-Auswahl nach dem bereits angeklickten Nächsten Schritt", 30000);
      return;
    }
    if (!data) data = K.fromProfile(FiestaProfile.fromHTML((await message({ type: "GET_TEMPLATE" })).html));
    const mark = async key => { if (!run.completed.includes(key)) await update({ completed: [...run.completed, key] }); };
    if (stage === "form" || stage === "details") {
      await update({ step: 0, message: "Kleinanzeigen: Fahrzeugbilder hochladen …" });
      await K.upload(data, run, update);
      await mark("images");
      await K.setInput("ad-title", data.title);
      await mark("title");
    }
    await update({ step: 1, message: "Kleinanzeigen: Auto, Rad & Boot › Autos › Ford › Fiesta auswählen …" });
    await K.category();
    await mark("category");
    await update({ step: 2, message: "Kleinanzeigen: Fahrzeug- und Kontaktdaten ausfüllen …" });
    await K.fill(data);
    await K.waitImages(data, update);
    await K.verifyFields(data);
    await mark("fields");
    await K.next(run, update);
    await update({ step: 3, message: "Kleinanzeigen: Basis Paket wählen …" });
    await K.publish(run, update);
  }
  async function tick() {
    if (busy) return;
    busy = true;
    try {
      const { run, mine } = await message({ type: "GET_RUN_FOR_TAB" });
      if (!mine || run?.status !== "running" || run.platform !== "kleinanzeigen") return;
      await execute(run);
    } catch (error) {
      if (error.name !== "AbortError" && current) await message({ type: "UPDATE", id: current.id, patch: { status: "error", message: error.message } }).catch(() => {});
    } finally { busy = false; }
  }
  chrome.storage.onChanged.addListener((changes, area) => { if (area === "local" && changes.autoscout24Run) void tick(); });
  setInterval(tick, 1500);
  void tick();
})();
