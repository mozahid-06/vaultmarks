import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('the stylesheets keep the hidden attribute authoritative', async () => {
  for (const path of ['src/library/library.css']) {
    const css = await read(path);
    assert.match(css, /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/i, `${path} must force [hidden] { display: none !important }`);
  }
});

test('library has no inline script or handlers and the wiring ids exist', async () => {
  const html = await read('src/library/library.html');
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  for (const id of [
    'onboarding', 'reconnect', 'sidebar', 'all', 'collections', 'search', 'list', 'empty',
    'new-bookmark', 'new-blank', 'settings', 'detail',
    'sort', 'tag-filter', 'confirm', 'confirm-heading', 'confirm-message', 'confirm-yes', 'confirm-no',
    'detail-title', 'detail-url', 'detail-description', 'detail-tags', 'detail-collection',
    'field-title', 'field-url', 'field-description', 'field-tags', 'detail-form-note',
    'detail-save', 'detail-cancel', 'detail-open', 'detail-edit', 'detail-delete',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test('the library page is the panel by default and has the panel wiring', async () => {
  const html = await read('src/library/library.html');
  assert.match(html, /<html[^>]*class="panel"/);
  for (const id of ['expand', 'open-settings', 'sidebar-header', 'search', 'new-bookmark', 'new-blank', 'save-page', 'detail-form-cover']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test('the panel pins its chrome and scrolls only the list', async () => {
  const css = await read('src/library/library.css');
  assert.match(css, /html\.panel \.main\s*\{[^}]*overflow:\s*hidden/i);
  assert.match(css, /html\.panel #list\s*\{[^}]*overflow-y:\s*auto/i);
});

test('long unbroken strings wrap inside a bookmark row', async () => {
  const css = await read('src/library/library.css');
  assert.match(css, /\.row-title\s*\{[^}]*overflow-wrap:\s*anywhere/i);
  assert.match(css, /\.row-meta\s*\{[^}]*overflow-wrap:\s*anywhere/i);
});

test('the panel list reaches the popup bottom', async () => {
  const css = await read('src/library/library.css');
  assert.match(css, /html\.panel \.main\s*\{[^}]*padding-bottom:\s*0/);
});
