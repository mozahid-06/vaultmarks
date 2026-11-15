# Vaultmarks Unified Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the toolbar icon open a two-pane Raindrop-style bookmarks panel (collections sidebar + list + search), with a prefilled "Save page" action, while the same page still opens as a full tab.

**Architecture:** `src/library/library.html` becomes both surfaces. `<html>` carries `class="panel"` by default (the popup geometry, 780×600); opening `library.html?view=tab` makes `library.js` drop that class for the full-width tab. The old `src/popup/` save form is deleted and its save flow moves into the panel as a "Save page" action that opens the existing new-bookmark dialog prefilled from the active tab.

**Tech Stack:** Chromium MV3, ES modules, no build step, no dependencies, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-15-vaultmarks-panel-design.md` (this plan implements it and amends `docs/superpowers/specs/2026-11-15-vaultmarks-design.md` §8.2/§8.3). Executors read both.

## Global Constraints

- MV3; `"permissions": ["activeTab","scripting","favicon","storage"]` exactly; no `host_permissions`; no `background` service worker.
- No build step; no dependencies; every file is a plain ES module loaded as-is.
- `npm test` runs `node --test tests/`.
- No inline `<script>` and no `on*=` attributes in any HTML (the page tests forbid them).
- No `innerHTML`/`insertAdjacentHTML`/`outerHTML`/`eval`/`document.write`; all note data renders through `textContent`/`text:`.
- Chromium target (developed and tested on Chromium 155). No Firefox/Safari support.
- The vault folder picked by the user is the only place anything is written; delete moves to `<store>/.vaultmarks-trash/`.
- Existing note reads/writes stay surgical: never truncate, never rewrite unknown keys, order, comments, CRLF/BOM or the body.

## Review Focus

1. **Clicking the icon must show the two-pane panel at popup size.** A reasonable person expects the sidebar and the list visible immediately, the page scroll contained inside the panel, and no clipped Save/Cancel — not a full-width page shoved into a popup. (Task 1.)
2. **Saving must act on the page the user was actually on.** The panel must prefill from that tab and, on a page that cannot be read (`chrome://`, `about:`, the Web Store), show "This page can't be saved." — never an uncaught error and never a note for the extension's own URL. (Task 2.)
3. **The panel and the tab must stay in agreement.** A save, edit, move or delete in one must show up in the other without a manual reload, and browsing must never rewrite a note. (Tasks 1–2, `vault-changed` + rescan.)
4. **A conflict must still be refused in the panel.** A note edited in Obsidian between load and save must raise "This note changed in Obsidian. Reload and try again." from the panel form too, not only the tab. (Task 2.)
5. **Retiring the popup must not remove the only save path or the only `lastCollection` writer.** Task 2 must land and be green before Task 3 flips the icon and deletes `src/popup/`. (Tasks 2–3.)

---

### Task 1: The two-pane panel shell (panel and tab modes)

**Files:**
- Create: `src/lib/view.js`
- Create: `tests/view.test.js`
- Modify: `src/library/library.html`, `src/library/library.css`, `src/library/library.js`, `src/lib/ui.js`, `tests/pages.test.js`

**Interfaces:**
- Consumes: `icon`, `openLibraryTab` from `src/lib/ui.js`; the existing sidebar/list/detail code in `library.js`.
- Produces: `isTabView(search) -> boolean` in `src/lib/view.js`; `library.html` with `<html class="panel">` and the new toolbar/sidebar-header markup and ids (`expand`, `save-page` is added in Task 2); `openLibraryTab()` opens `src/library/library.html?view=tab`.

- [ ] **Step 1: Write the failing view test**

`tests/view.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/view.test.js`
Expected: FAIL — cannot find module `../src/lib/view.js`.

- [ ] **Step 3: Implement `isTabView` in `src/lib/view.js`**

One exported function; body is a single `URLSearchParams` lookup comparing `.get('view')` to `'tab'`, coerced with `String(search ?? '')`.

- [ ] **Step 4: Extend the failing page test**

In `tests/pages.test.js`, add after the existing library test:

```js
test('the library page is the panel by default and has the panel wiring', async () => {
  const html = await read('src/library/library.html');
  assert.match(html, /<html[^>]*class="panel"/);
  for (const id of ['expand', 'open-settings', 'sidebar-header', 'search', 'new-bookmark']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});
```

- [ ] **Step 5: Run the page test to verify it fails**

