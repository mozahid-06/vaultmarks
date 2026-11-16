# Collection Drag-and-Drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a collection row be dragged onto another collection row to nest it, and onto **All bookmarks** to move it back to the top level.

**Architecture:** The drop decision lives in one pure helper, `dropDestination(source, target)` in `src/lib/paths.js`; the sidebar wires HTML5 drag events by delegation so handlers survive re-renders; the rename prompt's post-move body is extracted into `moveCollection(fromPath, destination)` and shared with the drop path, so both use the already-hardened `moveDirectory` and the same state remapping.

**Tech Stack:** MV3 Chromium extension, vanilla ES modules, HTML5 drag-and-drop, File System Access API, `node --test` (no dependencies, no build step).

**Spec:** `docs/superpowers/specs/2026-11-16-vaultmarks-collection-drag-and-drop-design.md`

## Global Constraints

- No build step, no dependencies; tests are `node --test tests/`. One version, `0.1.0`.
- MV3: permissions stay exactly `["activeTab","scripting","favicon","storage"]`; no background worker; no host permissions; no inline `<script>`/`on*=`; no `innerHTML`/`eval`.
- A collection is a folder in the vault; a bookmark's collection is the folder its `.md` lives in. Drag-and-drop moves folders only; it never edits note frontmatter.
- Reuse `moveDirectory` from `src/lib/vaultfs.js`; the UI must not write to the filesystem itself. The store refuses self/descendant/collision moves before any filesystem work.
- Never destroy data: an illegal drop touches nothing; legal moves must not drop a note.
- Drag is a mouse affordance; the hover pencil prompt remains the keyboard/fallback path.
- Follow the existing file patterns; keep comments sparse like the surrounding code.

## Review Focus

Inputs/conditions the spec implies but no task test exercised before this plan; each is pinned by a test in the named task.

