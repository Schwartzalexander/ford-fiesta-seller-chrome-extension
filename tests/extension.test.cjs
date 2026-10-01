const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const template = read('autoscout24-form-filled.html');
function dom(html = '', url = 'https://www.autoscout24.de/manual-listing-creation/private/mini-forms/') {
  const result = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = result.window;
  w.HTMLElement.prototype.getClientRects = function () { return [1]; };
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.eval(read('profile.js'));
  w.eval(read('automation.js'));
  return result;
}

test('manifest references valid scripts, popup and real PNG icons', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['storage', 'activeTab']);
  for (const file of [manifest.background.service_worker, manifest.action.default_popup, ...manifest.content_scripts.flatMap(script => [...(script.js || []), ...(script.css || [])])]) assert.ok(fs.existsSync(path.join(root, file)), file);
  for (const [size, file] of Object.entries(manifest.icons)) {
    const png = fs.readFileSync(path.join(root, file));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), Number(size));
    assert.equal(png.readUInt32BE(20), Number(size));
  }
});

test('profile faithfully reads source values, all equipment states and complete rich description', () => {
  const d = dom();
  const p = d.window.FiestaProfile.fromHTML(template);
  assert.equal(p.make, 'Ford');
  assert.equal(p.model, 'Fiesta');
  assert.equal(p.registration, '06.2020');
  assert.equal(p.inspection, '07.2027');
  assert.equal(p.fields.find(f => f.selector.includes('"price"')).value, '15.200');
  const source = new JSDOM(template).window.document;
  assert.equal(p.fields.filter(f => f.equipment).length, source.querySelectorAll('input[id*="-equipments-"]').length);
  assert.equal(p.descriptionHTML, source.querySelector('#description').innerHTML);
  assert.ok(p.descriptionHTML.includes('Kleines Loch im Beifahrersitz'));
  assert.equal(p.images.length, 9);
  assert.equal(p.images.at(-1), 'Mängel.jpg');
  for (const name of p.images) assert.ok(fs.existsSync(path.join(root, 'Bilder', name)));
  d.window.close();
});

test('all supplied snapshots are classified by DOM, even mini-form pages share a URL', () => {
  const expected = ['marketplace', 'vehicle', 'contact', 'price', 'packages'];
  for (let i = 0; i <= 4; i++) {
    const d = dom(read(`autoscout24.de_sell_car_form_page_${i}.html`), i === 0 ? 'https://www.autoscout24.de/auto-verkaufen/' : undefined);
    assert.equal(d.window.FiestaAutomation.stage(), expected[i]);
    d.window.close();
  }
  const d = dom(template);
  assert.equal(d.window.FiestaAutomation.stage(), 'details');
  d.window.close();
  const images = dom(read('tests/fixtures/images-mini.html'));
  assert.equal(images.window.FiestaAutomation.stage(), 'images');
  images.window.close();
});

test('contact and price steps apply source values and dispatch site input events', async () => {
  for (const i of [2, 3]) {
    const d = dom(read(`autoscout24.de_sell_car_form_page_${i}.html`));
    const { FiestaAutomation: a, FiestaProfile: p } = d.window;
    let inputEvents = 0;
    d.window.document.addEventListener('input', () => inputEvents++);
    await a.fields(p.fromHTML(template), i === 2 ? a.contactFields : a.priceFields);
    if (i === 2) {
      assert.equal(d.window.document.querySelector('#contactFieldPhoneNumberFull').value, '01715432107');
      assert.equal(d.window.document.querySelector('#hidePhoneNumber__false').checked, true);
    } else {
      assert.equal(d.window.document.querySelector('#price').value, '15.200');
      assert.equal(d.window.document.querySelector('#nonSmoking').checked, true);
      assert.ok(inputEvents > 0);
    }
    d.window.close();
  }
});

