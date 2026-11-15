import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTabView } from '../src/lib/view.js';

test('isTabView is true only for the tab view query', () => {
  assert.equal(isTabView('?view=tab'), true);
  assert.equal(isTabView('view=tab'), true);
  assert.equal(isTabView('?view=panel'), false);
  assert.equal(isTabView('?foo=1'), false);
  assert.equal(isTabView(''), false);
  assert.equal(isTabView(undefined), false);
});
