# Panel ergonomics: keyboard, sort, tags, confirmations

Date: 2026-11-20 · Status: approved

A "feel" pass on the panel: the features were right, but using it for a few
minutes exposed five everyday gaps. All changes are local to the panel, need
no new permissions, and keep the note files untouched.

## 1. Keyboard navigation

The list is a single-selection list driven from `state.selected` (the note
key) and repainted with `.row.selected`. Selection survives filtering while
the note is still visible and clears otherwise.

| Key | Action |
| --- | --- |
| <kbd>↑</kbd> / <kbd>↓</kbd> | move the selection (first press selects the first/last row) |
| <kbd>Home</kbd> / <kbd>End</kbd> | first / last row |
| <kbd>Enter</kbd> | open details for the selected row |
| <kbd>e</kbd> | edit the selected row |
| <kbd>d</kbd> | delete the selected row (after confirmation) |
| <kbd>n</kbd> | open the new-bookmark form |
| <kbd>/</kbd> | focus search |
| <kbd>Esc</kbd> | clear the selection, then search and tag filters |

Typing targets (`input`, `textarea`, `select`, contenteditable) and modifier
combinations are ignored, and the handler is inert while a dialog is open so
native dialog keys keep working. <kbd>Enter</kbd> on a focused button or link
activates that control instead of opening details.

## 2. Sort control

`sortNotes(notes, mode)` in `src/lib/notes.js` supports `newest` (the
existing order, also used by `buildIndex`), `oldest` and `title`. Ties fall
back to the title, then the date. The list header has a small `<select>`; the
choice is stored as `settings.sort` (`newest` by default) and reapplied on
open. Sorting never mutates the input array.

## 3. Tag filtering

`filterNotes()` accepts `tag` and matches it case-insensitively against the
note's tags, combined with the collection and search filters. Tags in a
bookmark's detail view are now buttons: clicking one clears the collection
and search, sets the tag filter and closes the dialog. The list header shows
a `#tag` chip while the filter is active; clicking it clears the tag.
Typing `#tag` in the search box is not special — the chip is the only
representation of the tag filter.

## 4. In-app delete confirmation

`window.confirm` is gone. A small `<dialog id="confirm">` asks before moving
a bookmark or a collection to `.vaultmarks-trash`. `askConfirm()` returns a
promise resolved by **Move to trash**, **Cancel**, the close button or
<kbd>Esc</kbd>; focus lands on Cancel so <kbd>Enter</kbd> cannot delete by
accident. The bookmark message quotes the title; the collection message
names the folder and says how many bookmarks move with it.

## 5. Empty states and search highlighting

- **No bookmarks at all** — "No bookmarks yet" with **Save this page**
  (hidden in the tab view) and **New bookmark**.
- **Empty collection** — "Nothing here yet" with **Save this page** and
  **New bookmark**.
- **No matches** — "No matches" with **Clear filters**.

Search tokens are highlighted in row titles and descriptions. `mark`
elements are built from merged match ranges, so overlapping tokens do not
nest and the original casing is preserved. Matching stays purely visual; it
does not change what `filterNotes` returns.

## Non-goals

- No multi-select, no drag-reorder of bookmarks, no saved searches.
- No changes to the Obsidian Dataview viewer (it already has its own search,
  sorting and delete behaviour).
- No new permissions; everything is DOM state plus `chrome.storage.local`.

## Tests

`tests/notes-index.test.js` covers `sortNotes` (all modes, tie-breaks,
invalid mode, input immutability) and `filterNotes` with `tag` alone and
combined with collection and query. `tests/pages.test.js` asserts the new
wiring ids. The interaction flow is in `docs/manual-test-checklist.md`.