test('content workflow clicks Inserat erstellen after vehicle selection and preserves the generated vehicle URL', async () => {
  const d = dom(read('autoscout24.de_sell_car_form_page_1.html'), 'https://www.autoscout24.de/auto-verkaufen/');
  const { document, FiestaAutomation: a } = d.window;
  const run = { id: 'test-run', tabId: 1, status: 'running', step: 1, completed: [], images: 'pending', publishClicked: false };
  let tick;
  let selected = 0;
  let listingClicks = 0;
  let dealerClicks = 0;
  const destination = 'https://www.autoscout24.de/manual-listing-creation/private/mini-forms?make=29&model=1758&version=Fiesta%20VIGNALE&kw=74&firstreg_year=2020&firstreg_mth=06';
  a.initialVehicle = async () => {
    selected++;
    document.body.innerHTML = '<h1>Optionen für deinen Ford Fiesta</h1><button id="dealer">Termin vereinbaren</button><a id="market-place-link" target="_blank">Inserat erstellen</a>';
    document.querySelector('#dealer').onclick = () => dealerClicks++;
    const link = document.querySelector('#market-place-link');
    link.href = destination;
    link.onclick = event => {
      event.preventDefault();
      listingClicks++;
      assert.equal(link.href, destination, 'retain the selected vehicle query parameters');
      assert.equal(link.target, '_self');
      document.body.innerHTML = '<input id="contactFieldPhoneNumberFull"><button data-testid="steps-continue-button">Weiter</button>';
    };
  };
  d.window.setInterval = callback => { tick = callback; return 1; };
  d.window.chrome = {
    runtime: { sendMessage: async message => {
      if (message.type === 'GET_RUN_FOR_TAB') return { run: { ...run }, mine: true };
      if (message.type === 'GET_RUN') return { run: { ...run } };
      if (message.type === 'GET_TEMPLATE') return { html: template };
      if (message.type === 'UPDATE') { Object.assign(run, message.patch); return { accepted: true, run: { ...run } }; }
      throw new Error(message.type);
    } },
    storage: { onChanged: { addListener() {} } }
  };
  d.window.eval(read('content.js'));
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(a.stage(), 'marketplace');
  assert.equal(run.status, 'running', 'options page must not be reported as missing contact data');
  await tick();
  assert.equal(selected, 1);
  assert.equal(listingClicks, 1);
  assert.equal(dealerClicks, 0);
  assert.equal(a.stage(), 'contact');
  assert.equal(run.status, 'running');
  d.window.close();
});

test('combobox selects a real option after dependent input events and verifies accepted state', async () => {
  const d = dom('<input role="combobox" id="make" aria-owns="options"><ul id="options" role="listbox"></ul>');
  const { document, FiestaAutomation: a } = d.window;
  const input = document.querySelector('input');
  let selected = false;
  input.addEventListener('input', () => {
    document.querySelector('ul').innerHTML = '<li role="option">Ford</li><li role="option">Ford Trucks</li>';
    document.querySelector('li').onclick = () => { selected = true; input.value = 'Ford'; };
  });
  await a.combo('#make', 'Ford');
  assert.equal(selected, true);
  assert.equal(input.value, 'Ford');
  d.window.close();
});

test('body selection reselects a typed label and unlocks fuel via the actual dropdown option', async () => {
  const d = dom('<input id="body" role="combobox" aria-owns="bodies" value="Kleinwagen, 5 Türen"><ul id="bodies" role="listbox" hidden></ul><input id="fuel" disabled>');
  const { document, FiestaAutomation: a } = d.window;
  const body = document.querySelector('#body');
  const list = document.querySelector('#bodies');
  let selections = 0;
  let inputEvents = 0;
  body.oninput = () => inputEvents++;
  body.onclick = () => {
    list.hidden = false;
    list.innerHTML = '<li role="option">Kleinwagen, 3 Türen</li><li role="option">Kleinwagen, 5 Türen</li>';
    list.lastElementChild.onmousedown = () => {
      selections++;
      document.querySelector('#fuel').disabled = false;
      list.hidden = true;
    };
  };
  await a.combo('#body', 'Kleinwagen, 5 Türen', [], { ready: () => !document.querySelector('#fuel').disabled });
  assert.equal(selections, 1);
  assert.equal(inputEvents, 0, 'use an existing option rather than filtering with the compound label');
  assert.equal(document.querySelector('#fuel').disabled, false);
  d.window.close();
});

