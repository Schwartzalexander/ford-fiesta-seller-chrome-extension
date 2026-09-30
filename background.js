/* Persistent coordination: no automation depends on an open popup or worker lifetime. */
const KEY = "autoscout24Run";
const SELL_URL = "https://www.autoscout24.de/auto-verkaufen/";
const supported = url => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && ["www.autoscout24.de", "autoscout24.de"].includes(parsed.hostname);
  } catch { return false; }
};
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
  if (message.type === "GET_RUN_FOR_TAB") return { run, mine: !!run && sender.tab?.id === run.tabId };
  if (message.type === "GET_TEMPLATE") {
    if (!sender.tab || !supported(sender.tab.url)) throw new Error("Nicht unterstützte Seite.");
    const response = await fetch(chrome.runtime.getURL("autoscout24-form-filled.html"));
    if (!response.ok) throw new Error("Fahrzeugvorlage konnte nicht geladen werden.");
    return { html: await response.text() };
  }
  if (message.type === "START") {
    if (run?.status === "running") throw new Error("Es läuft bereits ein Inserat. Bitte zuerst stoppen.");
    const tab = await chrome.tabs.get(message.tabId);
    if (!supported(tab.url)) throw new Error("Bitte AutoScout24.de öffnen.");
    const next = {
      id: crypto.randomUUID(), tabId: tab.id, status: "running", step: 0,
      message: "Startseite wird geöffnet …", completed: [], images: "pending",
      publishClicked: false, updatedAt: Date.now()
    };
    await chrome.storage.local.set({ [KEY]: next });
    try { await chrome.tabs.update(tab.id, { url: SELL_URL }); }
    catch (error) {
      await chrome.storage.local.set({ [KEY]: { ...next, status: "error", message: error.message } });
      throw error;
    }
    return { run: next };
  }
  if (["STOP", "RESUME"].includes(message.type)) {
    if (!run) throw new Error("Kein Ablauf vorhanden.");
    if (message.type === "RESUME") {
      if (run.publishClicked) throw new Error("Veröffentlichen wurde bereits angeklickt. Ergebnis bitte auf der Seite prüfen.");
      const tab = await chrome.tabs.get(run.tabId);
      if (!supported(tab.url)) throw new Error("Bitte im ursprünglichen Tab zu AutoScout24 zurückkehren.");
    }
    const next = { ...run, id: crypto.randomUUID(), status: message.type === "STOP" ? "stopped" : "running",
      message: message.type === "STOP" ? "Gestoppt." : "Ablauf wird fortgesetzt …", updatedAt: Date.now() };
    await chrome.storage.local.set({ [KEY]: next });
    return { run: next };
  }
  if (message.type === "UPDATE") {
    if (!run || run.id !== message.id || sender.tab?.id !== run.tabId || run.status !== "running") return { accepted: false, run };
    const allowed = ["status", "step", "message", "completed", "images", "publishClicked"];
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
      await chrome.storage.local.set({ [KEY]: { ...run, status: "submitted", message: "Veröffentlichen wurde angeklickt und AutoScout24 hat weitergeleitet. Bitte das Ergebnis auf der Seite prüfen.", updatedAt: Date.now() } });
    }
  }).catch(console.error);
});
