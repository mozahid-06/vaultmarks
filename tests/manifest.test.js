import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));

test('manifest is MV3 with exactly the approved permissions and no worker', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'favicon', 'storage']);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.background, undefined);
});

test('the action opens the popup page that exists', async () => {
  assert.equal(manifest.action.default_popup, 'src/popup/popup.html');
  await readFile(new URL(manifest.action.default_popup, root), 'utf8');
});

test('every declared icon is a PNG at its declared size', async () => {
  const paths = { ...manifest.icons, ...manifest.action.default_icon };
  for (const [size, path] of Object.entries(paths)) {
    const buf = await readFile(new URL(path, root));
    assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG');
    assert.equal(buf.readUInt32BE(16), Number(size));
    assert.equal(buf.readUInt32BE(20), Number(size));
  }
});