test('body search uses the body name, handles button options, and accepts the no-comma display alias', async () => {
  const d = dom('<input id="body" role="combobox" aria-controls="bodies"><div id="bodies" role="listbox"></div><input id="fuel" disabled>');
  const { document, FiestaAutomation: a } = d.window;
  const body = document.querySelector('#body');
  const searches = [];
  body.oninput = () => {
    searches.push(body.value);
    if (body.value === 'Kleinwagen') {
      document.querySelector('#bodies').innerHTML = '<button>Kleinwagen 5 Türen</button>';
      document.querySelector('#bodies button').onclick = () => {
        body.value = 'Kleinwagen 5 Türen';
        document.querySelector('#fuel').disabled = false;
      };
    }
  };
  await a.combo('#body', 'Kleinwagen, 5 Türen', ['Kleinwagen 5 Türen'], {
    searchText: 'Kleinwagen', ready: () => !document.querySelector('#fuel').disabled
  });
  assert.deepEqual(searches, ['Kleinwagen']);
  assert.equal(body.value, 'Kleinwagen 5 Türen');
  assert.equal(document.querySelector('#fuel').disabled, false);
  d.window.close();
});

test('confirmed body selection is preserved when the next field is already enabled', async () => {
  const d = dom('<input id="body" role="combobox" value="Kleinwagen, 5 Türen"><input id="fuel">');
  let clicks = 0;
  d.window.document.querySelector('#body').onclick = () => clicks++;
  await d.window.FiestaAutomation.combo('#body', 'Kleinwagen, 5 Türen', [], {
    ready: () => !d.window.document.querySelector('#fuel').disabled
  });
  assert.equal(clicks, 0);
  d.window.close();
});

test('missing matching body option reports unconfirmed text and never selects a different door count', async () => {
  const d = dom('<input id="body" role="combobox" aria-owns="bodies" value="Kleinwagen, 5 Türen"><ul id="bodies" role="listbox"><li role="option">Kleinwagen, 3 Türen</li></ul><input id="fuel" disabled>');
  let wrongClicks = 0;
  d.window.document.querySelector('li').onclick = () => wrongClicks++;
  await assert.rejects(d.window.FiestaAutomation.combo('#body', 'Kleinwagen, 5 Türen', [], {
    ready: () => !d.window.document.querySelector('#fuel').disabled, timeout: 1000
  }), error => {
    assert.match(error.message, /noch nicht als Auswahl bestätigt/);
    assert.match(error.message, /Sichtbarer Feldtext: „Kleinwagen, 5 Türen“/);
    assert.match(error.message, /Angebotene Vorschläge: Kleinwagen, 3 Türen/);
    return true;
  });
  assert.equal(wrongClicks, 0);
  assert.equal(d.window.document.querySelector('#fuel').disabled, true);
  d.window.close();
});