Run: `node --test tests/pages.test.js`
Expected: FAIL — `library.html` has no `class="panel"` and no `expand`.
Expected: `node --test tests/view.test.js` now PASSES.

- [ ] **Step 6: Restructure `src/library/library.html`**

- `<html lang="en" class="panel">`.
- Delete the top-level `<header class="topbar">`; the wordmark moves into the sidebar.
- Wrap the sidebar contents in a header row:

```html
<div id="sidebar-header" class="sidebar-header">
  <span class="wordmark">Vaultmarks</span>
  <span class="sidebar-header-actions">
    <button id="open-settings" class="icon-button" type="button" title="Settings" aria-label="Settings"></button>
    <button id="expand" class="icon-button" type="button" title="Open in a tab" aria-label="Open in a tab"></button>
  </span>
</div>
```

- In `main`, replace the old topbar search with a toolbar above `#reconnect`:

```html
<div class="main-toolbar">
  <input id="search" type="search" placeholder="Search bookmarks..." autocomplete="off" spellcheck="false">
  <button id="new-bookmark" class="icon-button" type="button" title="New bookmark" aria-label="New bookmark"></button>
</div>
```

- `#new-bookmark` loses its text label (it becomes the `+` icon button); keep the id. `#collection-title`, `#summary`, `#list`, `#empty`, `#reconnect`, `#onboarding`, `#detail*`, `#settings`, `#status` keep their ids and stay where they are.

- [ ] **Step 7: Add the panel geometry and layout rules to `src/library/library.css`**

Values that are decisions (copy them exactly):

```css
.sidebar-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 2px 4px 8px; }
.sidebar-header-actions { display: flex; gap: 2px; }
.main-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.main-toolbar #search { flex: 1; }
.dialog { max-height: calc(100% - 24px); overflow-y: auto; }
html.panel { width: 780px; height: 600px; }
html.panel body { height: 100%; overflow: hidden; }
html.panel .workspace { height: 100%; align-items: stretch; }
html.panel .sidebar { position: static; height: 100%; }
html.panel .main { height: 100%; overflow-y: auto; }
```

Change the base `.sidebar` from its sticky `top: var(--topbar-height)` / `calc(100vh - var(--topbar-height))` height to `position: sticky; top: 0; height: 100vh;` (the topbar that justified the offset is gone), and remove the now-dead `.topbar` and `--topbar-height` rules.

- [ ] **Step 8: Wire the mode and the new controls in `src/library/library.js`**

- Import `isTabView` from `../lib/view.js` and `openLibraryTab` from `../lib/ui.js`.
- At module scope, before `init()`: `const tabView = isTabView(location.search);` then `if (tabView) document.documentElement.classList.remove('panel');`.
- In `init()`: `el('new-bookmark').append(icon('plus'))`; `el('expand').append(icon('external'))`; `el('expand').addEventListener('click', () => openLibraryTab());`; and `if (tabView) el('expand').hidden = true;`. Keep the existing `el('open-settings')`, `el('new-collection')`, search and listener wiring; only the search input moved in the DOM.
- No change to scanning, filtering, rendering or dialogs.

- [ ] **Step 9: Point the tab opener at `?view=tab` in `src/lib/ui.js`**

`openLibraryTab()` builds `const url = chrome.runtime.getURL('src/library/library.html?view=tab');` (the rest of the function is unchanged).

- [ ] **Step 10: Run the full suite**

Run: `npm test`
Expected: PASS (the new view and page tests plus all existing tests).

- [ ] **Step 11: Manual smoke check in Chromium**

Load unpacked, open `chrome-extension://<id>/src/library/library.html` (panel) and `...?view=tab` (tab) via the headless CDP method in `docs/manual-test-checklist.md`.
Expected: panel mode is 780×600 with sidebar and toolbar visible and the page itself not scrolling; tab mode fills the window with the same chrome; no `Runtime.exceptionThrown`.

- [ ] **Step 12: Commit**

```bash
git add src/lib/view.js tests/view.test.js src/library src/lib/ui.js
git commit -m "feat: make the library page a two-pane panel with a tab mode"
```

---

### Task 2: Save page from the panel

**Files:**
- Modify: `src/lib/capture.js`, `tests/capture.test.js`, `src/library/library.html`, `src/library/library.css`, `src/library/library.js`, `tests/pages.test.js`, `docs/manual-test-checklist.md`

