/* Persistent coordination: no automation depends on an open popup or worker lifetime. */
importScripts("platforms.js");
const KEY = "autoscout24Run";
const supported = url => !!FiestaPlatforms.detect(url);
// Serialize updates, including double clicks and late messages from an old document.
let queue = Promise.resolve();
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const task = queue.then(() => handle(message, sender));
  queue = task.catch(() => {});
  task.then(reply, error => reply({ error: error.message }));
  return true;
});

async function handle(message, sender) {
  const run = (await chrome.storage.local.get(KEY))[KEY] || null;
  if (message.type === "GET_RUN") return { run };
  if (message.type === "GET_RUN_FOR_TAB") return { run, mine: !!run && sender.tab?.id === run.tabId && FiestaPlatforms.detect(sender.tab.url) === (run.platform || "autoscout24") };
  if (message.type === "GET_TEMPLATE") {
    if (!sender.tab || !supported(sender.tab.url)) throw new Error("Nicht unterstützte Seite.");
    const response = await fetch(chrome.runtime.getURL("autoscout24-form-filled.html"));
    if (!response.ok) throw new Error("Fahrzeugvorlage konnte nicht geladen werden.");
    return { html: await response.text() };
  }
  if (message.type === "START") {
    if (run?.status === "running") throw new Error("Es läuft bereits ein Inserat. Bitte zuerst stoppen.");
    const tab = await chrome.tabs.get(message.tabId);
    const platform = FiestaPlatforms.detect(tab.url);
    if (!platform || (message.platform && message.platform !== platform)) throw new Error("Bitte den gewünschten Anbieter im aktiven Tab öffnen.");
    const next = {
      id: crypto.randomUUID(), tabId: tab.id, platform, status: "running", step: 0,
      message: "Startseite wird geöffnet …", completed: [], images: "pending",
      publishClicked: false, freeContinueClicked: false, formSubmitted: false, updatedAt: Date.now()
    };
    await chrome.storage.local.set({ [KEY]: next });
    try { await chrome.tabs.update(tab.id, { url: FiestaPlatforms.configs[platform].startUrl }); }
    catch (error) {
      await chrome.storage.local.set({ [KEY]: { ...next, status: "error", message: error.message } });
      throw error;
    }
    return { run: next };
  }
  if (["STOP", "RESUME"].includes(message.type)) {
    if (!run) throw new Error("Kein Ablauf vorhanden.");
    if (message.type === "RESUME") {
      if (run.freeContinueClicked) throw new Error("Kostenlos weiter wurde bereits angeklickt. Ergebnis bitte unter „Meine Inserate“ prüfen.");
      if (run.platform === "kleinanzeigen" && run.publishClicked) throw new Error("Anzeige aufgeben wurde bereits angeklickt. Ergebnis bitte bei Kleinanzeigen prüfen.");
      const tab = await chrome.tabs.get(run.tabId);
      if (FiestaPlatforms.detect(tab.url) !== (run.platform || "autoscout24")) throw new Error("Bitte im ursprünglichen Tab zum Anbieter dieses Ablaufs zurückkehren.");
    }
    const next = { ...run, id: crypto.randomUUID(), status: message.type === "STOP" ? "stopped" : "running",
      message: message.type === "STOP" ? "Gestoppt." : "Ablauf wird fortgesetzt …", updatedAt: Date.now() };
    await chrome.storage.local.set({ [KEY]: next });
    return { run: next };
  }
  if (message.type === "UPDATE") {
    if (!run || run.id !== message.id || sender.tab?.id !== run.tabId || run.status !== "running" || FiestaPlatforms.detect(sender.tab.url) !== (run.platform || "autoscout24")) return { accepted: false, run };
    const allowed = ["status", "step", "message", "completed", "images", "publishClicked", "freeContinueClicked", "formSubmitted"];
    const patch = Object.fromEntries(Object.entries(message.patch || {}).filter(([key]) => allowed.includes(key)));
    const next = { ...run, ...patch, updatedAt: Date.now() };
    await chrome.storage.local.set({ [KEY]: next });
    return { accepted: true, run: next };
  }
  throw new Error("Unbekannter Befehl.");
}

chrome.tabs.onRemoved.addListener(tabId => {
  queue = queue.then(async () => {
    const run = (await chrome.storage.local.get(KEY))[KEY];
    if (run?.tabId === tabId && run.status === "running") {
      await chrome.storage.local.set({ [KEY]: { ...run, status: "stopped", message: "Der Inserat-Tab wurde geschlossen." } });
    }
  }).catch(console.error);
});

chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (!change.url) return;
  queue = queue.then(async () => {
    const run = (await chrome.storage.local.get(KEY))[KEY];
    if (run?.tabId === tabId && run.status === "running" && run.publishClicked) {
      if (run.platform === "kleinanzeigen") {
        await chrome.storage.local.set({ [KEY]: { ...run, step: 3, status: "submitted", message: "Anzeige aufgeben wurde angeklickt und Kleinanzeigen hat weitergeleitet. Bitte das Ergebnis unter deinen Anzeigen prüfen.", updatedAt: Date.now() } });
        return;
      }
      await chrome.storage.local.set({ [KEY]: { ...run, step: 6,
        status: run.freeContinueClicked ? "submitted" : "running",
        message: run.freeContinueClicked ? "Kostenlos weiter wurde angeklickt und AutoScout24 hat weitergeleitet. Bitte das Inserat unter „Meine Inserate“ prüfen." : "AutoScout24 hat weitergeleitet. Kostenlosen Abschluss prüfen …", updatedAt: Date.now() } });
    }
  }).catch(console.error);
});
