import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const readBuffer = (path) => readFile(new URL(`../${path}`, import.meta.url));

function pngSize(buffer) {
  assert.equal(buffer.toString('ascii', 1, 4), 'PNG');
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

test('brand SVGs contain no text elements', async () => {
  for (const file of ['banner.svg', 'social-preview.svg']) {
    const svg = await read(`docs/brand/${file}`);
    assert.match(svg, /<svg[^>]*width="(1600|1280)"/);
    assert.doesNotMatch(svg, /<text\b/i);
  }
});

test('banner and social preview have the declared sizes', async () => {
  assert.match(await read('docs/brand/banner.svg'), /width="1600"[^>]*height="400"/);
  assert.match(await read('docs/brand/social-preview.svg'), /width="1280"[^>]*height="640"/);
  assert.deepEqual(pngSize(await readBuffer('docs/brand/social-preview.png')), [1280, 640]);
});
