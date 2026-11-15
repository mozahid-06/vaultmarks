# Collection Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the panel delete (to trash, recoverable), rename, and move collections from the sidebar.

**Architecture:** A collection is a folder in the vault; the store gains `moveDirectory(path, destination)` and `trashDirectory(path)` in `src/lib/vaultfs.js`, built on the existing move-with-copy-verify helper. `src/library/library.js` adds hover **rename**/**delete** actions on each sidebar row and remaps its selection/expanded state through two pure path helpers in `src/lib/paths.js`.

**Tech Stack:** MV3 Chromium extension, vanilla ES modules, File System Access API, `node --test` (no dependencies, no build step).

**Spec:** `docs/superpowers/specs/2026-11-16-vaultmarks-collection-management-design.md`

## Global Constraints

- No build step, no dependencies; tests are `node --test tests/`. One version, `0.1.0`.
- MV3: permissions stay exactly `["activeTab","scripting","favicon","storage"]`; no background worker; no host permissions; no inline `<script>`/`on*=`; no `innerHTML`/`eval`.
- Destructive operations run only after `requireWritableStore()` and throw `VaultError` with code in `invalid-name | exists | io | partial | needs-permission`; the panel toasts `error.message` for unknown codes.
- Never destroy data: a delete is recoverable (moved into `.vaultmarks-trash/`), a move must not drop a note.
- Trash naming: `<ISO timestamp with : and . replaced by ->--<original name>`; the trash folder is created on demand and is dot-prefixed so scans skip it (`vaultfs.js:9,166-168`).
- A note's collection is the folder its `.md` lives in; there is no frontmatter field to keep in sync.
- Follow the existing file patterns; keep comments sparse like the surrounding code.

## Review Focus

Inputs/conditions the spec implies but no task test exercised before this plan; each is pinned by a test in the named task.

1. Moving a folder into itself or one of its own descendants must be refused — Task 1.
2. A destination that collides case-insensitively with an existing sibling must be refused — Task 1.
3. A non-empty delete must be fully recoverable: nested notes land under the trash folder — Task 2.
4. A trashed folder must stay hidden from the sidebar and the collection dropdown after rescan — Task 2.
5. Panel selection/expanded state after the selected folder is renamed, moved, or deleted must follow or reset, never point at a missing path — Task 3.

---

### Task 1: `moveDirectory` in the store (rename and relocate)

**Files:**
- Modify: `src/lib/vaultfs.js`
- Test: `tests/vault-fs.test.js`

**Interfaces:**
- Consumes: `resolveDirectory(root, path, {create})`, `entryNames(dir)`, `dirOf/baseOf/joinPath` (paths.js), `VaultError`, and the existing file-move helper (`moveHandle`, `vaultfs.js:139-164`).
- Produces: `export async function moveDirectory(path, destination) -> Promise<{ path: string }>` (resolves to `{ path: destination }`); internal `assertSegment(name) -> void` (throws `VaultError('invalid-name', ...)`) and `moveDirectoryHandle(handle, parent, targetParent, targetName) -> Promise<void>`.

- [ ] **Step 1: Write the failing tests** — append to `tests/vault-fs.test.js`:

```js
test('moveDirectory renames a folder in place, keeping notes byte-identical', async () => {
  const root = await makeVault({ 'Dev/Js/Alpha.md': ALPHA });
  const before = await readFile(join(root, 'Dev/Js/Alpha.md'), 'utf8');
  const { path } = await vaultfs.moveDirectory('Dev/Js', 'Dev/Web');
  assert.equal(path, 'Dev/Web');
  assert.ok((await readdir(join(root, 'Dev'))).includes('Web'));
  assert.ok(!(await readdir(join(root, 'Dev'))).includes('Js'));
  assert.equal(await readFile(join(root, 'Dev/Web/Alpha.md'), 'utf8'), before);
});

test('moveDirectory relocates a folder and creates missing parents', async () => {
  const root = await makeVault({ 'Dev/Alpha.md': ALPHA });
  await vaultfs.moveDirectory('Dev', 'Archive/Dev');
  assert.ok((await readdir(join(root, 'Archive'))).includes('Dev'));
  assert.ok(!(await readdir(root)).includes('Dev'));
  assert.equal((await vaultfs.scanStore()).notes[0].key, 'Archive/Dev/Alpha.md');
});

test('moveDirectory refuses a collision, a self-move and a descendant move', async () => {
  await makeVault({ 'Dev/Alpha.md': ALPHA, 'Other/Beta.md': ALPHA });
  await assert.rejects(() => vaultfs.moveDirectory('Dev', 'Other'), (e) => e.code === 'exists');
  await assert.rejects(() => vaultfs.moveDirectory('Dev', 'Dev'), (e) => e.code === 'invalid-name');
  await assert.rejects(() => vaultfs.moveDirectory('Dev', 'Dev/Inner'), (e) => e.code === 'invalid-name');
  await assert.rejects(() => vaultfs.moveDirectory('Dev', 'bad/../name'), (e) => e.code === 'invalid-name');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/vault-fs.test.js`
Expected: FAIL — `vaultfs.moveDirectory is not a function`.

- [ ] **Step 3: Refactor the name rule and implement the move**

In `src/lib/vaultfs.js`, extract the validation currently inline in `createDirectory` (`vaultfs.js:275-285`) into `assertSegment(name)` and call it from `createDirectory`. `assertSegment` throws `VaultError('invalid-name', 'That collection name is not allowed')` for empty, `.`, `..`, a name containing `/`, control characters, or >200 UTF-8 bytes.

Add `moveDirectory(path, destination)`:
1. `requireWritableStore()`.
2. Build `dest` from `destination`: split on `/`, drop empty parts, `assertSegment` each, rejoin with `/`.
3. Throw `VaultError('invalid-name', ...)` if `dest === path` or `dest.startsWith(`${path}/`)` (self or descendant). Do this before any filesystem work.
4. Resolve the source: `sourceParent = await resolveDirectory(root, dirOf(path))`, `source = await sourceParent.getDirectoryHandle(baseOf(path))`.
5. Resolve the destination parent with `{ create: true }`; if `entryNames(destParent)` already contains `baseOf(dest)` case-insensitively, throw `VaultError('exists', 'A collection with that name already exists')`.
6. `await moveDirectoryHandle(source, sourceParent, destParent, baseOf(dest))`; return `{ path: dest }`.

`moveDirectoryHandle` (the algorithm the tests do not determine):

```js
async function moveDirectoryHandle(handle, parent, targetParent, targetName) {
  if (typeof handle.move === 'function') {
    try { await handle.move(targetParent, targetName); return; } catch { /* fall through */ }
  }
  const target = await targetParent.getDirectoryHandle(targetName, { create: true });
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind === 'directory') await moveDirectoryHandle(entry, handle, target, name);
    else await moveHandle(entry, handle, target, name);
  }
  try { await parent.removeEntry(handle.name, { recursive: true }); }
  catch { throw new VaultError('partial', `Copied to ${targetName}, but the original folder could not be removed`); }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/vault-fs.test.js`
Expected: PASS (the three new tests plus the existing file).

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add src/lib/vaultfs.js tests/vault-fs.test.js
git commit -m "Add moveDirectory to rename and relocate collections"
```

