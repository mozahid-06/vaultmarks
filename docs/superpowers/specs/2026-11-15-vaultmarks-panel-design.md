# Vaultmarks — unified panel design

- **Date:** 2026-11-15
- **Status:** draft for approval
- **Project:** `/home/taxin/Work/vaultmarks`
- **Amends:** `2026-11-15-vaultmarks-design.md` (§8.2 popup, §8.3 library, §3, §4, §8.4, §10). Where the two disagree, this document wins; everything else in the original spec still stands.
- **Approach chosen:** A — one page, two containers (the toolbar popup and the full tab are the same UI)

## 1. Intent and why

The user wants the toolbar icon to open a **Raindrop-style bookmarks panel**, not the small
save form it opens today. Observing the real Raindrop popup, that means a **two-pane** layout:
a collections sidebar on the left and the bookmark list on the right, side by side — not the
drill-down I first proposed. Their Vaultmarks library page already looks like that panel; the
problem is purely that the icon opens the save form instead.

So: the panel becomes the primary surface, and the full-tab library remains as the roomier view
of the same thing. The user picked "a mix of 1 and 2": icon → panel, with a way to expand to a tab.

## 2. Scope

In:
- Make the toolbar popup render the full library UI (sidebar + list + search + detail/edit/delete).
- Add a **Save page** action inside the panel that opens the existing new-bookmark form prefilled
  from the active page.
- Add an **expand** button that opens the same UI as a full tab.
- Retire `src/popup/` entirely (one codebase).

Out:
- The separate 360 px save-form popup.
- Any change to note format, write semantics, permissions, or the vault layer.

## 3. Goals

- Clicking the icon shows collections and bookmarks immediately, in a two-pane panel sized for a
  Chromium popup (≤800×600).
- Saving the current page stays one or two clicks and keeps all current fields (title, URL,
  description, cover, favicon, tags, collection).
- The panel and the tab are the same page and the same code; they cannot drift.
- No new permissions, no background worker, no build step, no dependencies.

## 4. Non-goals (this change)

- Unsorted / Trash / tag nodes in the sidebar (still deliberate omissions).
- Drag-and-drop, multi-select, grid view, sort controls.
- Favicon/cover backfill into legacy notes.
- Chrome side panel, new-tab override.

## 5. Anti-goals

- A second copy of the list/sidebar/detail rendering that can diverge from the tab.
- Writing bookmark data anywhere but the picked vault folder.
- Blocking the popup while the vault scans.

## 6. Constraints discovered (and what they force)

1. **The save action only works from the popup.** `activeTab` is granted on the action click for the
   tab that was active. In the full tab, the active tab is the library itself, so it cannot read the
   page the user was browsing. → **Save page lives in the panel only**; the tab keeps "New" (manual).
2. **A Chromium popup is at most 800×600.** → the panel is **780×600**; both panes and the list must
   scroll internally rather than growing the popup.
3. **MV3 forbids inline scripts**, and the repo's own `tests/pages.test.js` forbids inline `<script>`
   and `on*=` handlers. → the panel/tab distinction is made in a module (`library.js`), not inline.
4. **The popup is created fresh each time** it opens, so it always re-inits and rescans; the tab is
   long-lived and refreshes on focus.

## 7. Approaches considered

| # | Approach | Trade-off | Verdict |
|---|----------|-----------|---------|
| A | **One page, two containers.** `library.html` is the panel; the icon opens it as a popup (780×600), an expand button opens the same file as a full tab. `popup.*` deleted. | One codebase; the views can never drift. Larger single change; the existing library shell is restructured. | **Chosen** |
| B | **Share the parts, keep two pages.** `popup.html` rebuilt as its own two-pane panel importing the shared sidebar/row/detail modules; the library stays a separate page. | Smaller blast radius; two shells and two bootstraps to keep in sync. | Rejected — it keeps exactly the duplication we already have |
| C | Chrome **side panel** (`sidePanel` permission + worker). | Persistent like Raindrop; needs a new permission and a background worker. | Rejected — user wants a popup; ADR forbids the worker |

## 8. The design

### 8.1 One page, two modes

`src/library/library.html` is both surfaces.

- Its `<html>` starts with `class="panel"`. CSS gives `.panel` the popup geometry
  (`width: 780px; height: 600px`), so the popup is correctly sized on first paint (no flash).
