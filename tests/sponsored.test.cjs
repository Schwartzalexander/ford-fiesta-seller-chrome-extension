const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function filter(html, stored) {
  const d = new JSDOM(`<style>${read('sponsored.css')}</style>${html}`, { runScripts: 'outside-only' });
  let listener;
  d.window.chrome = { storage: {
    local: { get: async () => ({ hideSponsored: stored }) },
    onChanged: { addListener: callback => { listener = callback; } }
  } };
  d.window.eval(read('sponsored.js'));
  const selectors = d.window.document.styleSheets[0].cssRules[0].selectorText;
  return { d, matches: id => d.window.document.getElementById(id).matches(selectors),
    change: value => listener({ hideSponsored: { newValue: value } }, 'local') };
}

test('sponsored filter defaults to enabled and recognizes the supplied tracking marker and sponsored badge', async () => {
  const f = filter(`
    <article id="example" data-testid="list-item" data-relevance_adjustment="sponsored" data-seller-type="smyle"><p class="ListItemSponsored_wrapper__v9M8E">Gesponsert</p></article>
    <article id="tracking" data-relevance_adjustment="sponsored"></article>
    <article id="badge" data-testid="list-item"><p class="ListItemSponsored_wrapper__newHash">Gesponsert</p></article>
    <article id="regular" data-testid="list-item" data-seller-type="smyle"><p>Keine gesponserte Anzeige</p></article>
    <article id="description" data-testid="list-item"><p>Dieser Verein wurde gesponsert.</p></article>
  `);
  await flush();
  for (const id of ['example', 'tracking', 'badge']) {
    assert.equal(f.matches(id), true, id);
    assert.equal(f.d.window.getComputedStyle(f.d.window.document.getElementById(id)).display, 'none');
  }
  assert.equal(f.matches('regular'), false);
  assert.equal(f.matches('description'), false);
  f.d.window.close();
});

test('LeasingMarkt logo hides organic listings but ordinary leasing offers and text mentions remain visible', async () => {
  const f = filter(`
    <article id="leasingmarkt" data-testid="list-item" data-relevance_adjustment="organic" data-ownership-models="le-lm-pb">
      <span class="LeasingPrice_grossRate__3cSq1">€ 439/mtl.</span>
      <span>Leasing Angebot</span>
      <div class="ListItemSeller_leasingMarktWrapper__T68IF"><svg data-testid="logo-leasing-markt"><use xlink:href="/assets/icons.svg#leasingmarkt-de"></use></svg></div>
    </article>
    <article id="leasing" data-testid="list-item" data-ownership-models="le-lm-pb"><span>€ 439/mtl.</span><span>Leasing Angebot</span></article>
    <article id="mention" data-testid="list-item"><p>Auch auf LeasingMarkt.de angeboten</p></article>
  `);
  await flush();
  assert.equal(f.matches('leasingmarkt'), true);
  assert.equal(f.d.window.getComputedStyle(f.d.window.document.getElementById('leasingmarkt')).display, 'none');
  assert.equal(f.matches('leasing'), false);
  assert.equal(f.matches('mention'), false);
  f.change(false);
  assert.equal(f.matches('leasingmarkt'), false);
  f.change(true);
  const dynamic = f.d.window.document.createElement('article');
  dynamic.id = 'dynamic-leasingmarkt';
  dynamic.setAttribute('data-testid', 'list-item');
  f.d.window.document.body.append(dynamic);
  assert.equal(f.matches(dynamic.id), false);
  dynamic.innerHTML = '<svg data-testid="logo-leasing-markt"></svg>';
  assert.equal(f.matches(dynamic.id), true);
  dynamic.replaceChildren();
  assert.equal(f.matches(dynamic.id), false, 'SPA can reuse a LeasingMarkt card as a regular listing');
  f.d.window.close();
});

test('list content banners collapse their wrappers and empty survey space, reversibly and after lazy loading', async () => {
  const banner = (id, size) => `<div id="${id}" class="AdContentBanner_adContentBannerMinHeight__7_fgA AdContentBanner_size_${size}__hash" style="min-height: 300px"><s24-ad-slot id="s24-osa-list-contentbanner_${id}-${size}"></s24-ad-slot></div>`;
  const f = filter(`<main>
    <div class="ListPage_resultsList__hHkVa">
      <article id="regular" data-testid="list-item">Kaufangebot</article>
      ${banner('small', 's')}${banner('medium', 'm')}${banner('large', 'l')}
      <div id="surveyplaceholder" style="min-height: 250px"></div>
    </div>
    <nav id="pagination">Weiter</nav>${banner('below-pagination', 'l')}
    <div id="other" class="AdContentBanner_adContentBannerMinHeight__hash"><s24-ad-slot id="other-slot"></s24-ad-slot></div>
  </main><div id="outside" class="AdContentBanner_adContentBannerMinHeight__hash"><s24-ad-slot id="s24-osa-list-contentbanner_outside-s"></s24-ad-slot></div>`);
  await flush();
  const hidden = ['small', 'medium', 'large', 'below-pagination', 'surveyplaceholder'];
  const main = f.d.window.document.querySelector('main');
  const originalHTML = main.outerHTML;
  for (const id of hidden) {
    assert.equal(f.matches(id), true, id);
    assert.equal(f.d.window.getComputedStyle(f.d.window.document.getElementById(id)).display, 'none', id);
  }
  for (const id of ['regular', 'pagination', 'other', 'outside']) assert.equal(f.matches(id), false, id);
  f.change(false);
  for (const id of hidden) assert.equal(f.matches(id), false, id);
  assert.equal(main.outerHTML, originalHTML);
  f.change(true);
  main.insertAdjacentHTML('beforeend', banner('dynamic-banner', 'm'));
  assert.equal(f.matches('dynamic-banner'), true);
  const survey = f.d.window.document.getElementById('surveyplaceholder');
  survey.innerHTML = '<button>Umfrage starten</button>';
  assert.equal(f.matches('surveyplaceholder'), false);
  survey.replaceChildren();
  assert.equal(f.matches('surveyplaceholder'), true);
  f.d.window.close();
});

