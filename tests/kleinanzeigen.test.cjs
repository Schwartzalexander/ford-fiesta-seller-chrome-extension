const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
const snapshot = name => {
  const buffer = fs.readFileSync(path.resolve(__dirname, '..', `kleinanzeigen.de_sell_car_form_${name}.html`));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { return new TextDecoder('windows-1252').decode(buffer); }
};
function dom(html = '') {
  const d = new JSDOM(html, { url: 'https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = d.window;
  w.HTMLElement.prototype.getClientRects = function () { return [1]; };
  w.HTMLElement.prototype.scrollIntoView = function () {};
  for (const script of ['platforms.js', 'profile.js', 'automation.js', 'kleinanzeigen.js']) w.eval(read(script));
  return d;
}
const dataFor = d => d.window.FiestaKleinanzeigen.fromProfile(d.window.FiestaProfile.fromHTML(read('autoscout24-form-filled.html')));
function choices(d, data) {
  const doc = d.window.document;
  // Model the controlled textarea's empty-state flag as well as its DOM value.
  const description = doc.querySelector('#ad-description');
  if (description) description.oninput = () => { description.dataset.empty = String(!description.value); };
  for (const [key, labels] of data.selects) {
    const button = doc.getElementById(key);
    if (!button) continue;
    button.onclick = () => {
      doc.querySelectorAll('[role="listbox"]').forEach(list => list.remove());
      const list = doc.createElement('ul');
      list.setAttribute('role', 'listbox');
      button.setAttribute('aria-expanded', 'true');
      // Exercise platform-specific display alternatives instead of exact AS24 labels.
      const label = key === 'autos.material_innenausstattung' ? 'Leder' : key === 'autos.schadstoffklasse' ? 'Euro 6' : key === 'autos.anzahl_tueren' ? '4/5' : labels[0];
      const option = doc.createElement('li');
      option.setAttribute('role', 'option');
      option.textContent = label;
      option.onclick = () => {
        const selectedId = button.getAttribute('aria-labelledby').split(' ').find(id => id.endsWith('-selected-option'));
        doc.getElementById(selectedId).textContent = label;
        button.setAttribute('aria-expanded', 'false');
        list.remove();
      };
      list.append(option);
      doc.body.append(list);
    };
  }
}

test('all Kleinanzeigen snapshot stages and common vehicle data are recognized without losing known defects', () => {
  for (const [name, expected] of [['page_0', 'form'], ['kategorie', 'category'], ['page_1', 'details'], ['page_2', 'package']]) {
    const d = dom(snapshot(name));
    assert.equal(d.window.FiestaKleinanzeigen.stage(), expected);
    d.window.close();
  }
  const d = dom();
  const data = dataFor(d);
  assert.equal(data.title, 'Ford Fiesta Vignale 1,0 l EcoBoost Automatik - Top Ausstattung');
  assert.equal(data.title.length, 62);
  assert.equal(data.inputs['ad-price-amount'], '14500');
  assert.equal(data.inputs['autos.power'], '101');
  assert.equal(data.inputs['autos.km'], '32500');
  assert.ok(data.description.length <= 4000);
  assert.ok(data.description.includes('Kratzer im hinteren rechten Seitenteil'));
  assert.ok(data.description.includes('Kleines Loch im Beifahrersitz'));
  assert.equal(data.description, d.window.FiestaKleinanzeigen.plainDescription(d.window.FiestaProfile.fromHTML(read('autoscout24-form-filled.html')).descriptionHTML));
  assert.ok(!data.description.includes('Kontakt:'));
  assert.ok(!data.description.includes('Schadstoffklasse:'));
  assert.ok(data.description.includes('\n- '));
  assert.equal(data.checks['autos.park_assistant'], true);
  assert.equal(data.checks['autos.trailer_coupling'], false);
  assert.equal(data.checks['autos.sunroof'], false);
  d.window.close();
});

test('Kleinanzeigen form filling uses platform comboboxes, source equipment and the existing account name', async () => {
  const d = dom(snapshot('page_1'));
  const data = dataFor(d);
  choices(d, data);
  await d.window.FiestaKleinanzeigen.fill(data);
  const doc = d.window.document;
  assert.equal(doc.querySelector('#ad-title').value, data.title);
  assert.equal(doc.getElementById('autos.km').value, '32500');
  assert.equal(doc.getElementById('autos.power').value, '101');
  assert.equal(doc.querySelector('#ad-price-amount').value, '14500');
  assert.equal(doc.querySelector('#ad-name').value, 'Alexander Schwartz');
  assert.equal(doc.querySelector('#ad-address-visibility').checked, false);
  assert.equal(doc.querySelector('#ad-marketing-consent').checked, false);
  assert.equal(doc.getElementById('autos.material_innenausstattung-selected-option').textContent, 'Leder');
  assert.equal(doc.getElementById('autos.schadstoffklasse-selected-option').textContent, 'Euro 6');
  assert.equal(doc.getElementById('autos.abs').checked, true);
  assert.equal(doc.getElementById('autos.full_service_history').checked, true);
  assert.equal(doc.querySelector('#ad-description').value, data.description);
  d.window.close();
});

test('category selection validates the Ford Fiesta suggestion and waits for the new form fields', async () => {
  const d = dom(snapshot('kategorie'));
  const doc = d.window.document;
  doc.querySelector('label[for="ad-category-picker-216"]').onclick = () => { doc.body.innerHTML = snapshot('page_1'); };
  await d.window.FiestaKleinanzeigen.category();
  assert.equal(doc.querySelector('[name="categoryId"]').value, '216');
  assert.ok(doc.getElementById('autos.km'));
  d.window.close();
});

test('unexpected category and missing vehicle data stop with specific messages', async () => {
  const d = dom(snapshot('kategorie'));
  d.window.document.querySelector('label[for="ad-category-picker-216"]').textContent = 'Autoteile';
  await assert.rejects(d.window.FiestaKleinanzeigen.category(), /entspricht nicht Ford Fiesta/);
  const p = d.window.FiestaProfile.fromHTML(read('autoscout24-form-filled.html'));
  p.fields = p.fields.filter(field => !field.selector.includes('"powerPS"'));
  assert.throws(() => d.window.FiestaKleinanzeigen.fromProfile(p), /Es fehlen Fahrzeugdaten.*powerPS/);
  d.window.close();
});

test('Kleinanzeigen upload waits for server image records and spinner removal, not just preview buttons', async () => {
  const d = dom(snapshot('page_0'));
  const { document: doc } = d.window;
  const data = dataFor(d);
  let submittedFiles;
  d.window.DataTransfer = class {
    constructor() { this.files = []; this.items = { add: file => this.files.push(file) }; }
  };
  d.window.chrome = { runtime: { getURL: file => 'chrome-extension://test/' + file } };
  d.window.fetch = async () => ({ ok: true, blob: async () => new d.window.Blob(['jpeg'], { type: 'image/jpeg' }) });
  const input = doc.querySelector('input[type="file"]');
  Object.defineProperty(input, 'files', { writable: true, value: [] });
  const cards = doc.createElement('div');
  doc.body.append(cards);
  input.onchange = () => {
    submittedFiles = input.files;
    input.files.forEach((file, index) => {
      const card = doc.createElement('div');
      card.innerHTML = `<img alt="${file.name}"><button aria-label="Bild entfernen"></button><span class="animate-spin"></span><input type="hidden" name="adImages[${index}].url" value="">`;
      cards.append(card);
    });
  };
  let uploaded = false;
  const promise = d.window.FiestaKleinanzeigen.upload(data, { images: 'pending' }, async patch => { if (patch.images === 'uploaded') uploaded = true; });
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(submittedFiles.length, 9);
  assert.equal(submittedFiles.at(-1).name, 'Mängel.jpg');
  assert.equal(uploaded, false);
  cards.querySelectorAll('input').forEach((field, index) => { field.value = `https://img.kleinanzeigen.de/image-${index}`; });
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(uploaded, false, 'server records do not bypass a visible loading indicator');
  cards.querySelectorAll('.animate-spin').forEach(spinner => spinner.remove());
  await promise;
  assert.equal(uploaded, true);
  d.window.close();
});

test('Basis package publication rejects Plus and checkpoints before submitting once', async () => {
  const d = dom(snapshot('page_2'));
  const doc = d.window.document;
  const basic = [...doc.querySelectorAll('button[role="radio"]')].find(button => button.textContent === 'Basis Paket');
  const plus = [...doc.querySelectorAll('button[role="radio"]')].find(button => button.textContent === 'Plus Paket');
  basic.setAttribute('aria-checked', 'false');
  plus.setAttribute('aria-checked', 'true');
  basic.onclick = () => { basic.setAttribute('aria-checked', 'true'); plus.setAttribute('aria-checked', 'false'); };
  plus.onclick = () => { throw new Error('Plus must never be selected'); };
  const run = { publishClicked: false };
  let submits = 0;
  [...doc.querySelectorAll('button')].find(button => button.textContent === 'Anzeige aufgeben').onclick = () => {
    assert.equal(basic.getAttribute('aria-checked'), 'true');
    assert.equal(run.publishClicked, true);
    submits++;
    doc.body.innerHTML = '<h1>Anzeige erfolgreich aufgegeben</h1>';
  };
  await d.window.FiestaKleinanzeigen.publish(run, async patch => Object.assign(run, patch));
  assert.equal(submits, 1);
  assert.equal(run.status, 'done');
  assert.equal(run.step, 3);
  d.window.close();
});

test('Kleinanzeigen content script on the package page publishes without re-entering the form', async () => {
  const d = dom(snapshot('page_2'));
  const doc = d.window.document;
  const run = { id: 'k', platform: 'kleinanzeigen', tabId: 1, status: 'running', step: 2, formSubmitted: true, publishClicked: false, completed: [], images: 'uploaded' };
  let tick;
  let submits = 0;
  [...doc.querySelectorAll('button')].find(button => button.textContent === 'Anzeige aufgeben').onclick = () => { submits++; doc.body.innerHTML = '<h1>Anzeige erfolgreich aufgegeben</h1>'; };
  d.window.setInterval = callback => { tick = callback; return 1; };
  d.window.chrome = { runtime: { sendMessage: async request => {
    if (request.type === 'GET_RUN_FOR_TAB') return { run: { ...run }, mine: true };
    if (request.type === 'GET_RUN') return { run: { ...run } };
    if (request.type === 'UPDATE') { Object.assign(run, request.patch); return { accepted: true, run: { ...run } }; }
    throw new Error('Unexpected form request: ' + request.type);
  } }, storage: { onChanged: { addListener() {} } } };
  d.window.eval(read('kleinanzeigen-content.js'));
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.equal(submits, 1);
  assert.equal(run.status, 'done');
  await tick();
  assert.equal(submits, 1);
  d.window.close();
});

test('platform registry rejects lookalike hosts and provides distinct workflow entry URLs', () => {
  const d = dom();
  const p = d.window.FiestaPlatforms;
  assert.equal(p.detect('https://www.kleinanzeigen.de/'), 'kleinanzeigen');
  assert.equal(p.detect('https://www.autoscout24.de/'), 'autoscout24');
  assert.equal(p.detect('https://www.kleinanzeigen.de.evil.example/'), null);
  assert.equal(p.detect('http://www.kleinanzeigen.de/'), null);
  assert.equal(p.configs.kleinanzeigen.lastStep, 3);
  assert.equal(p.configs.kleinanzeigen.startUrl, 'https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html');
  d.window.close();
});

test('full Kleinanzeigen content workflow passes title, category, vehicle data and next-step checkpoint into Basis publication', async () => {
  const d = dom(snapshot('page_0'));
  const { document: doc, FiestaKleinanzeigen: k } = d.window;
  const data = dataFor(d);
  const run = { id: 'full-k', platform: 'kleinanzeigen', tabId: 1, status: 'running', step: 0, formSubmitted: false, publishClicked: false, completed: [], images: 'pending' };
  let nextClicks = 0;
  let publishes = 0;
  k.upload = async (profile, current, update) => {
    profile.images.forEach((name, index) => {
      const card = doc.createElement('div');
      card.innerHTML = `<button aria-label="Bild entfernen"></button><input type="hidden" name="adImages[${index}].url" value="https://img.kleinanzeigen.de/test-${index}">`;
      doc.body.append(card);
    });
    await k.waitImages(profile, update);
    await update({ images: 'uploaded' });
  };
  doc.querySelector('#ad-title').oninput = () => {
    if (doc.querySelector('#ad-category-picker-216')) return;
    const suggestion = doc.createElement('div');
    suggestion.innerHTML = snapshot('kategorie');
    doc.body.append(suggestion);
    doc.querySelector('label[for="ad-category-picker-216"]').onclick = () => {
      doc.body.innerHTML = snapshot('page_1');
      choices(d, data);
      [...doc.querySelectorAll('button')].find(button => button.textContent === 'Nächster Schritt').onclick = () => {
        assert.equal(run.formSubmitted, true);
        assert.equal(doc.querySelector('#ad-price-amount').value, '14500');
        assert.equal(doc.querySelector('#ad-title').value, data.title);
        assert.equal(doc.getElementById('autos.power').value, '101');
        assert.ok(doc.querySelector('#ad-description').value.includes('Kleines Loch im Beifahrersitz'));
        nextClicks++;
        doc.body.innerHTML = snapshot('page_2');
        [...doc.querySelectorAll('button')].find(button => button.textContent === 'Anzeige aufgeben').onclick = () => {
          assert.equal(run.publishClicked, true);
          publishes++;
          doc.body.innerHTML = '<h1>Anzeige erfolgreich aufgegeben</h1>';
        };
      };
    };
  };
  d.window.setInterval = () => 1;
  d.window.chrome = { runtime: { sendMessage: async request => {
    if (request.type === 'GET_RUN_FOR_TAB') return { run: { ...run }, mine: true };
    if (request.type === 'GET_RUN') return { run: { ...run } };
    if (request.type === 'GET_TEMPLATE') return { html: read('autoscout24-form-filled.html') };
    if (request.type === 'UPDATE') { Object.assign(run, request.patch); return { accepted: true, run: { ...run } }; }
    throw new Error(request.type);
  } }, storage: { onChanged: { addListener() {} } } };
  d.window.eval(read('kleinanzeigen-content.js'));
  const until = Date.now() + 20000;
  while (run.status === 'running' && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(run.status, 'done', run.message);
  assert.equal(nextClicks, 1);
  assert.equal(publishes, 1);
  assert.equal(run.completed.length, 4);
  assert.equal(run.images, 'uploaded');
  d.window.close();
});

test('popup detects Kleinanzeigen and sends its provider when starting the three-step workflow', async () => {
  const d = new JSDOM(read('popup.html'), { runScripts: 'outside-only' });
  const run = { platform: 'kleinanzeigen', tabId: 1, status: 'stopped', step: 2, message: 'Stopped', publishClicked: false };
  const commands = [];
  d.window.chrome = {
    runtime: { sendMessage: async request => { commands.push(request); return { run }; } },
    tabs: { query: async () => [{ id: 1, url: 'https://www.kleinanzeigen.de/' }] },
    storage: { local: { get: async () => ({}) }, onChanged: { addListener() {} } }
  };
  d.window.eval(read('platforms.js'));
  d.window.eval(read('popup.js'));
  await new Promise(resolve => setTimeout(resolve, 0));
  const doc = d.window.document;
  assert.equal(doc.querySelector('#start').textContent, 'Auf Kleinanzeigen inserieren');
  assert.equal(doc.querySelector('#start').hidden, false);
  assert.equal(doc.querySelector('#open-platform').hidden, true);
  assert.equal(doc.querySelector('#open-kleinanzeigen').hidden, true);
  assert.equal(doc.querySelector('#resume').hidden, false);
  assert.equal(doc.querySelector('#bar').max, 4);
  assert.match(doc.querySelector('#step').textContent, /Kleinanzeigen.*2\/3/);
  doc.querySelector('#start').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(commands.at(-1).type, 'START');
  assert.equal(commands.at(-1).platform, 'kleinanzeigen');
  d.window.close();
});

test('description accepts harmless textarea newline normalization without losing wording or defects', async () => {
  const d = dom(snapshot('page_1'));
  const data = dataFor(d);
  const field = d.window.document.querySelector('#ad-description');
  field.oninput = () => { field.dataset.empty = 'false'; };
  field.onblur = () => { field.value = field.value.split('\n').map(line => line.trim()).join('\n').replace(/\n{2,}/g, '\n'); };
  await d.window.FiestaKleinanzeigen.setInput('ad-description', data.description);
  assert.notEqual(field.value, data.description, 'the site has normalized blank lines');
  assert.equal(d.window.FiestaKleinanzeigen.descriptionMatches(data.description), true);
  assert.ok(field.value.includes('Kleines Loch im Beifahrersitz'));
  assert.ok(!field.value.includes('Kontakt:'));
  d.window.close();
});

test('description waits for the controlled state commit and checks a replacement textarea', async () => {
  const d = dom(snapshot('page_1'));
  const data = dataFor(d);
  const doc = d.window.document;
  const oldField = doc.querySelector('#ad-description');
  let pending = '';
  oldField.oninput = () => {
    pending = oldField.value;
    d.window.setTimeout(() => {
      const replacement = oldField.cloneNode(false);
      replacement.value = pending;
      replacement.dataset.empty = String(!pending);
      oldField.replaceWith(replacement);
    }, 150);
  };
  oldField.onblur = () => { pending = ''; };
  await d.window.FiestaKleinanzeigen.setDescription(data.description);
  assert.equal(oldField.isConnected, false);
  assert.equal(doc.querySelector('#ad-description').value, data.description);
  assert.equal(d.window.FiestaKleinanzeigen.descriptionMatches(data.description), true);
  d.window.close();
});

test('checkboxes are completed before a rejected description and the new failure explains the current field state', async () => {
  const d = dom(snapshot('page_1'));
  const data = dataFor(d);
  data.selects = [];
  const field = d.window.document.querySelector('#ad-description');
  field.oninput = () => { field.dataset.empty = 'false'; };
  field.onblur = () => { field.value = ''; field.dataset.empty = 'true'; };
  await assert.rejects(d.window.FiestaKleinanzeigen.fill(data), error => {
    assert.match(error.message, /vollständige Beschreibung nicht gespeichert/);
    assert.match(error.message, /0 Zeichen im aktuellen Feld/);
    return true;
  });
  for (const [key, expected] of Object.entries(data.checks)) {
    assert.equal(d.window.document.getElementById(key).checked, expected, key);
  }
  assert.equal(d.window.document.querySelector('#ad-title').value, data.title);
  d.window.close();
});

test('a populated DOM-only textarea does not pass while the controlled empty-state flag remains true', async () => {
  const d = dom(snapshot('page_1'));
  const data = dataFor(d);
  const field = d.window.document.querySelector('#ad-description');
  field.value = data.description;
  assert.equal(d.window.FiestaKleinanzeigen.descriptionMatches(data.description), false);
  d.window.document.execCommand = (command, ui, value) => {
    assert.equal(command, 'insertText');
    field.value = value;
    field.dataset.empty = 'false';
    return true;
  };
  await d.window.FiestaKleinanzeigen.setDescription(data.description);
  assert.equal(d.window.FiestaKleinanzeigen.descriptionMatches(data.description), true);
  d.window.close();
});

test('final field verification repairs a lost description and checkbox after an asynchronous form re-render', async () => {
  const d = dom(snapshot('page_1'));
  const data = dataFor(d);
  choices(d, data);
  await d.window.FiestaKleinanzeigen.fill(data);
  const doc = d.window.document;
  doc.querySelector('#ad-description').value = '';
  doc.querySelector('#ad-description').dataset.empty = 'true';
  doc.getElementById('autos.abs').checked = false;
  await d.window.FiestaKleinanzeigen.verifyFields(data);
  assert.equal(doc.getElementById('autos.abs').checked, true);
  assert.equal(d.window.FiestaKleinanzeigen.descriptionMatches(data.description), true);
  d.window.close();
});

test('Kleinanzeigen can remove the two-code-unit magnifier without rejecting complete description wording', async () => {
  const d = dom(snapshot('page_1'));
  const data = dataFor(d);
  const field = d.window.document.querySelector('#ad-description');
  field.oninput = () => {
    field.value = field.value.replace('🔎', '');
    field.dataset.empty = 'false';
  };
  await d.window.FiestaKleinanzeigen.setDescription(data.description);
  assert.equal(field.value.length, data.description.length - 2);
  assert.equal(d.window.FiestaKleinanzeigen.descriptionMatches(data.description), true);
  assert.ok(field.value.includes('Kratzer im hinteren rechten Seitenteil'));
  assert.ok(field.value.includes('Kleines Loch im Beifahrersitz'));
  assert.ok(!field.value.includes('Kontakt:'));
  assert.ok(!field.value.includes('Schadstoffklasse:'));
  field.value = field.value.replace('Kleines Loch im Beifahrersitz', 'Kleines im Beifahrersitz');
  assert.equal(d.window.FiestaKleinanzeigen.descriptionMatches(data.description), false, 'missing defect wording must not be accepted');
  d.window.close();
});

test('resume replaces the earlier description that contained automatically appended contact and emissions lines', async () => {
  const d = dom(snapshot('page_1'));
  const data = dataFor(d);
  const field = d.window.document.querySelector('#ad-description');
  field.value = data.description + '\n\nKontakt: 01715432107\nSchadstoffklasse: Euro 6d-TEMP';
  field.dataset.empty = 'false';
  assert.equal(d.window.FiestaKleinanzeigen.descriptionMatches(data.description), false);
  await d.window.FiestaKleinanzeigen.setDescription(data.description);
  assert.equal(field.value, data.description);
  assert.equal(d.window.FiestaKleinanzeigen.descriptionMatches(data.description), true);
  d.window.close();
});

function activateBasicButton(d, basic) {
  basic.onclick = () => {
    for (const radio of d.window.document.querySelectorAll('button[role="radio"]')) radio.setAttribute('aria-checked', String(radio === basic));
    const submit = d.window.document.querySelector('#package-submit');
    submit.textContent = 'Anzeige aufgeben';
    submit.setAttribute('aria-disabled', 'false');
  };
}

test('unselected package view waits for Astro hydration before choosing Basis and its changing final button label', async () => {
  const d = dom(read('tests/fixtures/kleinanzeigen-package-unselected.html'));
  const doc = d.window.document;
  const island = doc.querySelector('astro-island');
  island.setAttribute('ssr', '');
  let preHydrationClicks = 0;
  let selected = 0;
  let publishes = 0;
  const original = doc.querySelector('#basic-card button');
  original.onclick = () => preHydrationClicks++;
  doc.querySelector('#plus-card button').onclick = () => { throw new Error('Plus must not be selected'); };
  const run = { publishClicked: false };
  doc.querySelector('#package-submit').onclick = () => {
    assert.equal(run.publishClicked, true);
    assert.equal(d.window.FiestaKleinanzeigen.basicSelected(), true);
    publishes++;
    doc.body.innerHTML = '<h1>Anzeige erfolgreich aufgegeben</h1>';
  };
  d.window.setTimeout(() => {
    island.removeAttribute('ssr');
    const replacement = original.cloneNode(true);
    original.replaceWith(replacement);
    activateBasicButton(d, replacement);
    replacement.addEventListener('click', () => selected++);
  }, 800);
  await d.window.FiestaKleinanzeigen.publish(run, async patch => Object.assign(run, patch));
  assert.equal(preHydrationClicks, 0);
  assert.equal(selected, 1);
  assert.equal(publishes, 1);
  assert.equal(run.status, 'done');
  d.window.close();
});

test('a lost first package click is retried on the replacement button without repeating publication', async () => {
  const d = dom(read('tests/fixtures/kleinanzeigen-package-unselected.html'));
  const doc = d.window.document;
  const original = doc.querySelector('#basic-card button');
  let lostClicks = 0;
  let confirmedClicks = 0;
  let publishes = 0;
  original.onclick = () => {
    lostClicks++;
    const replacement = original.cloneNode(true);
    original.replaceWith(replacement);
    activateBasicButton(d, replacement);
    replacement.addEventListener('click', () => confirmedClicks++);
  };
  doc.querySelector('#package-submit').onclick = () => { publishes++; doc.body.innerHTML = '<h1>Anzeige erfolgreich aufgegeben</h1>'; };
  const run = { publishClicked: false };
  await d.window.FiestaKleinanzeigen.publish(run, async patch => Object.assign(run, patch));
  assert.equal(lostClicks, 1);
  assert.equal(confirmedClicks, 1);
  assert.equal(publishes, 1);
  assert.equal(run.publishClicked, true);
  assert.equal(original.isConnected, false);
  d.window.close();
});

test('already selected Basis is preserved and the disabled Weiter button is never clicked', async () => {
  const d = dom(read('tests/fixtures/kleinanzeigen-package-unselected.html'));
  const doc = d.window.document;
  const basic = doc.querySelector('#basic-card button');
  basic.setAttribute('aria-checked', 'true');
  basic.onclick = () => { throw new Error('Do not reselect an already confirmed Basis package'); };
  let earlySubmits = 0;
  doc.querySelector('#package-submit').onclick = () => earlySubmits++;
  d.window.setTimeout(() => {
    const submit = doc.querySelector('#package-submit');
    submit.textContent = 'Anzeige aufgeben';
    submit.setAttribute('aria-disabled', 'false');
    submit.onclick = () => { doc.body.innerHTML = '<h1>Anzeige erfolgreich aufgegeben</h1>'; };
  }, 400);
  const run = { publishClicked: false };
  await d.window.FiestaKleinanzeigen.publish(run, async patch => Object.assign(run, patch));
  assert.equal(earlySubmits, 0);
  assert.equal(run.status, 'done');
  d.window.close();
});

test('if package selection changes after the checkpoint, submission is canceled and can still be resumed', async () => {
  const d = dom(snapshot('page_2'));
  const doc = d.window.document;
  const basic = [...doc.querySelectorAll('button[role="radio"]')].find(button => button.textContent === 'Basis Paket');
  const plus = [...doc.querySelectorAll('button[role="radio"]')].find(button => button.textContent === 'Plus Paket');
  const run = { publishClicked: false };
  let publishes = 0;
  [...doc.querySelectorAll('button')].find(button => button.textContent === 'Anzeige aufgeben').onclick = () => publishes++;
  await assert.rejects(d.window.FiestaKleinanzeigen.publish(run, async patch => {
    Object.assign(run, patch);
    if (patch.publishClicked === true) { basic.setAttribute('aria-checked', 'false'); plus.setAttribute('aria-checked', 'true'); }
  }), /Paket-Auswahl hat sich vor dem Absenden geändert/);
  assert.equal(publishes, 0);
  assert.equal(run.publishClicked, false);
  d.window.close();
});