**Interfaces:**
- Consumes: `captureActiveTab`, `isSavableUrl` (`capture.js`); `findByUrl`, `BASE_TAG` (`notes.js`); `createNoteText`, `filenameBase` (`markdown.js`); `writeNewFile` (`vaultfs.js`); `saveSettings` (`settings.js`); `fillCollectionSelect`, `createTagInput`, `toast` (`ui.js`); `isTabView` (`view.js`).
- Produces: `savePrefill(meta, { lastCollection, selectedCollection }) -> { title, url, description, image, favicon, collection }` in `src/lib/capture.js`; `library.html` gains `#save-page` in `.main-toolbar` and `#detail-form-cover` at the top of `#detail-form`.

- [ ] **Step 1: Write the failing prefill test**

Add to `tests/capture.test.js` (import `savePrefill` alongside `normalizeMeta`):

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/capture.test.js`
Expected: FAIL — `savePrefill` is not exported.

- [ ] **Step 3: Implement `savePrefill` in `src/lib/capture.js`**

Returns the five captured fields verbatim and `collection: lastCollection || selectedCollection || ''`.

- [ ] **Step 4: Extend the failing page test**

Add `'save-page'` and `'detail-form-cover'` to the library page test's id list in `tests/pages.test.js`.

- [ ] **Step 5: Run the page test to verify it fails**

Run: `node --test tests/pages.test.js`
Expected: FAIL — `save-page` is missing.

- [ ] **Step 6: Add the panel wiring to `src/library/library.html`**

- In `.main-toolbar`, after `#new-bookmark`: `<button id="save-page" class="primary" type="button">Save page</button>`.
- As the first child of `#detail-form`: `<img id="detail-form-cover" class="detail-cover" alt="" hidden>`.

- [ ] **Step 7: Add the save flow to `src/library/library.js`**

Add state fields `prefill: null` and `captured: null`. Changes, by function:

- `import` `savePrefill` from `../lib/capture.js` (next to `isSavableUrl`) and `findByUrl` from `../lib/notes.js`.
- `async function ensureIndex() { if (!state.index) await refresh(); }`
- `function openCreate(prefill = null)`: set `state.mode = prefill ? 'save' : 'create'`, `state.prefill = prefill`, `state.captured = prefill ? { image: prefill.image, favicon: prefill.favicon } : null`; then `showModal` + `renderDetailEdit(null)` as today.
- `async function onSavePage()`: hide it in tab mode (wire once in `init`: `if (tabView) el('save-page').hidden = true; else el('save-page').addEventListener('click', onSavePage)`). `onSavePage` does `let meta; try { meta = await captureActiveTab(); } catch { toast("This page can't be saved.", 'error'); return; }` then `await ensureIndex()` then `openCreate(savePrefill(meta, { lastCollection: state.settings.lastCollection, selectedCollection: state.collection }))`.
- `renderDetailEdit(note)`: when `state.mode !== 'edit'`, take initial fields from `state.prefill` (`title`, `url`, `description`, `collection`) instead of `note`; heading text is `'Save bookmark'` for `'save'`, `'New bookmark'` for `'create'`, `'Edit bookmark'` for `'edit'`; show `#detail-form-cover` with `state.captured?.image` (hidden otherwise); tag input initial stays `[]` for new/save, `userTags(note.tags)` for edit.
- `onDetailSubmit` for `'create'`/`'save'`: after validating title and `isSavableUrl(url)`, run the duplicate check — `const existing = findByUrl(state.index, url); if (existing && !state.saveAnyway) { showDuplicate(existing); return; }` — then `createNoteText({ ..., image: state.captured?.image ?? '', favicon: state.captured?.favicon ?? '', tags })`, `writeNewFile`, `await saveSettings({ lastCollection: dir })`, `notifyChanged()`, `closeDetail()`, `await refresh()`, `toast('Saved', 'success')`. Keep the existing conflict/`needs-permission` handling in the `catch`.
- `function showDuplicate(existing)` (new, for the form): render into `#detail-form-status` a row "Already saved in <collection or Unfiled>" with **Open** (`window.open(existing.url, '_blank')`) and **Save anyway** (sets `state.saveAnyway = true` then `el('detail-form').requestSubmit()`); reset `state.saveAnyway = false` in `openCreate`.
- `openEdit`/`onDetailSubmit` for `'edit'` are unchanged (they already use `updateFile`, which raises `conflict`).
- `closeDetail` resets `state.prefill = null`, `state.captured = null`.

- [ ] **Step 8: Add the save-form cover style**