---

### Task 2: `trashDirectory` in the store

**Files:**
- Modify: `src/lib/vaultfs.js`
- Test: `tests/vault-fs.test.js`

**Interfaces:**
- Consumes: `resolveDirectory`, `TRASH_DIR`, `moveDirectoryHandle` (Task 1), the trash-name stamp used by `trashFile` (`vaultfs.js:264-272`).
- Produces: `export async function trashDirectory(path) -> Promise<{ trashedAs: string }>`.

- [ ] **Step 1: Write the failing test** — append to `tests/vault-fs.test.js`:

```js
test('trashDirectory moves a folder and its nested notes into the hidden trash', async () => {
  const root = await makeVault({ 'Dev/Alpha.md': ALPHA, 'Dev/Js/Beta.md': ALPHA });
  const { trashedAs } = await vaultfs.trashDirectory('Dev');
  assert.match(basename(trashedAs), /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z--Dev$/);
  assert.deepEqual(await readdir(join(root, '.vaultmarks-trash')), [trashedAs]);
  const moved = join(root, '.vaultmarks-trash', trashedAs);
  assert.ok((await readdir(moved)).includes('Alpha.md'));
  assert.ok((await readdir(join(moved, 'Js'))).includes('Beta.md'));
  assert.ok(!(await readdir(root)).includes('Dev'));
  assert.equal((await vaultfs.scanStore()).notes.length, 0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/vault-fs.test.js`
