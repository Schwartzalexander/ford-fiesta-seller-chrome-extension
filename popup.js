let tabId;
let onPlatform = false;
let platform = null;
let hideSponsored = true;
let settingsRevision = 0;
const $ = id => document.getElementById(id);
async function send(type) {
  $("error").textContent = "";
  try {
    const result = await chrome.runtime.sendMessage({ type, tabId, platform });
    if (result.error) throw new Error(result.error);
    render(result.run);
  } catch (error) { $("error").textContent = error.message; }
}
function render(run) {
  const running = run?.status === "running";
  $("open-platform").hidden = onPlatform;
  $("open-kleinanzeigen").hidden = onPlatform;
  $("platform-name").textContent = platform ? FiestaPlatforms.configs[platform].name : "AutoScout24 · Kleinanzeigen";
  $("start").textContent = platform ? `Auf ${FiestaPlatforms.configs[platform].name} inserieren` : "Inserieren";
  $("workflow-note").textContent = platform === "kleinanzeigen" ? "Der Ablauf lädt die Bilder hoch, füllt die Anzeige aus, wählt das Basis Paket und klickt auf „Anzeige aufgeben“." : "Der Ablauf füllt die Vorlage aus, wartet auf die Bild-Uploads und klickt auf „Veröffentlichen“ sowie anschließend „Kostenlos weiter“.";
  $("start").hidden = !onPlatform;
  $("start").disabled = running;
  $("stop").hidden = !running;
  const runPlatform = run?.platform || "autoscout24";
  const finished = run?.freeContinueClicked || (runPlatform === "kleinanzeigen" && run?.publishClicked);
  const resumable = run && (["error", "stopped"].includes(run.status) || (runPlatform === "autoscout24" && run.status === "submitted" && run.publishClicked && !run.freeContinueClicked));
  $("resume").hidden = !resumable || finished || run.tabId !== tabId || runPlatform !== platform;
  $("progress").hidden = !run;
  if (run) {
    const config = FiestaPlatforms.configs[runPlatform];
    $("step").textContent = `${config.name} · Schritt ${run.step}/${config.lastStep} · ${ {running: "Läuft", error: "Unterbrochen", stopped: "Gestoppt", submitted: "Ergebnis prüfen", done: "Veröffentlicht"}[run.status] || run.status }`;
    $("status").textContent = run.message;
    $("bar").max = config.lastStep + 1;
    $("bar").value = run.status === "done" || finished ? config.lastStep + 1 : run.step;
  }
}
$("start").addEventListener("click", () => send("START"));
async function openPlatform(key) {
  $("error").textContent = "";
  try {
    await chrome.tabs.create({ url: FiestaPlatforms.configs[key].startUrl });
    window.close();
  } catch (error) { $("error").textContent = error.message; }
}
$("open-platform").addEventListener("click", () => openPlatform("autoscout24"));
$("open-kleinanzeigen").addEventListener("click", () => openPlatform("kleinanzeigen"));
$("stop").addEventListener("click", () => send("STOP"));
$("resume").addEventListener("click", () => send("RESUME"));
$("hide-sponsored").addEventListener("change", async () => {
  const input = $("hide-sponsored");
  input.disabled = true;
  $("error").textContent = "";
  try {
    await chrome.storage.local.set({ hideSponsored: input.checked });
    hideSponsored = input.checked;
  } catch (error) {
    input.checked = hideSponsored;
    $("error").textContent = `Einstellung konnte nicht gespeichert werden: ${error.message}`;
  } finally { input.disabled = false; }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.autoscout24Run) render(changes.autoscout24Run.newValue);
  if (area === "local" && changes.hideSponsored) {
    settingsRevision++;
    hideSponsored = changes.hideSponsored.newValue !== false;
    $("hide-sponsored").checked = hideSponsored;
  }
});
(async () => {
  const revision = settingsRevision;
  try {
    const settings = await chrome.storage.local.get("hideSponsored");
    if (settingsRevision === revision) {
      hideSponsored = settings.hideSponsored !== false;
      $("hide-sponsored").checked = hideSponsored;
    }
  } catch (error) { $("error").textContent = error.message; }
  finally { $("hide-sponsored").disabled = false; }
})();
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  platform = FiestaPlatforms.detect(tab?.url);
  onPlatform = !!platform;
  $("hint").hidden = !onPlatform;
  $("hint").textContent = "Bereit für dein Inserat.";
  await send("GET_RUN");
})().catch(error => { $("error").textContent = error.message; });