In `src/library/library.css` the `.detail-cover` rule already exists for the view; it applies to `#detail-form-cover` as well. Add nothing unless the screenshot check shows a layout gap.

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 10: Add the manual checklist lines**

In `docs/manual-test-checklist.md`, replace the "Popup (Task 7)" section with a "Panel save (unified)" section: icon opens the two-pane panel; **Save page** on a normal page prefills title/description/collection and shows the cover; saving writes the note and it appears in the list; on `chrome://settings` it toasts "This page can't be saved."; saving the same URL twice offers Open / Save anyway; the panel's save defaults to the last-used collection; a conflicting note shows the reload message.

- [ ] **Step 11: Commit**

```bash
git add src/lib/capture.js tests/capture.test.js tests/pages.test.js src/library docs/manual-test-checklist.md
git commit -m "feat: save the current page from the panel"
```

---

### Task 3: Retire the popup and point the icon at the panel

**Files:**
- Modify: `manifest.json`, `tests/manifest.test.js`, `tests/pages.test.js`, `README.md`
- Delete: `src/popup/popup.html`, `src/popup/popup.css`, `src/popup/popup.js`

**Interfaces:**
- Consumes: the panel built in Tasks 1–2 (`src/library/library.html`).
- Produces: `action.default_popup = "src/library/library.html"`; no `src/popup/` directory.

- [ ] **Step 1: Update the failing manifest test**

In `tests/manifest.test.js`, change the action test to:

```js
test('the action opens the panel page that exists', async () => {
  assert.equal(manifest.action.default_popup, 'src/library/library.html');
  await readFile(new URL(manifest.action.default_popup, root), 'utf8');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/manifest.test.js`
Expected: FAIL — `default_popup` is still `src/popup/popup.html`.

- [ ] **Step 3: Flip the manifest and delete the popup**

- `manifest.json`: `action.default_popup` → `"src/library/library.html"`; `action.default_title` → `"Vaultmarks"`.
- `git rm src/popup/popup.html src/popup/popup.css src/popup/popup.js` (remove the now-empty `src/popup/` directory).
- In `tests/pages.test.js`, delete the `popup has no inline script or handlers...` test (the file no longer exists); leave the library and view tests.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS, with no test referencing `src/popup/`.

- [ ] **Step 5: Update `README.md`**

- Install/usage: the toolbar icon opens the **panel** (collections sidebar + list + search) at 780×600; a **Save page** button saves the page you are on; the ⤢ button opens the same view as a full tab.
- Remove the "Popup" paragraphs and the popup-only troubleshooting rows (keep "This page can't be saved.", duplicate, conflict, reconnect).
- First run: choosing the folder happens in the tab the panel opens.
- Keep the permissions table, data format and storage guarantees unchanged.

- [ ] **Step 6: Verify no stale references**

Run: `grep -rn "src/popup\|popup.html\|open-library" src tests README.md docs/manual-test-checklist.md || echo "no stale references"`
Expected: no matches (the `open-library` id and any `src/popup` path are gone).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: open the panel from the toolbar icon and drop the popup"
```

---

## Self-Review

- **Spec coverage:** §8.1 panel/tab modes → Task 1; §8.2 layout → Task 1; §8.3 save page (cover preview, `ensureIndex`, duplicate, `lastCollection`) → Task 2; §8.4 onboarding/reconnect → existing code, first-run folder→tab via `openLibraryTab` already in Task 1; §8.5 retire popup → Task 3; §8.6 live behaviour → existing rescan/`vault-changed` reused; §9 testing → each task's tests plus Task 2's checklist.
- **Step scan:** each step has one checkable result; no "handle edge cases" placeholders.
- **Type consistency:** `isTabView(search)` (Task 1) is the only new pure function in `view.js`; `savePrefill(meta, opts)` (Task 2) is the only new pure function in `capture.js`; both are named identically everywhere they are referenced. `openCreate(prefill)` is introduced and used only within Task 2.
- **Review Focus:** (1) Task 1 steps 5/11; (2) Task 2 steps 4/10 and `isSavableUrl`; (3) existing `vault-changed` + rescan, checked in Task 2 step 10; (4) Task 2 step 7 keeps the `conflict` catch and step 10 checks it; (5) ordering — Task 2 lands the save path and `lastCollection` before Task 3 deletes the popup.
- **Proportion:** the plan is shorter than the spec; code appears only as tests, exact CSS values and signatures.