Expected: FAIL — `vaultfs.trashDirectory is not a function`.

- [ ] **Step 3: Implement `trashDirectory(path)`**

Mirror `trashFile` (`vaultfs.js:264-272`): `requireWritableStore()`; `parent = await resolveDirectory(root, dirOf(path))`; `handle = await parent.getDirectoryHandle(baseOf(path))`; `trashDir = await root.getDirectoryHandle(TRASH_DIR, { create: true })`; `stamp = new Date().toISOString().replace(/[:.]/g, '-')`; `trashedAs = `${stamp}--${baseOf(path)}``; `await moveDirectoryHandle(handle, parent, trashDir, trashedAs)`; return `{ trashedAs }`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/vault-fs.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/vaultfs.js tests/vault-fs.test.js
git commit -m "Add trashDirectory to delete collections recoverably"
```

---

### Task 3: Sidebar rename and delete actions

**Files:**
- Modify: `src/lib/paths.js`, `src/library/library.js`, `src/library/library.css`, `docs/manual-test-checklist.md`
- Test: `tests/vault-helpers.test.js`

**Interfaces:**
- Consumes: `moveDirectory`, `trashDirectory` (Tasks 1-2); `icon('pencil' | 'trash')` (`ui.js:7-8`); `toast`, `refresh`, `renderSidebar`, `state`, `expanded`, `VaultError` messages via `error.message`.
- Produces: `export function isUnder(path, prefix) -> boolean` and `export function remapPath(path, from, to) -> string` in `src/lib/paths.js`.

- [ ] **Step 1: Write the failing helper tests** — append to `tests/vault-helpers.test.js` (extend the import on line 3 to include `isUnder, remapPath`):

```js
test('isUnder matches a path and its descendants only', () => {
  assert.equal(isUnder('Dev', 'Dev'), true);
  assert.equal(isUnder('Dev/Js', 'Dev'), true);
  assert.equal(isUnder('Dev2', 'Dev'), false);
  assert.equal(isUnder('Dev', 'Dev/Js'), false);
});

