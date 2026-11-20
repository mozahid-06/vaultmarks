import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMeta, isSavableUrl, savePrefill, preferredPageUrl,
  findVideoObject, structuredMeta,
} from '../src/lib/capture.js';

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

test('preferredPageUrl trusts the page URL when it is savable', () => {
  // YouTube-style SPA: the tab still reports the first link, the page has
  // already pushed the current one.
  assert.equal(
    preferredPageUrl('https://www.youtube.com/watch?v=first', 'https://www.youtube.com/watch?v=current'),
    'https://www.youtube.com/watch?v=current',
  );
  assert.equal(
    preferredPageUrl('https://example.com/old', 'https://example.com/new#section'),
    'https://example.com/new#section',
  );
  assert.equal(preferredPageUrl('https://example.com/a', 'chrome://settings'), 'https://example.com/a');
  assert.equal(preferredPageUrl('chrome://settings', 'https://example.com/a'), 'https://example.com/a');
  assert.equal(preferredPageUrl('chrome://settings', 'file:///tmp/x'), '');
});

const oldVideo = {
  '@type': 'VideoObject',
  '@id': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  name: 'Never Gonna Give You Up',
  thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
};

const newVideo = {
  '@type': 'VideoObject',
  '@id': 'https://www.youtube.com/watch?v=NEWVIDEO123',
  name: 'The current video',
  description: 'What is playing now.',
  embedUrl: 'https://www.youtube.com/embed/NEWVIDEO123',
  thumbnailUrl: ['https://i.ytimg.com/vi/NEWVIDEO123/maxresdefault.jpg'],
};

test('findVideoObject picks the video whose URL matches the page', () => {
  const pageUrl = 'https://www.youtube.com/watch?v=NEWVIDEO123';
  assert.equal(findVideoObject([oldVideo, newVideo], pageUrl).name, 'The current video');
  assert.equal(findVideoObject([JSON.stringify(oldVideo), JSON.stringify(newVideo)], pageUrl).name, 'The current video');
  assert.equal(findVideoObject([oldVideo], pageUrl), null);
  assert.equal(findVideoObject([], pageUrl), null);
});

test('findVideoObject understands @graph, type arrays and shorts URLs', () => {
  const wrapped = { '@graph': [{ ...oldVideo }, { ...newVideo }] };
  assert.equal(
    findVideoObject([wrapped], 'https://www.youtube.com/watch?v=NEWVIDEO123').name,
    'The current video',
  );
  const short = {
    '@type': ['VideoObject', 'Thing'],
    '@id': 'https://www.youtube.com/watch?v=SHORT12345',
    name: 'A short',
    embedUrl: 'https://www.youtube.com/embed/SHORT12345',
  };
  assert.equal(findVideoObject([short], 'https://www.youtube.com/shorts/SHORT12345').name, 'A short');
});

test('findVideoObject prefers the richest matching entry', () => {
  const bare = { '@type': 'VideoObject', '@id': 'https://www.youtube.com/watch?v=NEWVIDEO123', name: 'Bare' };
  const rich = { ...newVideo };
  assert.equal(
    findVideoObject([rich, bare], 'https://www.youtube.com/watch?v=NEWVIDEO123').name,
    'The current video',
  );
});

test('structuredMeta replaces stale Open Graph fields with the current video', () => {
  const raw = {
    title: 'Old title', description: 'Old description', image: 'https://i.ytimg.com/vi/old.jpg',
    jsonLd: [oldVideo, newVideo],
  };
  const meta = structuredMeta(raw, 'https://www.youtube.com/watch?v=NEWVIDEO123');
  assert.equal(meta.title, 'The current video');
  assert.equal(meta.description, 'What is playing now.');
  assert.equal(meta.image, 'https://i.ytimg.com/vi/NEWVIDEO123/maxresdefault.jpg');
  assert.equal(structuredMeta({ title: 'Keep' }, 'https://example.com/a').title, 'Keep');
});

test('structuredMeta never keeps metadata from the previous video', () => {
  const bare = { '@type': 'VideoObject', '@id': 'https://www.youtube.com/watch?v=BARE1234567', name: 'Bare' };
  const meta = structuredMeta({
    title: 'Old', description: 'Old description', image: 'https://i.ytimg.com/vi/old.jpg', jsonLd: [bare],
  }, 'https://www.youtube.com/watch?v=BARE1234567');
  assert.equal(meta.title, 'Bare');
  assert.equal(meta.description, '');
  assert.equal(meta.image, '');
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
