# Vaultmarks — Collection management (delete / rename / move)

Date: 2026-11-16

## Intent and why

The panel can create collections but not remove or reorganize them; that was a
v1 non-goal (`2026-11-15-vaultmarks-design.md:49`). A collection is just a
folder in the vault, and a bookmark's collection is the folder its `.md` lives
in — there is no `collection` field. So delete/rename/move are operations on the
store's folder tree, and a note's folder location is the only thing that ties it
to a collection. This change lets the panel manage that tree from inside the
panel, matching what Obsidian sees, while keeping the app's "never destroy data"
posture.

## Goals

- Delete a collection, recoverably: move the folder **and its contents** into
  `<store>/.vaultmarks-trash/<ISO>--<name>`.
- Rename a collection in place.
- Move a collection under a new parent.
- The sidebar, counts and the new-bookmark collection dropdown reflect the
  change after the rescan. Empty folders continue to appear.

## Non-goals

- Drag-and-drop, multi-select, an empty-the-trash UI, manual reordering.
- Renaming/deleting from anywhere except the panel.
- Reconciling edits made in Obsidian while a dialog is open (a rescan handles it).

## Anti-goals

- Silent data loss: a delete must be recoverable (trash) and a move must never
  drop a note.
- Moving a folder into itself or one of its own descendants.
- Leaving the selection or the expanded set pointing at a path that no longer
  exists.

## Constraints

- File System Access API; no build step; no dependencies; `node --test`; MV3;
  no inline script/handlers.
- Destructive operations run only after `requireWritableStore()` and throw
  `VaultError` codes (`invalid-name`, `exists`, `io`, `partial`,
  `needs-permission`), as the existing write paths do.
- Tests run `src/lib/vaultfs.js` against the Node-backed fake in
  `tests/vault-fs.test.js`.

## Approaches

Delete when non-empty:

1. **Trash the folder with its contents** — recoverable, same spirit as deleting
   a note. Picked.
2. Refuse until the user empties it — safest but more steps; the panel already
   knows how to trash notes, so it can trash a folder too.
3. Permanent delete — fast but unrecoverable; against the app's posture.

Rename/move mechanism:

1. **One prompt pre-filled with the folder's full store-relative path** — change
   the last segment to rename, change the path to relocate. Cheapest, and
   consistent with the prompt-based `+`. Picked.
2. A "Move to..." dialog that picks a parent from the collection tree, plus a
   separate rename prompt — more discoverable, more UI to build and keep
   consistent.
3. Drag-and-drop — a separate, larger feature (a v1 non-goal).

UI placement: hover actions on the collection row (rename, delete), mirroring
the bookmark rows. Picked over a context menu or an always-visible "..." menu.

## The how (decided)

- **UI** (`src/library/library.js`, `src/library/library.css`)
  - On hover, a collection row shows two icon buttons after the disclosure:
    **rename** (`pencil`) and **delete** (`trash`).
  - Rename: `window.prompt` pre-filled with the folder's full path (e.g.
    `Dev/Js`). Blank/cancel aborts.
  - Delete: `window.confirm` naming the bookmark count (e.g. "Move *Dev* and
    its 12 bookmarks to trash?").
- **Store** (`src/lib/vaultfs.js`)
  - `moveDirectory(path, destination)`: `destination` is the new full path.
    Trim/validate each segment like `createDirectory`; reject if `destination`
    exists, if it equals `path`, or if it is inside `path`; create missing
    parents; move the directory (prefer `FileSystemHandle.move()`, else
    recursive copy-then-remove with verification); return `{ path: destination }`.
  - `trashDirectory(path)`: move the folder into
    `.vaultmarks-trash/<ISO>--<name>` (trash dir created on demand), same
    move strategy; on failure leave the original intact.
- **Panel state** after success
  - Move/rename: remap `state.collection` and every `expanded` entry under the
    old prefix to the new prefix, so the selection and open folders follow.
  - Delete: drop `expanded` entries under the old prefix; if
    `state.collection` was the folder or under it, reset it to `''`.
  - Then toast and `refresh()`.

## Left to the builder

- Exact directory-move fallback when `handle.move` is unavailable for
  directories (recursive copy + verified remove of the source).
- Icon placement/spacing in `.collection-row` and hover affordance in CSS.
- Exact confirm/toast copy.
- Whether the `.vaultmarks-trash` folder name should include the timestamp
  before or after the original name (match `trashFile`: `<ISO>--<name>`).