test('remapPath follows a moved prefix and leaves others alone', () => {
  assert.equal(remapPath('Dev/Js', 'Dev', 'Archive/Dev'), 'Archive/Dev/Js');
  assert.equal(remapPath('Dev', 'Dev', 'Archive/Dev'), 'Archive/Dev');
  assert.equal(remapPath('Design', 'Dev', 'Archive/Dev'), 'Design');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/vault-helpers.test.js`
Expected: FAIL — `isUnder is not a function`.

- [ ] **Step 3: Add the helpers to `src/lib/paths.js`**

```js
export function isUnder(path, prefix) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function remapPath(path, from, to) {
  return isUnder(path, from) ? to + path.slice(from.length) : path;
}
```

- [ ] **Step 4: Wire the sidebar actions in `src/library/library.js`**

In `renderNodes` (`library.js:145-185`), inside the `.collection-row`, after the sidebar button, add a hover actions container with two buttons: rename (`icon('pencil')`, `aria-label` `` `Rename ${node.name}` ``) calling `renameCollection(node)`, and delete (`icon('trash')`, `aria-label` `` `Delete ${node.name}` ``) calling `deleteCollection(node)`. They must not change the row's existing selection/expand behavior.

Add `import { isUnder, remapPath } from '../lib/paths.js'` (paths already imported at `library.js:17`; extend that import).

```js
async function renameCollection(node) {
  const entered = window.prompt('Collection path', node.path);
  if (entered == null || entered.trim() === '' || entered.trim() === node.path) return;
  try {
    const { path } = await moveDirectory(node.path, entered);
    if (isUnder(state.collection, node.path)) state.collection = remapPath(state.collection, node.path, path);
    for (const p of [...expanded]) {
      if (isUnder(p, node.path)) { expanded.delete(p); expanded.add(remapPath(p, node.path, path)); }
    }
    const parent = dirOf(path);
    if (parent !== '') expanded.add(parent);
    toast(`Moved to ${path}`, 'success');
    await refresh();
  } catch (error) {
    toast(error?.message ?? String(error), 'error');
    if (error?.code === 'needs-permission') showReconnect();
  }
}

async function deleteCollection(node) {
  const count = node.count;
  const noun = count === 1 ? 'bookmark' : 'bookmarks';
  if (!window.confirm(`Move "${node.name}" and its ${count} ${noun} to trash?`)) return;
  try {
    await trashDirectory(node.path);
    for (const p of [...expanded]) if (isUnder(p, node.path)) expanded.delete(p);
    if (isUnder(state.collection, node.path)) state.collection = '';
    toast('Collection moved to trash', 'success');
    await refresh();
  } catch (error) {
    toast(error?.message ?? String(error), 'error');
    if (error?.code === 'needs-permission') showReconnect();
  }
}
```

Import `moveDirectory, trashDirectory` from `../lib/vaultfs.js` (extend `library.js:2-14`), and `dirOf` is already imported (`library.js:17`). Style the `.collection-row` actions in `library.css` so they appear on hover/focus like the bookmark row actions and do not shift the row.

- [ ] **Step 5: Run the suite**

Run: `npm test`
Expected: PASS, 0 fail.

- [ ] **Step 6: Smoke-test in real Chromium against the fake vault**

Reuse `/tmp/opencode/collections-probe.mjs` (injects a fake vault with a nested `Dev`): after load, assert (a) a `Dev` row shows rename/delete buttons on hover, (b) `renameCollection` via a stubbed `window.prompt = () => 'Dev/Web'` leaves `Dev/Web` in the sidebar, and (c) a stubbed `window.confirm = () => true` on delete removes `Dev` from the sidebar and moves it under `.vaultmarks-trash`. Expected: no `Runtime.exceptionThrown` and the fake root reflects each change.

- [ ] **Step 7: Add the manual checks** to `docs/manual-test-checklist.md`, next to the create-collection items:

```markdown
- [ ] Rename a collection (hover → pencil): the folder and its notes move on disk
      and the sidebar selection follows.
- [ ] Move a collection by typing a new path (e.g. `Archive/Dev`): parents are
      created and the notes travel with it.
- [ ] Delete a collection with notes (hover → trash): it lands in
      `.vaultmarks-trash/` and disappears from the sidebar and the dropdown.
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/paths.js src/library/library.js src/library/library.css docs/manual-test-checklist.md tests/vault-helpers.test.js
git commit -m "Add sidebar rename and delete actions for collections"
```

---

## Self-Review

- **Spec coverage:** delete-with-contents (Task 2), rename (Task 1 + Task 3), move to a new parent (Task 1 + Task 3), hover UI and confirm copy (Task 3), state remap (Task 3), trash naming (Task 2), recoverable/never-drop (Tasks 1-2), manual checklist (Task 3). All spec sections map to a task.
- **Step scan:** each step names an exact file, signature, test, or command; no "handle edge cases".
- **Type consistency:** `moveDirectory`/`trashDirectory` return `{ path }`/`{ trashedAs }` as used in Task 3; `isUnder`/`remapPath` names are identical in tests and code; `moveDirectoryHandle(handle, parent, targetParent, targetName)` is defined in Task 1 and called identically in Task 2.
- **Review Focus:** each of the five lines is pinned by a test in Tasks 1-3 (self/descendant, collision, nested trash, hidden-after-rescan, selection remap).
- **Proportion:** three tasks; the only code block is the non-obvious recursive move; everything else is signatures, tests and commands.
