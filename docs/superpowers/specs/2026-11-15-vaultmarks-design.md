# Vaultmarks — design

- **Date:** 2026-11-15
- **Status:** draft for approval
- **Project:** `/home/taxin/Work/vaultmarks` (new repo; initialized when the build starts)
- **Approach chosen:** A — pure extension with a folder picked by the user (File System Access API)

## 1. Intent and why

`bookmarks-but-better` turned out not to be the desired tool. The goal is a
Raindrop.io-style bookmark extension for Chromium that uses an Obsidian vault
folder as its only store, so every bookmark is a readable Markdown note with
frontmatter that Obsidian (and the existing `Bookmark Viewer.md` Dataview page)
can display with title, description, cover image, favicon and tags.

The user's library already lives at `/home/taxin/Documents/notes/Bookmarks`:
239 notes in the Obsidian Web Clipper format (`title`, `url`, `created`,
`description`, `tags`), many with a cover image embedded in the body. The
extension must read and edit those notes without breaking them, and write new
ones in the same shape as the Clipper template
(`/home/taxin/Dropbox/Documents/notes/bookmarks-clipper.json`).

## 2. Goals

- First run: ask for the folder once (Obsidian vault folder), then work live
  against it with no server, daemon or helper process.
- View the library as a minimal Raindrop-style list: **All bookmarks** and
  **Collections** in the sidebar, search, compact rows (thumbnail, title,
  2-line description, domain, date), and a detail/edit panel. No grid, no
  sort/view controls, no Trash/Unsorted entries, no tag sidebar.
- Add the current page from a toolbar popup with title, URL, description,
  cover image, favicon, tags and collection pre-filled from the page.
- Edit and move existing notes; changes are written to the same `.md` file and
  show up in Obsidian immediately.
- Keep every existing note working: never rewrite unknown frontmatter keys,
  key order, comments, or the Markdown body. Never lose edits made in Obsidian.
- The vault is the single source of truth. The extension stores no bookmark
  data of its own.

## 3. Non-goals (v1)

- Full article capture / reader mode / highlights / full-text search. Notes
  stay short (cover, description, link), like the existing 239 notes.
- Importing Chrome's native bookmarks.
- Multi-select and bulk actions, cover editing, and backfilling `image` /
  `favicon` into the legacy notes.
- Context menu and keyboard shortcut capture (toolbar popup only).
- Side panel, new-tab override, Firefox/Safari.
- Drag-and-drop ordering, folder rename, folder delete with contents.
- Chrome Web Store publishing (personal unpacked extension).
- Any network call of its own. Favicons are served locally by Chrome, covers
  are loaded from their original site by the browser.

## 4. Anti-goals

- Writing anything outside the folder the user picked.
- Re-serializing an existing note (that would drop comments, key order and
  unknown keys).
- Overwriting an Obsidian edit without warning.
- Storing bookmark data in `chrome.storage` or IndexedDB (only the folder
  handle and small UI settings live there).
- Requiring a background service or Python helper.
- Blocking the UI while scanning the vault.

## 5. Approaches considered

| # | Approach | Trade-off | Verdict |
|---|----------|-----------|---------|
| A | Pure extension + `showDirectoryPicker()` + IndexedDB handle | No extra process; Chromium-only; may need a one-click re-grant after a browser restart | **Chosen** |
| B | Extension + native-messaging Python helper | No prompts, survives restarts, can watch for edits; needs an install step registered per browser | Fallback if re-grants annoy; the file layer is isolated so it can be swapped in |
| C | Extension + local HTTP daemon (bookmarks-but-better style) | Most robust sync story; runs a service again | Rejected — the user is replacing exactly that |

The storage layer is a narrow interface (`vaultfs.js`) so B can replace it
without touching the UI.

## 6. Setup: the first step is always the folder

1. The library page, with no stored handle, shows onboarding: **"Choose your
   Obsidian vault folder"** and one button. The button calls
   `showDirectoryPicker({ id: 'vaultmarks', mode: 'readwrite' })`.
2. Resolution (once, at setup):
   - If the selected folder contains a `Bookmarks` subfolder → that subfolder
     is the store; the selected folder's name is the vault name (used for
     `obsidian://` links).
   - Otherwise the selected folder itself is the store, and Obsidian links are
     hidden (the vault name is unknown).