test('turning off restores cards without editing them; changes also cover dynamically inserted cards', async () => {
  const f = filter('<article id="example" data-relevance_adjustment="sponsored" style="color: red"><button>Merken</button></article>');
  await flush();
  const original = f.d.window.document.querySelector('article');
  const originalHTML = original.outerHTML;
  const dynamic = f.d.window.document.createElement('article');
  dynamic.id = 'dynamic';
  dynamic.setAttribute('data-relevance_adjustment', 'sponsored');
  f.d.window.document.body.append(dynamic);
  assert.equal(f.matches('dynamic'), true);
  f.change(false);
  assert.equal(f.matches('example'), false);
  assert.equal(f.matches('dynamic'), false);
  assert.equal(original.outerHTML, originalHTML);
  f.change(true);
  assert.equal(f.matches('example'), true);
  dynamic.removeAttribute('data-relevance_adjustment');
  assert.equal(f.matches('dynamic'), false, 'SPA can reuse a card as an organic listing');
  f.d.window.close();
});

test('saved disabled setting is respected and removing it restores the enabled default', async () => {
  const f = filter('<article id="example" data-relevance_adjustment="sponsored"></article>', false);
  await flush();
  assert.equal(f.matches('example'), false);
  f.change(undefined);
  assert.equal(f.matches('example'), true);
  f.d.window.close();
});

test('a recent cross-tab preference change takes priority over an older initialization read', async () => {
  const d = new JSDOM('', { runScripts: 'outside-only' });
  let listener;
  let resolve;
  d.window.chrome = { storage: {
    local: { get: () => new Promise(done => { resolve = done; }) },
    onChanged: { addListener: callback => { listener = callback; } }
  } };
  d.window.eval(read('sponsored.js'));
  listener({ hideSponsored: { newValue: false } }, 'local');
  resolve({ hideSponsored: true });
  await flush();
  assert.equal(d.window.document.documentElement.getAttribute('data-fiesta-hide-sponsored'), 'false');
  d.window.close();
});

test('popup loads, persists and reverts the sponsored setting when saving fails', async () => {
  const d = new JSDOM(read('popup.html'), { runScripts: 'outside-only' });
  let listener;
  let fail = false;
  const saved = [];
  d.window.chrome = {
    storage: {
      local: {
        get: async () => ({ hideSponsored: false }),
        set: async patch => {
          if (fail) throw new Error('Storage unavailable');
          saved.push(patch.hideSponsored);
          listener({ hideSponsored: { newValue: patch.hideSponsored } }, 'local');
        }
      },
      onChanged: { addListener: callback => { listener = callback; } }
    },
    tabs: { query: async () => [{ id: 1, url: 'https://www.autoscout24.de/' }] },
    runtime: { sendMessage: async () => ({ run: null }) }
  };
  d.window.eval(read('platforms.js'));
  d.window.eval(read('popup.js'));
  await flush();
  const input = d.window.document.querySelector('#hide-sponsored');
  assert.equal(input.checked, false);
  assert.equal(input.disabled, false);
  input.checked = true;
  input.dispatchEvent(new d.window.Event('change'));
  await flush();
  assert.deepEqual(saved, [true]);
  fail = true;
  input.checked = false;
  input.dispatchEvent(new d.window.Event('change'));
  await flush();
  assert.equal(input.checked, true);
  assert.equal(input.disabled, false);
  assert.match(d.window.document.querySelector('#error').textContent, /Einstellung konnte nicht gespeichert werden/);
  d.window.close();
});

test('popup offers resume for a previously submitted listing whose free completion is still pending', async () => {
  const d = new JSDOM(read('popup.html'), { runScripts: 'outside-only' });
  const run = { tabId: 1, status: 'submitted', step: 5, publishClicked: true, message: 'Publication requested' };
  let onChanged;
  d.window.chrome = {
    storage: {
      local: { get: async () => ({}), set: async () => {} },
      onChanged: { addListener: listener => { onChanged = listener; } }
    },
    tabs: { query: async () => [{ id: 1, url: 'https://www.autoscout24.de/account/product-selection' }] },
    runtime: { sendMessage: async () => ({ run }) }
  };
  d.window.eval(read('platforms.js'));
  d.window.eval(read('popup.js'));
  await flush();
  assert.equal(d.window.document.querySelector('#resume').hidden, false);
  assert.match(d.window.document.querySelector('#step').textContent, /5\/6/);
  onChanged({ autoscout24Run: { newValue: { ...run, step: 6, freeContinueClicked: true } } }, 'local');
  assert.equal(d.window.document.querySelector('#resume').hidden, true);
  assert.equal(d.window.document.querySelector('#bar').value, 7);
  d.window.close();
});