- The **tab** is opened as `library.html?view=tab`; `library.js` reads the query and removes the
  `panel` class, restoring the full-width layout. The one-frame panel→full resize on tab load is
  imperceptible and only affects the tab.
- Detection is a tiny pure helper, `isTabView(search)` in a new `src/lib/view.js`, so it is unit
  testable.

`manifest.json`:

- `action.default_popup` → `src/library/library.html` (the panel).
- `action.default_title` → `Vaultmarks`.
- Permissions unchanged: `["activeTab","scripting","favicon","storage"]`.

### 8.2 Layout (both modes share it)

```
┌──────────────┬──────────────────────────────────────────┐
│ Vaultmarks   │  🔍 Search…            [+ New] [Save page] │
│ ⚙ ⤢          │                                           │
│              │  Development              51 bookmarks     │
│ ☰ All books  │  ┌────┐ Webminal — Free Linux Terminal…    │
│          239 │  │img │ webminal.org · Jun 1               │
│              │  └────┘                                   │
│ COLLECTIONS +│  ┌────┐ setup.sh                          │
│ ▸ Design  19 │  │img │ gist.github.com · May 12           │
│ ▾ Development│  └────┘                                   │
│    Learning 6│  …                                         │
└──────────────┴──────────────────────────────────────────┘
```

- **Sidebar (260 px):** header row = wordmark, settings gear, expand `⤢`; then **All bookmarks**
  (count) and the **Collections** tree (counts, disclosure), with a `+` that creates a root folder.
  No Unsorted/Trash/tag nodes.
- **Main:** a toolbar (search, `+ New`, `Save page`), then the collection title + count, then the
  list. Rows are unchanged: 64×48 thumbnail (cover → favicon tile), title, 2-line description,
  `domain · created`, and hover/focus actions eye / pencil / trash.
- **Scrolling:** in panel mode the workspace fills 600 px, the sidebar and the list scroll
  internally, and the page itself never scrolls. In tab mode the sheet keeps its current behaviour.
  Dialogs get a `max-height` (`calc(100% - 24px)`) and internal scrolling so the save/edit form's
  Save/Cancel can never be clipped inside the 600 px panel.
- The `expand ⤢` button is shown only in panel mode; `Save page` only in panel mode. `New` and the
  search toolbar are in both.

### 8.3 Save page (panel only)

- Clicking **Save page** calls the existing `captureActiveTab()`.
  - Not an `http(s)` page (`chrome://`, `about:`, Web Store, the extension itself) → toast
    "This page can't be saved." Nothing else changes.
  - Otherwise open the existing detail dialog in **save mode**: fields prefilled with title, URL,
    description; **collection** defaulted to the last-used collection; **tags** empty (base tag
    applied on write); cover and favicon taken from the capture and written into the new note.
- **Index readiness:** `Save page` and `+ New` await the in-flight scan (`ensureIndex()`) before
  opening the dialog, so the duplicate check (`findByUrl`) and the collection `<select>` see the
  full index even when clicked during the initial scan.
- **Cover preview:** in save mode the form shows the captured cover at the top (read-only, 16:9),
  hidden in edit mode. It is display only; the note's `image` comes from the capture.
- **Last-used collection:** a successful save writes `saveSettings({ lastCollection: dir })` — the
  writer the deleted popup owned, kept alive here. `+ New` keeps today's default (the selected
  collection) and does not write it; the save dialog defaults to `lastCollection`, falling back to
  the selected collection.
- The dialog heading is "Save bookmark" (vs "New bookmark" for `+ New`), and the two differ only in
  that save mode carries the captured `image`/`favicon` and a title fallback.
- Submit reuses the current create path (`createNoteText` → `writeNewFile` → `refresh` → toast).
- **Duplicate URL:** before writing, if `findByUrl(index, url)` matches, the dialog shows
  "Already saved in <collection>" with **Open** and **Save anyway** (Save anyway writes a numbered
  second file). Same rule as today.
- After a successful save: toast "Saved", rescan, and broadcast `vault-changed` so an open tab
  refreshes. (No separate "Saved ✓ + Open in Obsidian" step; the note is now in the list and its
  detail view offers Open in Obsidian.)

