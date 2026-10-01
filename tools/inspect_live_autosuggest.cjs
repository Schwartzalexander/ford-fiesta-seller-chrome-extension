// Read-only inspection of the publicly served UI component, without submitting a listing.
const { JSDOM } = require('jsdom');
(async () => {
  const origin = 'https://www.autoscout24.de';
  const html = await (await fetch(origin + '/auto-verkaufen/')).text();
  const doc = new JSDOM(html).window.document;
  const urls = [...doc.querySelectorAll('script[src]')].map(el => new URL(el.src, origin).href).filter(url => url.includes('/assets/private-seller-unified-flow/_next/static/chunks/'));
  await Promise.all(urls.map(async url => {
    const text = await (await fetch(url)).text();
    const patterns = process.argv.slice(2);
    for (const pattern of patterns.length ? patterns : ['aria-owns', 'select-model', 'suggestions', 'onMouseDown']) {
      let offset = 0;
      let count = 0;
      while ((offset = text.indexOf(pattern, offset)) >= 0 && count++ < 8) {
        console.log('\n', url, pattern, '\n', text.slice(Math.max(0, offset - 1200), offset + 1800));
        offset += pattern.length;
      }
    }
  }));
})().catch(error => { console.error(error); process.exitCode = 1; });
