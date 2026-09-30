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
  for (const file of [manifest.background.service_worker, manifest.action.default_popup, ...manifest.content_scripts[0].js]) assert.ok(fs.existsSync(path.join(root, file)), file);
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
  const expected = ['sell', 'vehicle', 'contact', 'price', 'images'];
  for (let i = 0; i <= 4; i++) {
    const d = dom(read(`autoscout24.de_sell_car_form_page_${i}.html`), i === 0 ? 'https://www.autoscout24.de/auto-verkaufen/' : undefined);
    assert.equal(d.window.FiestaAutomation.stage(), expected[i]);
    d.window.close();
  }
  const d = dom(template);
  assert.equal(d.window.FiestaAutomation.stage(), 'details');
  d.window.close();
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

test('upload falls back without images if packaged files cannot be fetched', async () => {
  const d = dom(read('autoscout24.de_sell_car_form_page_4.html'));
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
  const chrome = {
    runtime: { onMessage: { addListener: callback => { listener = callback; } } },
    storage: { local: { get: async key => ({ [key]: storage[key] }), set: async data => { Object.assign(storage, data); } } },
    tabs: { get: async id => ({ id, url: 'https://www.autoscout24.de/auto-verkaufen/' }), update: async () => { navigationCount++; }, onRemoved: { addListener() {} }, onUpdated: { addListener() {} } }
  };
  const context = vm.createContext({ chrome, crypto: require('node:crypto').webcrypto, URL, console });
  vm.runInContext(read('background.js'), context);
  const send = (message, tabId) => new Promise(resolve => listener(message, tabId ? { tab: { id: tabId, url: 'https://www.autoscout24.de/' } } : {}, resolve));
  return { send, storage, navigations: () => navigationCount };
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
  assert.match((await w.send({ type: 'RESUME' })).error, /bereits angeklickt/);
});

test('complete details workflow visits all sections, preserves rich description, and checkpoints before publishing once', async () => {
  const d = dom(template);
  const { document, FiestaAutomation: a, FiestaProfile: p } = d.window;
  const run = { completed: [], images: 'pending', publishClicked: false };
  const visited = [];
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
  assert.ok(document.querySelector('#description').textContent.includes('Kleines Loch im Beifahrersitz'));
  d.window.close();
});