test('live-style model combobox resets canceled suggestions even when its input is already focused', async () => {
  const d = dom('<div data-autosuggest="model"><div class="input-wrapper"><input id="model" role="combobox" aria-owns="models" aria-expanded="false" value="Fiesta"></div></div><button id="year" disabled>Jahr</button>');
  const { document, FiestaAutomation: a } = d.window;
  const input = document.querySelector('#model');
  const wrapper = input.closest('[data-autosuggest]');
  input.focus();
  let canceled = true;
  let focuses = 0;
  let pointerUps = 0;
  document.addEventListener('pointerup', () => { canceled = true; pointerUps++; });
  input.onfocus = () => {
    canceled = false;
    focuses++;
    const loader = document.createElement('span');
    loader.className = 'loader';
    wrapper.append(loader);
    d.window.setTimeout(() => {
      if (canceled) return;
      loader.remove();
      const list = document.createElement('ul');
      list.id = 'models';
      list.setAttribute('role', 'listbox');
      list.innerHTML = '<li role="option">Fiesta</li>';
      wrapper.append(list);
      input.setAttribute('aria-expanded', 'true');
      list.firstChild.onclick = () => {
        document.querySelector('#year').disabled = false;
        input.setAttribute('aria-expanded', 'false');
        list.remove();
      };
    }, 900);
  };
  let searches = 0;
  input.oninput = () => searches++;
  await a.combo('#model', 'Fiesta', [], { ready: () => !document.querySelector('#year').disabled });
  assert.equal(focuses, 1);
  assert.equal(searches, 0, 'do not mutate the search text while loading');
  assert.equal(pointerUps, 0, 'do not synthesize outside-cancel events');
  assert.equal(document.querySelector('#year').disabled, false);
  d.window.close();
});

test('an unchanged controlled search value is cleared and re-entered so its input handler runs', async () => {
  const d = dom('<div data-autosuggest="model"><input id="model" role="combobox" aria-owns="models" value="Fiesta"><ul id="models" role="listbox"></ul></div><input id="year" disabled>');
  const { document, FiestaAutomation: a } = d.window;
  const input = document.querySelector('#model');
  let trackedValue = input.value;
  const changes = [];
  input.oninput = () => {
    if (trackedValue === input.value) return;
    trackedValue = input.value;
    changes.push(input.value);
    if (input.value === 'Fiesta') {
      document.querySelector('ul').innerHTML = '<li role="option">Fiesta</li>';
      document.querySelector('li').onclick = () => { document.querySelector('#year').disabled = false; };
    }
  };
  await a.combo('#model', 'Fiesta', [], { ready: () => !document.querySelector('#year').disabled });
  assert.deepEqual(changes, ['', 'Fiesta']);
  assert.equal(document.querySelector('#year').disabled, false);
  d.window.close();
});

test('ongoing model loading reports loading rather than claiming the visible model was not selected', async () => {
  const d = dom('<div data-autosuggest="model"><input id="model" role="combobox" aria-expanded="false" value="Fiesta"><span class="loader" role="status"></span></div><input id="year" disabled>');
  const { document, FiestaAutomation: a } = d.window;
  let changes = 0;
  document.querySelector('#model').oninput = () => changes++;
  await assert.rejects(a.combo('#model', 'Fiesta', [], {
    ready: () => !document.querySelector('#year').disabled, timeout: 1000
  }), error => {
    assert.match(error.message, /lädt weiterhin die Vorschläge/);
    assert.doesNotMatch(error.message, /noch nicht als Auswahl bestätigt/);
    return true;
  });
  assert.equal(changes, 0);
  d.window.close();
});

test('stop check prevents writes and clicks while waiting for a dependent field', async () => {
  const d = dom('<input id="field" disabled>');
  let checks = 0;
  d.window.FiestaAutomation.setCheck(async () => {
    if (++checks >= 2) throw new d.window.DOMException('Stopped', 'AbortError');
  });
  await assert.rejects(d.window.FiestaAutomation.setValue('#field', 'new'), { name: 'AbortError' });
  assert.equal(d.window.document.querySelector('input').value, '');
  d.window.close();
});

