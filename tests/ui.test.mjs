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
  assert.match(html, /Direct downloads work only for approved HTTPS file hosts/);
  assert.equal((html.match(/download unavailable/g) || []).length, 6);
});