3. The store handle is saved in IndexedDB (`vaultmarks` DB, `handles`/`vault`),
   and `{ vaultName, storePath, obsidianLinks }` in `chrome.storage.local` for
   display. The handle is never exported.
4. Validation: warn (do not block) when the folder holds no `.md` files.
5. The popup opened before setup shows "Set up Vaultmarks" → opens the library
   onboarding.

**Permission lifecycle:** on every page load, `queryPermission({mode:
'readwrite'})`. If it returns `prompt`, the library shows a "Reconnect folder"
banner whose click calls `requestPermission()`. The popup does not try to
re-grant (a permission dialog can close it); it shows "Reconnect in library"
and opens the library. If it returns `denied`, onboarding is shown again.

## 7. Note format

### 7.1 New note (exact shape)

```md
---
title: "Cozytile_hyprland"
url: "https://github.com/darkkal44/cozytile"
created: 2025-06-16
description: "A Cozy rice ❃"
image: "https://github.com/.../preview.png"
favicon: "https://github.com/favicon.ico"
tags:
  - "bookmarks"
  - "rice"
---

![](https://github.com/.../preview.png)

A Cozy rice ❃

[Open original ↗](https://github.com/darkkal44/cozytile)
```

- Key order is fixed as above. `image` and `favicon` are omitted when empty;
  `description` is always present (possibly `""`); `tags` always contains
  `bookmarks` (constant base tag) plus user tags.
- `created` is a local `YYYY-MM-DD` date, unquoted (an Obsidian date property).
- All other scalars are double-quoted with `"` and `\` escaped.
- The body is generated only at creation: optional cover image, description,
  blank line, `[Open original ↗](url)`. Later edits never touch the body.

### 7.2 Reading

- A note is a bookmark when it has a parseable frontmatter block and a `url`
  key. Notes without `url` are ignored (not bookmarks).
- Parse the YAML subset actually used: `key: "scalar"`, `key: scalar`,
  `created: YYYY-MM-DD`, tags as a block list or inline `[a, b]`, quoted or
  unquoted. Support CRLF and a leading BOM. `---` delimiter only.
- Cover resolution for display: the `image` frontmatter key, else the first
  Markdown image in the body (`![](…)`), else a favicon tile. 167 of the
  existing 239 notes keep their cover only in the body; they must show a cover
  without being rewritten.
- Unreadable notes are skipped and counted; the library settings area shows
  "N notes could not be read", not an error dialog.
- Scan only `.md` files under the store; skip entries whose name starts with
  `.` (`.obsidian`, `.bookmarks-but-better`, `.vaultmarks-trash`).

### 7.3 Updating

- Updates use a surgical frontmatter patch: locate the frontmatter block,
  replace the value lines of managed keys only, insert missing managed keys
  before the closing `---`, and leave every other byte of the file untouched
  (unknown keys, order, comments, body, line endings).
- Managed keys: `title`, `url`, `created`, `description`, `image`, `favicon`,
  `tags`. Nothing else is written.
- Managed keys are inserted only when the new value is non-empty. A title-only
  save never adds `image: ""` or `favicon: ""` to a legacy note.
- Existing values are never truncated on save: the 1,000-character cap applies
  to freshly captured descriptions only (the vault contains a 2,194-character
  description that must survive unrelated edits).
- No body-based backfill and no cover editing in v1: legacy body images are
  read for display and left exactly as they are.
- Optimistic concurrency: keep the exact text a note was loaded from. Re-read
  the file just before writing; if its bytes differ from what was loaded,
  refuse with "This note changed in Obsidian. Reload and try again." and offer
  a reload action. This is the only conflict UI in v1.

### 7.4 Filenames

- Filename is the title plus `.md`.
- Sanitize: replace `<>:"/\|?*` and control characters with `-`, collapse
  whitespace, trim leading/trailing dots and spaces, cap at 120 characters and
  200 UTF-8 bytes (trim until both hold — Devanagari and emoji titles stay
  valid). Empty result → hostname, then `Bookmark`.
- Collisions are checked case-insensitively and resolved with ` (2)`, ` (3)`.
- Renaming a note (title edit) and moving it between collections use
  `FileSystemFileHandle.move()` when the browser provides it; otherwise
  copy-then-remove, with the copy verified before the original is removed.

### 7.5 Delete

- Delete moves the note to `<store>/.vaultmarks-trash/<ISO timestamp>--<name>.md`
  (folder created on demand) rather than deleting permanently. A failed move
  reports an error and leaves the note in place. No trash UI in v1; the user
  can empty it in a file manager, and Obsidian does not show dot-folders.