1. Dropping a row back on itself or on its current parent must change nothing — Task 1 (helper) and Task 2 (browser probe).
2. Dropping a collection onto one of its own descendants must be refused before the filesystem is touched — Task 1 and Task 2.
3. Dropping onto a collection that already has a child with that name must refuse with the existing toast and leave both folders intact — Task 2 (the store's `exists` refusal, surfaced by `messageFor`).
4. After a successful drop the target must be expanded and the selection/expanded state must follow the moved path — Task 2.
5. Dropping a top-level collection onto **All bookmarks** is a no-op; un-nesting a child must restore it to the root — Task 1 and Task 2.

---

### Task 1: `dropDestination` path helper

**Files:**
- Modify: `src/lib/paths.js`
- Test: `tests/vault-helpers.test.js`

**Interfaces:**
- Consumes: `isUnder`, `joinPath`, `baseOf` from `src/lib/paths.js`.
- Produces: `export function dropDestination(source, target) -> string | null` — the full destination path for a collection at `source` dropped on `target`, where `target === ''` means the top level; `null` means the drop is meaningless or illegal (empty source, self, descendant, or already in that exact place).

- [ ] **Step 1: Write the failing tests** — add `dropDestination` to the import and append to `tests/vault-helpers.test.js`:

```js
test('dropDestination nests, un-nests and refuses illegal drops', () => {
  assert.equal(dropDestination('Design & Graphics', 'Development'), 'Development/Design & Graphics');
  assert.equal(dropDestination('Development/Snippets & Demos', ''), 'Snippets & Demos');
  assert.equal(dropDestination('Design & Graphics', ''), null);
  assert.equal(dropDestination('Development/Miscellaneous', 'Development'), null);
  assert.equal(dropDestination('Development', 'Development'), null);
  assert.equal(dropDestination('Development', 'Development/Learning'), null);
  assert.equal(dropDestination('Development/Learning', 'Development/Learning/Deep'), null);
  assert.equal(dropDestination('Development', 'Development 2'), 'Development 2/Development');
  assert.equal(dropDestination('', 'Development'), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/vault-helpers.test.js`
Expected: FAIL — `dropDestination is not a function` (or an import error).

- [ ] **Step 3: Implement `dropDestination(source, target)` in `src/lib/paths.js`**

Return `null` when `source` is empty, when `target` is `source` or a descendant of it (`isUnder(target, source)`), or when the computed destination would equal `source`. Otherwise return `joinPath(target, baseOf(source))`. Keep it pure and side-effect-free.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/vault-helpers.test.js`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS, 63 tests, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/lib/paths.js tests/vault-helpers.test.js \
  docs/superpowers/specs/2026-11-16-vaultmarks-collection-drag-and-drop-design.md \
  docs/superpowers/plans/2026-11-16-vaultmarks-collection-drag-and-drop.md
git commit -m "Add dropDestination path helper"
```

---

### Task 2: Sidebar drag-and-drop wiring

**Files:**
- Modify: `src/library/library.js`
- Modify: `src/library/library.css`
- Modify: `docs/manual-test-checklist.md`
- Test: `/tmp/opencode/dnd-probe.mjs` (Chromium harness, not committed)

**Interfaces:**
- Consumes: `dropDestination` (Task 1); `moveDirectory`, `dirOf`, `isUnder`, `remapPath` from the existing imports; `state`, `expanded`, `refresh`, `toast`, `messageFor`, `notifyChanged`, `showReconnect`, `el`.
- Produces: internal `async function moveCollection(fromPath, destination) -> Promise<string | null>` (the extracted rename body; toasts success/error, refreshes, returns the new path or `null`), internal `function wireSidebarDnd() -> void` (binds delegated handlers once), and module-level `let dragPath = null`.

- [ ] **Step 1: Write the failing browser probe**

Create `/tmp/opencode/dnd-probe.mjs` by extending `/tmp/opencode/sidebar-probe.mjs`'s fake FS, CDP harness, and 9 real collection names; keep its `isSameEntry`/`arrayBuffer`/persisting-writable support. After the library renders, run these page-side helpers:

```js
const rows = () => [...document.querySelectorAll('#collections .collection-row')];
const rowFor = (n) => rows().find((r) => r.querySelector('.nav-label')?.textContent === n);
const rootRowFor = (n) => [...document.querySelectorAll('#collections > .collection-group > .collection-row')]
  .find((r) => r.querySelector('.nav-label')?.textContent === n);
const drag = (from, onto /* a row, or null for All bookmarks */) => {
  const to = onto ?? document.getElementById('all');
  const dt = new DataTransfer();
  from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
  const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt });
  to.dispatchEvent(over);
  const accepted = over.defaultPrevented;
  to.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  from.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
  return accepted;
};
```

Assert, waiting for the 300 ms refresh after each move:

1. `drag(rowFor('Miscellaneous'), rowFor('Development'))` accepted; fake root loses `Miscellaneous`; `Development` gains it; row `Miscellaneous` renders at `--depth: 1`; status is `Moved to Development/Miscellaneous`.
2. `drag(rowFor('Miscellaneous'), null)` accepted; root regains `Miscellaneous`; `Development` loses it; status is `Moved to Miscellaneous`. A second `drag(rowFor('Miscellaneous'), null)` is not accepted.
3. `drag(rowFor('Development'), rowFor('Development'))` not accepted; `drag(rowFor('Development'), rowFor('Development/Learning'))` not accepted (resolve the row by its `data-path`, since two collections can share a label); both change nothing.
4. Click `Entertainment`, then drag it onto `Development`: the active row's `data-path` becomes `Development/Entertainment`, `Development` has `aria-expanded="true"`, and the active row is visible.
5. Select **All bookmarks**, create a root `Entertainment` with **+** while `Development/Entertainment` exists, then drag `rootRowFor('Entertainment')` onto `Development`: the drop is accepted (the pure helper cannot see child names), but no filesystem change occurs and the error toast is `A collection with that name already exists.`; both copies still present.

Run it against a fresh headless Chromium with the unpacked extension. Expected: FAIL — no row has `draggable`, `dragover.defaultPrevented` is false everywhere, and no move happens.

- [ ] **Step 2: Implement the drag wiring in `src/library/library.js`**

Add `dropDestination` to the `../lib/paths.js` import. In `renderNodes`, give the `.collection-row` div `dataset: { path: node.path }` and `draggable: 'true'`.

Extract the try/catch body of `renameCollection` after the prompt into:

```js
async function moveCollection(fromPath, destination) { /* returns path | null */ }
```

It calls `moveDirectory(fromPath, destination)`, remaps `state.collection` and every `expanded` path with `isUnder`/`remapPath`, adds `dirOf(path)` to `expanded`, toasts `Moved to ${path}`, calls `notifyChanged()`, awaits `refresh()`, and returns `path`; on error it toasts `messageFor(error)`, calls `showReconnect()` for `needs-permission`, and returns `null`. `renameCollection` becomes prompt + `moveCollection(node.path, entered.trim())`.

Add `let dragPath = null;` plus `wireSidebarDnd()` with delegated listeners on `#collections` and `#all`, bound once from `init()`:

- `dragstart` (`#collections`): resolve `event.target.closest('.collection-row')`; set `dragPath` from its `data-path`, `dataTransfer.effectAllowed = 'move'`, and add class `dragging` to the row.
- `dragend` (`#collections`): clear `dragPath`, remove all marks.
- `dragover` (`#collections`): resolve the row under the pointer; `destination = dropDestination(dragPath, row.dataset.path)`; if `null`, remove marks and return without `preventDefault()`; otherwise `preventDefault()`, set `dropEffect = 'move'`, and mark that row.
- `dragleave` (`#collections`): remove marks only when `!event.currentTarget.contains(event.relatedTarget)`.
- `drop` (`#collections`): recompute the destination; if `null` return; otherwise `preventDefault()`, clear marks and `dragPath`, then `moveCollection(source, destination)`.
- `#all` is the top-level target: same three handlers with `dropDestination(dragPath, '')`, marking `#all` itself.

Marking means at most one `.drop-target` element at a time; clearing removes `.drop-target` and `.dragging` from the sidebar.

- [ ] **Step 3: Add the drag styles to `src/library/library.css`**

Near the collection-row rules: `cursor: grab` on the row's `.nav-item`; `.collection-row.dragging { opacity: 0.45; }`; a clearly visible accent outline on `.collection-row.drop-target .nav-item` and `#all.drop-target .nav-item` (use the existing `--accent`, e.g. `outline: 2px solid var(--accent); outline-offset: -2px;`). No layout shift when a mark toggles.

- [ ] **Step 4: Re-run the browser probe**

Run the same command as Step 1.
Expected: PASS — all five assertions hold and `exceptions` is empty.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS, 63 tests, 0 failures.

- [ ] **Step 6: Update `docs/manual-test-checklist.md`**

Under **Library**, add checks for: dragging a collection onto another nests it and expands the target; dragging it onto **All bookmarks** un-nests it; an illegal self/descendant drop shows no highlight and changes nothing; a name collision toasts and changes nothing; the hover pencil still moves collections.

- [ ] **Step 7: Commit**

```bash
git add src/library/library.js src/library/library.css docs/manual-test-checklist.md
git commit -m "Nest collections by dragging sidebar rows"
```
