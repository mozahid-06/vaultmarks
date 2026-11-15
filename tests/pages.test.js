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

test('library has no inline script or handlers and the wiring ids exist', async () => {
  const html = await read('src/library/library.html');
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  for (const id of ['onboarding', 'reconnect', 'sidebar', 'all', 'collections', 'search', 'list', 'empty', 'new-bookmark', 'settings', 'detail']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});
