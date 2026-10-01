(() => {
  const KEY = "hideSponsored";
  let enabled = true;
  let revision = 0;
  const apply = () => document.documentElement?.setAttribute("data-fiesta-hide-sponsored", String(enabled));
  apply();
  if (!document.documentElement) document.addEventListener("DOMContentLoaded", apply, { once: true });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[KEY]) return;
    revision++;
    enabled = changes[KEY].newValue !== false;
    apply();
  });
  // A change received during initialization takes precedence over an old read.
  const initialRevision = revision;
  chrome.storage.local.get(KEY).then(settings => {
    if (revision !== initialRevision) return;
    enabled = settings[KEY] !== false;
    apply();
  }).catch(error => console.error("Fiesta Verkäufer: Anzeigenfilter-Einstellung konnte nicht gelesen werden.", error));
})();
