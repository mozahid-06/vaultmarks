import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinPath, dirOf, baseOf } from '../src/lib/paths.js';
import { mapLimit } from '../src/lib/concurrency.js';

test('path helpers join and split vault keys', () => {
  assert.equal(joinPath('', 'React.md'), 'React.md');
  assert.equal(joinPath('Development', 'React.md'), 'Development/React.md');
  assert.equal(dirOf('Development/React.md'), 'Development');
  assert.equal(dirOf('React.md'), '');
  assert.equal(baseOf('Development/React.md'), 'React.md');
});

test('mapLimit preserves order and never exceeds the limit', async () => {
  let active = 0;
  let peak = 0;
  const out = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return n * 2;
  });
  assert.deepEqual(out, [2, 4, 6, 8, 10]);
  assert.ok(peak <= 2);
});
