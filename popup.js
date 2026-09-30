let tabId;
let onPlatform = false;
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
  $("start").hidden = !onPlatform;
  $("start").disabled = running;
  $("stop").hidden = !running;
  $("resume").hidden = !run || !["error", "stopped"].includes(run.status) || run.publishClicked || run.tabId !== tabId || !onPlatform;
  $("progress").hidden = !run;
  if (run) {
    $("step").textContent = `Schritt ${run.step}/5 · ${ {running: "Läuft", error: "Unterbrochen", stopped: "Gestoppt", submitted: "Veröffentlichung angefordert", done: "Veröffentlicht"}[run.status] || run.status }`;
    $("status").textContent = run.message;
    $("bar").value = run.status === "done" ? 6 : run.step;
  }
}
$("start").addEventListener("click", () => send("START"));
$("stop").addEventListener("click", () => send("STOP"));
$("resume").addEventListener("click", () => send("RESUME"));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.autoscout24Run) render(changes.autoscout24Run.newValue);
});
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  try {
    const url = new URL(tab.url);
    onPlatform = url.protocol === "https:" && ["autoscout24.de", "www.autoscout24.de"].includes(url.hostname);
  } catch { /* Chrome internal page. */ }
  $("hint").textContent = onPlatform ? "Bereit für dein Inserat." : "Öffne AutoScout24.de, um dein Auto zu inserieren.";
  await send("GET_RUN");
})().catch(error => { $("error").textContent = error.message; });
