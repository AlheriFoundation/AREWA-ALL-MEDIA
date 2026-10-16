import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('css/style.css', 'utf8');
const app = fs.readFileSync('js/app.js', 'utf8');

test('homepage exposes skip navigation and a main target', () => {
  assert.match(html, /class="skip-link" href="#main-content"/);
  assert.match(html, /<main id="main-content">/);
});

test('focus-visible styling and mobile menu keyboard behavior exist', () => {
  assert.match(css, /:focus-visible/);
  assert.match(app, /event\.key === 'Escape'/);
  assert.match(app, /event\.target\.closest\('a'\)/);
});

test('frontend separates social inspection from direct-file downloading', () => {
  assert.match(app, /fetch\('\/api\/inspect'/);
  assert.match(app, /fetch\('\/api\/download'/);
  assert.match(app, /response\.blob\(\)/);
  assert.match(app, /Facebook link recognized\. Direct Facebook video and Reel downloads are not currently supported\./);
  assert.match(app, /response\.json\(\)\.catch\(\(\) => \(\{\}\)\)/);
  assert.match(app, /catch \(error\) \{ showToast\(error\.message/);
  assert.match(app, /finally \{ button\.disabled = false/);
  assert.match(html, /Direct downloads work only for approved HTTPS file hosts/);
  assert.equal((html.match(/download unavailable/g) || []).length, 6);
});