## 8. Architecture

Manifest V3, no build step, no dependencies, ES modules, no background service
worker (none is needed).

```
vaultmarks/
├── manifest.json
├── icons/{16,32,48,128}.png        generated once, real PNGs
├── src/
│   ├── popup/{popup.html,popup.css,popup.js}
│   ├── library/{library.html,library.css,library.js}
│   └── lib/
│       ├── vaultfs.js       IndexedDB handle, scan, read/write/move/delete
│       ├── markdown.js      frontmatter parse, patch, create-note render
│       ├── notes.js         in-memory index, filtering, search, sorting
│       ├── capture.js       page metadata via chrome.scripting.executeScript
│       ├── settings.js      chrome.storage.local wrapper
│       └── ui.js            shared DOM helpers, icons, toast
└── tests/                   node:test for pure modules + fixture vault
```

### 8.1 Permissions

```json
"permissions": ["activeTab", "scripting", "favicon", "storage"]
```

- `activeTab` + `scripting`: read title/description/og:image from the active
  tab when the popup opens (the action click grants it).
- `favicon`: local `_favicon` URLs for cards; no Google favicon requests.
- `storage`: settings and remembering the open library tab.
- No host permissions, no `tabs`, no `<all_urls>`.
- Pages that cannot be injected (`chrome://`, `about:`, the Web Store) show a
  clear "This page can't be saved" state.

### 8.2 Popup (Raindrop-style save)

360 px popup, opened by the toolbar icon:

```
┌───────────────────────────────┐
│ [ cover preview   16:9     ]  │
│ Title ....................   │
│ https://domain/…              │
│ Description ..............   │
│ Tags: [bookmarks] [rice ×]    │
│ Collection: [Development ▾]   │
│           [ Cancel ] [ Save ] │
└───────────────────────────────┘
```

- Prefill from `capture.js`: `og:title` → `document.title`; canonical URL or
  `location.href`; `og:description` → `meta[name=description]`;
  `og:image`/`twitter:image` resolved to absolute; favicon link or
  `/favicon.ico`. Only `http(s)` URLs are accepted; cover images must be
  `http(s)` and are capped at 2000 chars.
- Tags input with chips: Enter/comma commits, autocomplete from existing tags.
- Collection select is the folder tree plus "Unfiled" (store root).
- Save writes the note, then shows "Saved ✓" with **Open library** and
  **Open in Obsidian** (when the vault name is known) and **Save another**.
- Duplicate URL check against the index: "Already saved in Development" with
  **Open** and **Save anyway**. Saving anyway resolves the filename collision.
- First run / no permission: "Set up Vaultmarks" → opens the library.

### 8.3 Library (full tab)

Opened as `chrome-extension://<id>/src/library/library.html`, reused if already
open (tab id kept in `chrome.storage.session`). Minimal, list-first — the
Raindrop screenshot the user approved, minus the clutter:

```
┌────────────────────────────────────────────────────────────┐
│ Vaultmarks      [ / Search… ]                              │
├──────────────┬─────────────────────────────────────────────┤
│ All books 239│  Development                                │
│ Collections  │  ┌──────┐ Cozytile_hyprland                  │
│  Development │  │ img  │ A Cozy rice ❃                       │
│   Learning   │  └──────┘ github.com · Jun 16, 2025           │
│  Design      │  ┌──────┐ MOUSE: P.I. For Hire               │
│  Entertainment│ │ img  │ Jazz-fueled shooter in rubber-hose…  │
│  Self-Hosting│  └──────┘ store.steampowered.com · Apr 11     │
│  …           │                                             │
└──────────────┴─────────────────────────────────────────────┘
```

- Sidebar: **All bookmarks** with a count, then **Collections** — the folder
  tree with counts and disclosure. Nothing else: no Unsorted, no Trash, no tag
  list, no upgrade blocks.
- Main header: the current collection name and a search field. Search covers
  title, domain/URL, description and tags, case-insensitive, debounced; `/`
  focuses it. No sort dropdown and no view toggle — newest first, always the
  list.
- Rows: 64×48 thumbnail (cover, falling back to a favicon tile), a title line,
  a description clamped to **two lines**, then `domain · created`. Clicking the
  thumbnail or title opens the bookmark in a new tab. On hover/focus three icon
  buttons appear: eye (detail panel), pencil (detail panel in edit mode), trash
  (confirm, then move to `.vaultmarks-trash`). No multi-select and no
  bulk-action bar.