### 8.4 Onboarding, reconnect, unsupported states (panel and tab)

- **No store / no handle:** onboarding panel. **Choose folder** opens the **library tab** and runs
  `showDirectoryPicker()` there — setup is a one-time act best done in a durable tab (a permission
  prompt can otherwise close the popup). Decision, not a user choice.
- **Permission `prompt`:** the reconnect banner, whose button calls `requestPermission()` in place
  (the click is the required gesture).
- **`denied` / `NotFoundError`:** onboarding with the existing "choose it again" copy.
- **Empty states:** "No bookmarks yet", "No matches"; unchanged.

### 8.5 Retire the popup

- Delete `src/popup/popup.html`, `src/popup/popup.css`, `src/popup/popup.js`.
- Move the pieces it owned into the unified page: `captureActiveTab`, the duplicate check, and the
  image/favicon write. `src/lib/capture.js`, `settings.js`, `notes.js`, `vaultfs.js`, `ui.js` are
  reused unchanged (except where noted).
- `createTagInput` is already idempotent, which matters because the save/edit form is now re-entered
  in one long-lived page.

### 8.6 Live behaviour

- The tab rescans on load, focus/visibilitychange, after every mutation, and via Rescan.
- The panel rescans on every open (it is recreated) and after every mutation.
- **Rescan latency:** 239 notes parse in a few hundred ms behind a "Scanning…" indicator; the popup
  shows the last-known list is not available (it always scans), so the indicator matters. Caching by
  `key+lastModified+size` is out of scope here (noted as a later improvement).

## 9. Testing

- **Unit:** `isTabView` (query parsing) → `tests/view.test.js`; existing suites unchanged.
- **Pages:** update `tests/pages.test.js` — drop the popup-page test; assert `library.html` carries
  `class="panel"`, the new ids (`save-page`, `expand`, `settings`), and still no inline handlers.
- **Manifest:** `action.default_popup` is `src/library/library.html` and the file exists.
- **Manual:** extend `docs/manual-test-checklist.md` — icon opens the two-pane panel at 780×600;
  Save page prefills and writes; unsupported page shows the message; expand opens the tab; the tab
  and panel show the same data; first-run Choose folder opens the tab.

## 10. Decisions left to the builder

- Exact panel chrome (icon choice for expand, toolbar spacing) within the existing theme.
- Whether `Save page` is a labelled button or an icon button.
- Internal shape of the save-mode prefill (a `state.capture` object vs parameters to `openCreate`).
- Whether the sidebar header collapses in very narrow tab widths (not required for the popup).

### Calls already made (builder check)

These came back from the design review as open; settled here so the plan is unambiguous.

- **Cover preview in save mode:** shown (read-only) at the top of the form, per §8.3 — the old
  popup's most visible field is not dropped.
- **`lastCollection`:** the save path keeps writing it (§8.3); without this it would rot once
  `src/popup/` is deleted.
- **Save before the scan finishes:** `Save page` / `+ New` await `ensureIndex()` rather than opening
  a dialog over an empty index (§8.3).
- **Dialog height:** dialogs scroll internally with a `max-height` (§8.2), so Save/Cancel cannot be
  clipped in the 600 px panel.

## 11. Risks

- **Popup geometry.** 780×600 is at the edge of Chromium's 800×600 cap; if a height of exactly 600
  clips, fall back to 560. Internal scrolling keeps the list the only flexible region.
- **Scan on every popup open.** Acceptable at 239 notes; a larger vault would need the cache noted
  in §8.6.
- **Layout regression in the tab.** Moving search into the main toolbar and the wordmark into the
  sidebar changes the reviewed tab layout; the manual checklist and the page test guard the wiring,
  not the pixels.
- **First-run jump to the tab.** One extra click on setup only; documented in the README.

## 12. Amendments to the original spec

- §3 non-goals: "Side panel" remains a non-goal; the **popup becomes a two-pane panel** (this doc).
- §8.2 is replaced by §8.2/§8.3 here (one page, panel + tab).
- §8.3 library layout is retained, with search moved into the main toolbar and the wordmark/settings
  moved into the sidebar header.
- §8.4 note: the panel broadcasts `vault-changed`; the tab listens (as today).
- §10 tests: popup page test replaced by the panel/tab tests above.