test('vehicle workflow picks the complete Vignale catalog entry among identical model prefixes and proceeds to Weiter', async () => {
  const d = dom(read('autoscout24.de_sell_car_form_page_1.html'));
  const { document, FiestaAutomation: a, FiestaProfile: p } = d.window;
  const prefix = 'psuf-vehicle-insertion-form-';
  const values = {
    [prefix + 'select-make']: 'Ford',
    [prefix + 'select-model']: 'Fiesta',
    'first-registration-year-from-input': '2020',
    [prefix + 'first-registration-month-from-input']: '06',
    [prefix + 'select-body-type-and-doors']: 'Kleinwagen 5 Türen',
    [prefix + 'select-fuel-category']: 'Benzin',
    [prefix + 'select-transmission']: 'Automatik',
    [prefix + 'select-power']: '74 kW (101 PS)',
    [prefix + 'select-model-version']: 'Fiesta 1.0 EcoBoost S'
  };
  for (const [id, value] of Object.entries(values)) {
    const control = document.getElementById(id);
    control.disabled = false;
    if (control.matches('input')) control.value = value;
    else control.textContent = value;
  }
  const variant = document.getElementById(prefix + 'select-model-version');
  const mileage = document.getElementById(prefix + 'mileage');
  const next = document.getElementById(prefix + 'go-next-button-default');
  const trims = [
    'ST-LINE X (2019 - 2020)', 'TITANIUM X (2019 - 2020)',
    'ACTIVE X (2019 - 2020)', 'ACTIVE COLOURLINE (2018 - 2019)',
    'ACTIVE (2018 - 2020)', 'ACTIVE PLUS (2018 - 2019)',
    'ST-LINE (2017 - 2020)', 'VIGNALE (2017 - 2020)',
    'TITANIUM (2017 - 2020)', 'TREND (2017 - 2019)', 'COOL&CONNECT (2017 - 2020)'
  ];
  const list = document.createElement('ul');
  list.id = variant.getAttribute('aria-owns');
  list.setAttribute('role', 'listbox');
  let selected = null;
  trims.forEach((trim, index) => {
    const option = document.createElement('li');
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String(index === 1));
    const highlight = document.createElement('span');
    highlight.className = 'highlight-text';
    highlight.textContent = 'Fiesta 1.0 EcoBoost S';
    option.append(highlight, document.createTextNode('&S Aut. ' + trim));
    option.onclick = () => {
      selected = trim;
      variant.value = option.textContent;
      mileage.disabled = false;
      next.disabled = false;
      list.remove();
    };
    list.append(option);
  });
  document.body.append(list);
  let continued = false;
  next.onclick = () => {
    assert.equal(selected, 'VIGNALE (2017 - 2020)');
    assert.equal(mileage.value, '32.500');
    continued = true;
  };
  await a.initialVehicle(p.fromHTML(template));
  assert.equal(variant.value, 'Fiesta 1.0 EcoBoost S&S Aut. VIGNALE (2017 - 2020)');
  assert.equal(continued, true);
  d.window.close();
});

test('upload falls back without images if packaged files cannot be fetched', async () => {
  const d = dom(read('tests/fixtures/images-mini.html'));
  d.window.DataTransfer = class { constructor() { this.items = { add() {} }; } };
  d.window.chrome = { runtime: { getURL: file => 'chrome-extension://test/' + file } };
  d.window.fetch = async () => { throw new Error('Image unavailable'); };
  const patches = [];
  await d.window.FiestaAutomation.upload(d.window.FiestaProfile.fromHTML(template), { images: 'pending' }, async patch => patches.push(patch));
  assert.equal(patches.at(-1).images, 'skipped');
  d.window.close();
});

function worker() {
  const storage = {};
  let listener;
  let navigationCount = 0;
  let onUpdated;
  const chrome = {
    runtime: { onMessage: { addListener: callback => { listener = callback; } } },
    storage: { local: { get: async key => ({ [key]: storage[key] }), set: async data => { Object.assign(storage, data); } } },
    tabs: { get: async id => ({ id, url: 'https://www.autoscout24.de/auto-verkaufen/' }), update: async () => { navigationCount++; }, onRemoved: { addListener() {} }, onUpdated: { addListener: callback => { onUpdated = callback; } } }
  };
  const context = vm.createContext({ chrome, crypto: require('node:crypto').webcrypto, URL, console });
  vm.runInContext(read('background.js'), context);
  const send = (message, tabId) => new Promise(resolve => listener(message, tabId ? { tab: { id: tabId, url: 'https://www.autoscout24.de/' } } : {}, resolve));
  return { send, storage, navigations: () => navigationCount, navigate: (tabId, url) => onUpdated(tabId, { url }) };
}

