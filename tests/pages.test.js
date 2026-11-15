import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('popup has no inline script or handlers and the wiring ids exist', async () => {
  const html = await read('src/popup/popup.html');
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  for (const id of ['setup', 'form', 'cover', 'title', 'url', 'description', 'tags', 'collection', 'save', 'status']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test('the stylesheets keep the hidden attribute authoritative', async () => {
  for (const path of ['src/popup/popup.css', 'src/library/library.css']) {
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
    'new-bookmark', 'settings', 'detail',
    'detail-title', 'detail-url', 'detail-description', 'detail-tags', 'detail-collection',
    'detail-save', 'detail-cancel', 'detail-open', 'detail-edit', 'detail-delete',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test('the library page is the panel by default and has the panel wiring', async () => {
  const html = await read('src/library/library.html');
  assert.match(html, /<html[^>]*class="panel"/);
  for (const id of ['expand', 'open-settings', 'sidebar-header', 'search', 'new-bookmark', 'save-page', 'detail-form-cover']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});
