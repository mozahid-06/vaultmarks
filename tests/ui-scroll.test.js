import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPastTop } from '../src/lib/ui.js';

test('the back-to-top button appears after a screen of scrolling', () => {
  assert.equal(isPastTop(0), false);
  assert.equal(isPastTop(479), false);
  assert.equal(isPastTop(480), true);
  assert.equal(isPastTop(5000), true);
});