test('worker serializes duplicate starts and rejects cross-tab or stale updates after stop', async () => {
  const w = worker();
  const [first, duplicate] = await Promise.all([w.send({ type: 'START', tabId: 1 }), w.send({ type: 'START', tabId: 1 })]);
  assert.equal(first.run.status, 'running');
  assert.ok(duplicate.error);
  assert.equal(w.navigations(), 1);
  const id = first.run.id;
  assert.equal((await w.send({ type: 'UPDATE', id, patch: { step: 4 } }, 2)).accepted, false);
  assert.equal((await w.send({ type: 'GET_RUN_FOR_TAB' }, 2)).mine, false);
  await w.send({ type: 'STOP' });
  assert.equal((await w.send({ type: 'UPDATE', id, patch: { status: 'running' } }, 1)).accepted, false);
  const resume = await w.send({ type: 'RESUME' });
  assert.notEqual(resume.run.id, id);
  await w.send({ type: 'UPDATE', id: resume.run.id, patch: { publishClicked: true } }, 1);
  await w.send({ type: 'STOP' });
  const afterPublish = await w.send({ type: 'RESUME' });
  assert.equal(afterPublish.run.publishClicked, true, 'resuming only the free completion must not re-publish');
  await w.send({ type: 'UPDATE', id: afterPublish.run.id, patch: { freeContinueClicked: true } }, 1);
  await w.send({ type: 'STOP' });
  assert.match((await w.send({ type: 'RESUME' })).error, /bereits angeklickt/);
});

test('publication navigation keeps the worker active until the free completion step', async () => {
  const w = worker();
  const { run } = await w.send({ type: 'START', tabId: 1 });
  await w.send({ type: 'UPDATE', id: run.id, patch: { publishClicked: true } }, 1);
  w.navigate(1, 'https://www.autoscout24.de/account/product-selection');
  const afterPublish = (await w.send({ type: 'GET_RUN' })).run;
  assert.equal(afterPublish.status, 'running');
  assert.equal(afterPublish.step, 6);
  await w.send({ type: 'UPDATE', id: run.id, patch: { freeContinueClicked: true } }, 1);
  w.navigate(1, 'https://www.autoscout24.de/account/listings');
  assert.equal((await w.send({ type: 'GET_RUN' })).run.status, 'submitted');
});

test('after document reload the final package page clicks only Kostenlos weiter with its checkpoint stored first', async () => {
  const d = dom(read('autoscout24.de_sell_car_form_page_4.html'), 'https://www.autoscout24.de/account/product-selection');
  const { document } = d.window;
  const run = { id: 'post-publication', tabId: 1, status: 'running', step: 5, publishClicked: true, freeContinueClicked: false };
  let clicks = 0;
  let paidClicks = 0;
  let tick;
  document.querySelector('[data-cy="product-selection-cta-button"]').onclick = () => paidClicks++;
  document.querySelector('[data-testid="productSelection-continueFree"]').onclick = event => {
    event.preventDefault();
    assert.equal(run.freeContinueClicked, true);
    assert.equal(run.step, 6);
    assert.equal(event.currentTarget.getAttribute('href'), '/account/listings');
    clicks++;
    document.body.innerHTML = '<h1>Meine Inserate</h1>';
  };
  d.window.setInterval = callback => { tick = callback; return 1; };
  d.window.chrome = {
    runtime: { sendMessage: async message => {
      if (message.type === 'GET_RUN_FOR_TAB') return { run: { ...run }, mine: true };
      if (message.type === 'GET_RUN') return { run: { ...run } };
      if (message.type === 'UPDATE') { Object.assign(run, message.patch); return { accepted: true, run: { ...run } }; }
      throw new Error('Unexpected request after publication: ' + message.type);
    } }, storage: { onChanged: { addListener() {} } }
  };
  d.window.eval(read('content.js'));
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.equal(clicks, 1);
  assert.equal(paidClicks, 0);
  assert.equal(run.status, 'submitted');
  await tick();
  assert.equal(clicks, 1, 'do not repeat the final click');
  d.window.close();
});

