import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faviconSources, faviconLetter } from '../src/lib/favicon.js';

test('favicon sources prefer the note icon, then services, then Chrome cache', () => {
  const note = { url: 'https://www.github.com/taxin', favicon: 'https://github.com/icon.png' };
  assert.deepEqual(faviconSources(note, 'chrome-extension://abc/_favicon/?pageUrl=x'), [
    'https://github.com/icon.png',
    'https://www.google.com/s2/favicons?domain=github.com&sz=64',
    'https://icons.duckduckgo.com/ip3/github.com.ico',
    'chrome-extension://abc/_favicon/?pageUrl=x',
  ]);
});

test('favicon sources accept inline data images for old notes', () => {
  const icon = 'data:image/svg+xml;base64,PHN2Zy8+';
  const [first] = faviconSources({ url: 'https://codepen.io/pen', favicon: icon });
  assert.equal(first, icon);
});

test('favicon sources reject relative or empty favicons', () => {
  const sources = faviconSources({ url: 'https://typecraft.dev/', favicon: '/assets/icon.png' });
  assert.equal(sources[0], 'https://www.google.com/s2/favicons?domain=typecraft.dev&sz=64');
  assert.deepEqual(faviconSources({ url: 'not a url', favicon: '' }), []);
});

test('letter tiles use the site name and handle IPs', () => {
  assert.equal(faviconLetter({ url: 'https://www.webminal.org/' }), 'W');
  assert.equal(faviconLetter({ url: 'http://172.16.50.4/' }), '1');
  assert.equal(faviconLetter({ title: 'Local router' }), 'L');
  assert.equal(faviconLetter({}), '?');
});