- Selecting a collection filters to it and its subfolders. Selecting
  **All bookmarks** clears it.
- The Collections header has a single **+** that creates a folder inside the
  currently selected collection, or at the store root when **All bookmarks** is
  active (validated name, collisions rejected). The sidebar lists every folder,
  including empty ones; nested folders made in Obsidian also appear. **Move to…**
  lists every folder.
- Detail panel (modal `<dialog>`): cover if present, title, URL, description,
  created, tag chips, collection; actions Open, Copy link, Edit, Move to…,
  Delete (confirm), Open in Obsidian. Edit toggles the panel into fields with
  Save/Cancel.
- New bookmark button: same form, blank.
- Empty states: no folder, no bookmarks, no search results; onboarding takes
  over the whole page when no handle exists.
- Settings (small panel from the folder name at the bottom of the sidebar):
  folder name, Change folder, Rescan, skipped-note count, version.
- Theme follows `prefers-color-scheme`; no external fonts.

### 8.4 Live behaviour

- The library rescans on load, on `window` focus / `visibilitychange`, after
  every mutation, and via **Rescan** in settings.
- After a popup save, the popup broadcasts `vault-changed` via
  `chrome.runtime.sendMessage`; an open library refreshes.
- There is no filesystem watcher (FSA has none); edits made in Obsidian appear
  at the next focus or rescan.
- Scans run one at a time with a generation counter; file parsing has a small
  concurrency limit (8) so a 239-note vault stays responsive.

## 9. Edge cases and error handling

- Folder deleted/moved outside Chromium → `NotFoundError`: show onboarding
  with "Folder not found; choose it again".
- Permission `denied` → onboarding; `prompt` → reconnect banner.
- Note with invalid frontmatter → skipped and counted; never rewritten.
- Duplicate titles → numbered filenames; duplicate URLs → duplicate notice.
- Emoji and non-Latin titles (e.g. a Hindi title with emoji) are preserved;
  sanitization only touches forbidden filesystem characters.
- Very long titles/descriptions are truncated for filename (120 chars) and
  description (1000 chars) only.
- Any write error is shown inline with a retry path; nothing is reported as
  saved unless `close()` on the writable succeeded.
- Trash move failure leaves the original file untouched.

## 10. Testing

- `node --test tests/*.test.js` for pure modules:
  - parse → patch → serialize round-trips preserve unknown keys, key order,
    comments, CRLF, BOM and body bytes;
  - frontmatter variants (quoted, unquoted, block tags, inline tags, dates);
  - filename sanitization and case-insensitive collision numbering, including
    the 200-byte cap for Devanagari and emoji titles;
  - URL normalization and duplicate detection;
  - search/filter/sort.
- A fixture vault under `tests/fixtures/` mirrors real notes (including the
  cover-in-body convention and a non-Latin title).
- Manual checklist for the extension: load unpacked, onboarding, save from
  popup, edit, move, delete to trash, Obsidian sees changes, reconnect after a
  browser restart, unsupported-page state.

## 11. Decisions left to the builder

- Exact visual design (spacing, accent colour, card radii) within the
  `prefers-color-scheme` light/dark system.
- Whether the connect flow needs an explicit confirmation step after picking
  the folder.
- Internal helper signatures and module boundaries within `src/lib`.
- Icon artwork (simple bookmark/vault mark in PNG at four sizes).
- Wording of microcopy and empty states.

## 12. Risks

- **Permission re-grant after restart** (approach A's known cost). Mitigated by
  the reconnect banner and a clear popup state; approach B is the escape hatch.
- **File System Access API availability** on Brave is behind a flag; Chromium
  and Chrome are the targets (user runs Chromium 155).
- **Cover hotlinking**: some sites block their `og:image`; the card falls back
  to a favicon tile, and the note still carries the URL.
- **No atomic multi-file operations**: each note write is independent; the
  vault is Markdown, and Dropbox/Obsidian history remain the recovery layer.

## 13. Later (not v1)

Context-menu and keyboard capture, side panel, Chrome bookmark import, full
article capture, multi-select and bulk actions, legacy cover backfill, cover
editing, drag-and-drop ordering, folder rename/delete, trash UI, multi-vault
switching.