for (const storedImages of ['pending', 'uploaded']) {
test(`image step waits for all visible upload spinners even with ${storedImages} storage state`, async () => {
  const d = dom(read('tests/fixtures/images-mini.html'));
  const { document, FiestaProfile: p } = d.window;
  const profile = p.fromHTML(template);
  const cards = document.querySelector('#image-cards');
  profile.images.forEach((name, index) => {
    const card = document.createElement('div');
    card.className = 'SortableImage_imageContainer__test';
    card.innerHTML = `<div class="SortableImage_imageCard__test"><img alt="uploaded-${name}"><div class="SortableImage_controls__test"><p>Optimieren</p></div></div><button aria-label="Bild entfernen"></button>`;
    if (index === 0) {
      card.firstChild.classList.add('SortableImage_loadingWrapper__test');
      card.querySelector('img').classList.add('SortableImage_imageLoading__test');
      card.querySelector('p').textContent = 'Lädt';
      const spinner = document.createElement('span');
      spinner.className = 'sr-spinner-wrapper';
      spinner.setAttribute('role', 'status');
      card.firstChild.append(spinner);
    }
    cards.append(card);
  });
  const run = { id: 'images', tabId: 1, status: 'running', step: 4, completed: [], images: storedImages, publishClicked: false };
  let continued = false;
  let allFinished = false;
  document.querySelector('[data-testid="steps-continue-button"]').onclick = () => {
    assert.equal(allFinished, true);
    assert.equal(run.images, 'uploaded');
    continued = true;
    document.body.innerHTML = '<button data-testid="publish-button">Veröffentlichen</button>';
  };
  d.window.setInterval = () => 1;
  d.window.chrome = {
    runtime: { sendMessage: async message => {
      if (message.type === 'GET_RUN_FOR_TAB') return { run: { ...run }, mine: true };
      if (message.type === 'GET_RUN') return { run: { ...run } };
      if (message.type === 'GET_TEMPLATE') return { html: template };
      if (message.type === 'UPDATE') { Object.assign(run, message.patch); return { accepted: true, run: { ...run } }; }
      throw new Error(message.type);
    } }, storage: { onChanged: { addListener() {} } }
  };
  d.window.eval(read('content.js'));
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(continued, false, 'nine remove buttons do not mean the upload has finished');
  assert.match(run.message, /8\/9 fertig/);
  cards.firstChild.firstChild.classList.remove('SortableImage_loadingWrapper__test');
  cards.firstChild.querySelector('img').classList.remove('SortableImage_imageLoading__test');
  cards.firstChild.querySelector('p').textContent = 'Optimieren';
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(continued, false, 'the remaining spinner must still block navigation');
  cards.firstChild.querySelector('.sr-spinner-wrapper').remove();
  allFinished = true;
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal(continued, true);
  assert.equal(run.status, 'running');
  d.window.close();
});
}

test('stopping while image cards are uploading prevents the continuation click', async () => {
  const d = dom('<div class="SortableImage_imageContainer__test"><span class="sr-spinner-wrapper"></span><button aria-label="Bild entfernen"></button></div>');
  const { FiestaAutomation: a } = d.window;
  let checks = 0;
  a.setCheck(async () => { if (++checks >= 3) throw new d.window.DOMException('Stopped', 'AbortError'); });
  await assert.rejects(a.waitForImageUploads({ images: ['a.jpg'] }, async () => {}), { name: 'AbortError' });
  d.window.close();
});

