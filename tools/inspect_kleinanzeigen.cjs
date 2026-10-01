// Inspect supplied offline form fragments; never execute captured page scripts.
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const decode = file => {
  const buffer = fs.readFileSync(file);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { return new TextDecoder('windows-1252').decode(buffer); }
};
for (const file of process.argv.slice(2)) {
  const doc = new JSDOM(decode(file)).window.document;
  console.log('\nFILE', file);
  for (const control of doc.querySelectorAll('input:not([type=hidden]), textarea, button[role=combobox]')) {
    if (control.id) console.log(control.id, JSON.stringify(control.parentElement.parentElement.textContent.replace(/\s+/g, ' ').trim().slice(0, 220)));
  }
  console.log('Options', [...doc.querySelectorAll('[role=option]')].map(el => el.textContent.trim()));
  for (const button of doc.querySelectorAll('button[role=radio]')) console.log('Package', button.textContent, button.parentElement.textContent.replace(/\s+/g, ' ').trim().slice(0, 500));
  const imageButton = doc.querySelector('button[aria-label="Bild entfernen"]');
  if (imageButton) console.log('Image card', imageButton.parentElement.outerHTML.slice(0, 2500));
  const editor = doc.querySelector('#description');
  if (editor) console.log('AS24 description plain text length', editor.textContent.length);
}
