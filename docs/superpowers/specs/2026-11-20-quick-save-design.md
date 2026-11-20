# Quick save from the panel

Date: 2026-11-20 · Status: approved

## Intent

Saving the page you are on should not require the full bookmark form. The
`+` in the panel toolbar now writes the note immediately, asking only where it
goes and what it is called.

## Behaviour

- **`+` (panel toolbar)** captures the active tab with the same capture used by
  **Save page**, then opens a compact **Quick save** dialog.
- The dialog asks for two things:
  - **Name** — pre-filled with the captured page title and selected, so typing
    replaces it. Empty falls back to the captured title.
  - **Collection** — every folder in the store; defaults to the last-used
    collection, then the selected one, then the root.
- The captured URL is shown as a muted line so it is clear what is being saved.
  The cover, description, favicon, `bookmarks` tag and `created` date come from
  the capture and are not asked for.
- <kbd>Enter</kbd> submits (the dialog is a form). The note is written exactly
  like the form's create path, the list refreshes and a "Saved" toast appears.
- A duplicate URL writes nothing and shows *Already saved in &lt;collection&gt;*
  with **Open** / **Save anyway**, matching **Save page**.
- Unsupported pages (`chrome://…`, `file://`, the Web Store) toast
  *"This page can't be saved."*; a lost folder grant shows the reconnect banner.
- The full-tab view hides **+** together with **Save page**: there is no web
  page to capture there.

## Manual creation

The `+` no longer opens the empty form, so **New** (list header, right side)
opens it unchanged. It still defaults its collection to the selected one
without touching the last-used collection.

## Approaches considered

1. **Reuse the detail dialog in a new `quick` mode** (chosen) — duplicate,
   conflict, validation, settings and toast handling are shared; only the
   URL/description/tags fields are hidden and the heading/labels change.
2. A separate quick-save dialog — cleaner markup, but duplicates the submit,
   duplicate and error paths.
3. A browser `prompt()` chain — no styling, no collection picker, no duplicate
   handling.

## Non-goals

- Fetching metadata for a pasted link: that needs host permissions the
  extension deliberately avoids (the Obsidian page gets it from `requestUrl`).
- Editing tags or the description in Quick save; use **Save page** or **Edit**.

## Tests

`tests/pages.test.js` covers the new wiring ids. The capture/prefill helpers are
unchanged and still covered. The dialog flow itself is in
`docs/manual-test-checklist.md` (Quick save steps).