for (const stackedWithoutButtons of [false, true]) {
test(`complete details workflow ${stackedWithoutButtons ? 'without section buttons' : 'with section buttons'} fills all sections and checkpoints before publishing once`, async () => {
  const d = dom(template);
  const { document, FiestaAutomation: a, FiestaProfile: p } = d.window;
  const run = { completed: [], images: 'pending', publishClicked: false };
  const visited = [];
  if (stackedWithoutButtons) {
    for (const [index, button] of [...document.querySelectorAll('[data-testid$="-continue-button"]')].entries()) {
      if (index % 2) button.hidden = true;
      else button.remove();
    }
    document.querySelector('#modelVersion').value = '';
    document.querySelector('#metallic').checked = false;
    document.querySelector('#emptyWeight').value = '';
  }
  for (const button of document.querySelectorAll('[data-testid^="sidebar-item-"]')) {
    button.addEventListener('click', () => visited.push(button.dataset.testid));
  }
  // jsdom has no editing engine: emulate the browser's native insertHTML command.
  document.execCommand = (command, ui, html) => {
    assert.equal(command, 'insertHTML');
    document.querySelector('#description').innerHTML = html;
    return true;
  };
  let publishes = 0;
  document.querySelector('[data-testid="publish-button"]').onclick = () => {
    assert.equal(run.publishClicked, true, 'checkpoint must precede publication');
    publishes++;
    const result = document.createElement('h1');
    result.textContent = 'Inserat erfolgreich veröffentlicht';
    document.body.append(result);
  };
  await a.details(p.fromHTML(template), run, async patch => Object.assign(run, patch));
  assert.equal(visited.length, 10);
  assert.equal(run.completed.length, 10);
  assert.equal(run.images, 'uploaded');
  assert.equal(run.status, 'done');
  assert.equal(publishes, 1);
  assert.equal(document.querySelector('#modelVersion').value, 'Fiesta 1.0 EcoBoost S');
  assert.equal(document.querySelector('#metallic').checked, true);
  assert.equal(document.querySelector('#emptyWeight').value, '1.216');
  assert.ok(document.querySelector('#description').textContent.includes('Kleines Loch im Beifahrersitz'));
  d.window.close();
});
}

test('a visible disabled section button is not skipped in the stacked detail layout', async () => {
  const d = dom(template);
  const { document, FiestaAutomation: a, FiestaProfile: p } = d.window;
  const run = { completed: ['characteristics', 'condition', 'equipment', 'motor', 'fuel', 'photos', 'description', 'financing-offer', 'contact'], images: 'uploaded', publishClicked: false };
  const next = document.querySelector('[data-testid="vehicle-continue-button"]');
  next.disabled = true;
  let nextClicks = 0;
  next.onclick = () => { nextClicks++; };
  d.window.setTimeout(() => { next.disabled = false; }, 600);
  document.querySelector('[data-testid="publish-button"]').onclick = () => {
    assert.equal(nextClicks, 1, 'wait for the visible button and click it before publishing');
  };
  await a.details(p.fromHTML(template), run, async patch => Object.assign(run, patch));
  assert.equal(nextClicks, 1);
  assert.ok(run.completed.includes('vehicle-data'));
  d.window.close();
});

test('invalid source-matching vehicle field reports the German label and is not checkpointed or published', async () => {
  const d = dom(template);
  const { document, FiestaAutomation: a, FiestaProfile: p } = d.window;
  document.querySelector('[data-testid="vehicle-continue-button"]').remove();
  document.querySelector('[role="combobox"][aria-labelledby="make"]').setAttribute('aria-invalid', 'true');
  const run = { completed: [], images: 'uploaded', publishClicked: false };
  await assert.rejects(a.details(p.fromHTML(template), run, async patch => Object.assign(run, patch)), error => {
    assert.match(error.message, /Abschnitt „Fahrzeugdaten“/);
    assert.match(error.message, /Marke/);
    return true;
  });
  assert.equal(run.completed.length, 0);
  assert.equal(run.publishClicked, false);
  d.window.close();
});
