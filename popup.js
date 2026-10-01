let tabId;
let onPlatform = false;
let hideSponsored = true;
let settingsRevision = 0;
const $ = id => document.getElementById(id);
async function send(type) {
  $("error").textContent = "";
  try {
    const result = await chrome.runtime.sendMessage({ type, tabId });
    if (result.error) throw new Error(result.error);
    render(result.run);
  } catch (error) { $("error").textContent = error.message; }
}
function render(run) {
  const running = run?.status === "running";
  $("open-platform").hidden = onPlatform;
  $("start").hidden = !onPlatform;
  $("start").disabled = running;
  $("stop").hidden = !running;
  const resumable = run && (["error", "stopped"].includes(run.status) || (run.status === "submitted" && run.publishClicked && !run.freeContinueClicked));
  $("resume").hidden = !resumable || run.freeContinueClicked || run.tabId !== tabId || !onPlatform;
  $("progress").hidden = !run;
  if (run) {
    $("step").textContent = `Schritt ${run.step}/6 · ${ {running: "Läuft", error: "Unterbrochen", stopped: "Gestoppt", submitted: "Ergebnis prüfen", done: "Veröffentlicht"}[run.status] || run.status }`;
    $("status").textContent = run.message;
    $("bar").value = run.status === "done" || run.freeContinueClicked ? 7 : run.step;
  }
}
$("start").addEventListener("click", () => send("START"));
$("open-platform").addEventListener("click", async () => {
  $("error").textContent = "";
  try {
    await chrome.tabs.create({ url: "https://www.autoscout24.de/auto-verkaufen/" });
    window.close();
  } catch (error) { $("error").textContent = error.message; }
});
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
  try {
    const url = new URL(tab.url);
    onPlatform = url.protocol === "https:" && ["autoscout24.de", "www.autoscout24.de"].includes(url.hostname);
  } catch { /* Chrome internal page. */ }
  $("hint").hidden = !onPlatform;
  $("hint").textContent = "Bereit für dein Inserat.";
  await send("GET_RUN");
})().catch(error => { $("error").textContent = error.message; });
