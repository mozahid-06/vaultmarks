import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMeta, isSavableUrl, savePrefill } from '../src/lib/capture.js';

test('normalizeMeta resolves images, caps descriptions and falls back to the host', () => {
  const meta = normalizeMeta({
    title: '   ',
    url: 'https://example.com/a',
    description: ' d '.repeat(600),
    image: '/cover.png',
    favicon: 'data:image/png;base64,x',
  }, 'https://example.com/a');
  assert.equal(meta.title, 'example.com');
  assert.equal(meta.image, 'https://example.com/cover.png');
  assert.equal(meta.description.length, 1000);
  assert.equal(meta.favicon, 'https://example.com/favicon.ico');
});

test('normalizeMeta keeps an http favicon and trims the title', () => {
  const meta = normalizeMeta({
    title: '  A   page ', url: 'https://example.com', description: 'Hi',
    image: 'https://cdn.example.com/i.png', favicon: 'https://example.com/icon.png',
  }, 'https://example.com');
  assert.equal(meta.title, 'A page');
  assert.equal(meta.favicon, 'https://example.com/icon.png');
  assert.equal(meta.image, 'https://cdn.example.com/i.png');
});

test('isSavableUrl accepts only http and https', () => {
  assert.equal(isSavableUrl('https://example.com'), true);
  assert.equal(isSavableUrl('http://example.com'), true);
  assert.equal(isSavableUrl('chrome://settings'), false);
  assert.equal(isSavableUrl('file:///tmp/x'), false);
  assert.equal(isSavableUrl('not a url'), false);
});

test('savePrefill carries the captured fields and prefers the last-used collection', () => {
  const meta = {
    title: 'T', url: 'https://e.com', description: 'D',
    image: 'https://e.com/i.png', favicon: 'https://e.com/f.ico',
  };
  assert.deepEqual(savePrefill(meta, { lastCollection: 'Dev', selectedCollection: '' }), {
    title: 'T', url: 'https://e.com', description: 'D',
    image: 'https://e.com/i.png', favicon: 'https://e.com/f.ico', collection: 'Dev',
  });
  assert.equal(savePrefill(meta, { lastCollection: '', selectedCollection: 'Dev' }).collection, 'Dev');
  assert.equal(savePrefill(meta, {}).collection, '');
});
