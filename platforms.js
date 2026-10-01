(() => {
  const configs = {
    autoscout24: { name: "AutoScout24", domain: "AutoScout24.de", hosts: ["www.autoscout24.de", "autoscout24.de"], startUrl: "https://www.autoscout24.de/auto-verkaufen/", lastStep: 6 },
    kleinanzeigen: { name: "Kleinanzeigen", domain: "Kleinanzeigen.de", hosts: ["www.kleinanzeigen.de", "kleinanzeigen.de"], startUrl: "https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html", lastStep: 3 }
  };
  function detect(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") return null;
      return Object.keys(configs).find(key => configs[key].hosts.includes(parsed.hostname)) || null;
    } catch { return null; }
  }
  globalThis.FiestaPlatforms = { configs, detect };
})();
