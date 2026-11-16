# Collection drag-and-drop — design

**Status:** approved by the human partner by opt-out ("do whatever you want");
the decisions below are the builder's calls, recorded so the plan and the
reviewer can argue from them.

## Intent and why

The sidebar can already move a collection (the hover **pencil** opens a prompt
pre-filled with the current path; typing `Parent/Name` relocates the folder and
everything in it). The human partner could not find it — a pencil whose tooltip
says "Rename or move" plus a path prompt is not a discoverable way to reorganize
collections. They asked for the direct gesture instead: **drag a collection row
onto another row to nest it there.**

The vault has nine top-level collections and several natural parents, so nesting
is the point. The pencil prompt stays as the keyboard/fallback path.

## Goals

- Drag a collection row onto another collection row → it becomes a subcollection
  there (the folder and its whole subtree move).
- Drag a collection row onto the **All bookmarks** row → it moves back to the top
  level.
- Illegal drops are refused with feedback and touch nothing: onto itself, onto
  one of its own descendants, or onto a collection that already has a child of
  that name.
- Reuse the existing, hardened `moveDirectory` — no new store code.

## Non-goals

- **Reordering siblings.** The tree is built from folder paths and sorted
  alphabetically (`sortTree` in `notes.js`); the vault has no notion of
  collection order, so a drag changes *where* a collection lives, not *which
  order* it sits in. Explicit ordering would be a separate, larger change.
- Multi-select drag, touch drag, drop-to-trash, undo.

## Anti-goals

- A drop that loses a note or leaves the panel pointing at a path that no longer
  exists. The store already refuses self/descendant/collision moves and moves a
  directory as a unit; the UI must not bypass that by writing to the filesystem
  itself.

## Constraints

- MV3, no dependencies, no build step, `node --test`, no inline `<script>` or
  `on*=` handlers, no `innerHTML`/`eval`; `permissions` unchanged.
- Drag is a mouse affordance; the pencil prompt remains for keyboard users.
- Never destroy data: the store refuses illegal moves before any filesystem work.

## Approaches considered

- **A — HTML5 drag events on the rows, with the drop decision in one pure helper
  and the move done by the existing `moveDirectory`.** Chosen.
- **B — a "Move to…" menu listing the collections.** Rejected: the human partner
  picked the drag gesture over a menu.
- **C — a custom pointer-events drag.** Rejected: more code and more failure
  modes for no gain over HTML5 drag-and-drop in Chromium.

## The design

- New pure helper `dropDestination(source, target)` in `src/lib/paths.js`:
  returns where `source` goes when dropped on `target`, or `null` when the drop
  is meaningless or illegal. `target === ''` means the top level.
- `renderNodes` marks each collection row draggable and carries its path in
  `data-path`; `#all` (the All bookmarks row) is the top-level drop target.
- Drag start/over/leave/drop/end are handled by **delegation** on `#collections`
  (and on `#all`), so the handlers bind once and survive re-renders.
- The move itself is the rename handler's body, extracted into
  `moveCollection(fromPath, destination)` and called by both the prompt and the
  drop. After a success the target collection is expanded so the moved child is
  visible; the selection and expanded state are remapped exactly as they are
  today.
- A valid hover target gets an accent outline; the dragged row dims. An illegal
  target simply does not accept the drop (`preventDefault` is not called).

## Left to the builder

- Exact highlight styling and whether to change the cursor to `grab`.
- Whether the store's `exists` refusal is surfaced as a toast (it is — the shared
  error path already does this).
