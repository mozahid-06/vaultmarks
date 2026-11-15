# Vaultmarks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal Raindrop-style Chromium extension that reads, edits and adds bookmark notes in an Obsidian vault folder, with no server or helper process.

**Architecture:** A Manifest V3 extension with two pages — a toolbar popup for capture and a full-tab library — plus shared ES modules. The user picks the vault folder once with the File System Access API; the directory handle is stored in IndexedDB, and every operation reads/writes the Markdown notes directly. Existing notes are patched surgically so unknown frontmatter keys and bodies survive.

**Tech Stack:** Plain ES modules, HTML, CSS, Manifest V3, `node:test`; no dependencies, no build step; ImageMagick/rsvg only to generate icons once.

**Spec:** `docs/superpowers/specs/2026-11-15-vaultmarks-design.md`

## Global Constraints

- Browser target: Chromium 155 (File System Access API required); extension name `Vaultmarks`, version `0.1.0`.
- No dependencies, no bundler, no build step. Node 26 `node --test` for tests.
- Manifest V3; permissions exactly `["activeTab","scripting","favicon","storage"]`; no `host_permissions`; no background service worker.
- No inline `<script>` or inline event handlers in extension pages; no `eval`.
- Note content (titles, descriptions, tags) is rendered with `textContent`, never `innerHTML`.
- The vault is the only bookmark store. `chrome.storage`/IndexedDB hold only the folder handle and small settings.
- Store resolution: `<picked>/Bookmarks` when that subfolder exists, otherwise `<picked>` itself.
- Base tag is `bookmarks`; new notes always include it.
- Never truncate existing values on save. Never add empty `image`/`favicon` keys. No legacy backfill or cover editing.
- Keep the real vault untouched during development: use `/tmp/vaultmarks-test-vault`.
- Commit after every task; conventional commit messages.

## Review Focus

These are the failure modes most likely to bite, each pinned by a test or a manual step in the owning task:

1. A note title or description containing HTML/`<script>` must render literally. (Task 9, textContent rule + manual step.)
2. A note changed in Obsidian between load and save must raise a conflict, never overwrite. (Task 3 `isStale` + Task 9 manual step.)
3. Losing folder permission after a browser restart must show a reconnect path, not crash. (Task 8 manual step.)
4. CRLF, BOM, comments, unknown keys and the body must survive every patch. (Task 3 tests.)
5. `chrome://` and Web Store pages must show "This page can't be saved", without an uncaught error. (Task 6 `isSavableUrl` + Task 7 manual step.)

---

### Task 1: Scaffold, manifest and icons

**Files:**
- Create: `.gitignore`, `package.json`, `manifest.json`, `icons/icon.svg`, `icons/icon-16.png`, `icons/icon-32.png`, `icons/icon-48.png`, `icons/icon-128.png`, `tests/manifest.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: a loadable MV3 extension root; `npm test` runs `node --test tests/`.

- [ ] **Step 1: Initialize the repository and directories**

```bash
cd /home/taxin/Work/vaultmarks
git init
mkdir -p src/lib src/popup src/library tests icons
```

- [ ] **Step 2: Write `.gitignore` and `package.json`**

`.gitignore`:

```
node_modules/
.DS_Store
```

`package.json`:

```json
{
  "name": "vaultmarks",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test tests/" }
}
```

- [ ] **Step 3: Write the failing manifest test**

`tests/manifest.test.js`:

```js
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

test('every declared icon is a PNG at its declared size', async () => {
  const paths = { ...manifest.icons, ...manifest.action.default_icon };
  for (const [size, path] of Object.entries(paths)) {
    const buf = await readFile(new URL(path, root));
    assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG');
    assert.equal(buf.readUInt32BE(16), Number(size));
    assert.equal(buf.readUInt32BE(20), Number(size));
  }
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL with `ENOENT` for `manifest.json`.

- [ ] **Step 5: Create `manifest.json` and the icon source, then generate the PNGs**

`manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "Vaultmarks",
  "description": "A minimal bookmark library stored as Markdown notes in your Obsidian vault.",
  "version": "0.1.0",
  "permissions": ["activeTab", "scripting", "favicon", "storage"],
  "action": {
    "default_title": "Save to Vaultmarks",
    "default_icon": { "16": "icons/icon-16.png", "32": "icons/icon-32.png" }
  },
  "icons": {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

`icons/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#5b7cfa"/>
  <path d="M44 28h40a8 8 0 0 1 8 8v64l-28-18-28 18V36a8 8 0 0 1 8-8z" fill="#fff"/>
</svg>
```

Generate real PNGs:

```bash
rsvg-convert -w 16 -h 16 icons/icon.svg -o icons/icon-16.png
rsvg-convert -w 32 -h 32 icons/icon.svg -o icons/icon-32.png
rsvg-convert -w 48 -h 48 icons/icon.svg -o icons/icon-48.png
rsvg-convert -w 128 -h 128 icons/icon.svg -o icons/icon-128.png
magick identify icons/icon-*.png
```

Expected: four PNGs with the stated dimensions.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add .gitignore package.json manifest.json icons tests/manifest.test.js docs
git commit -m "chore: scaffold the MV3 extension with icons"
```

---

### Task 2: Parse existing clipper notes

**Files:**
- Create: `src/lib/markdown.js`, `tests/markdown-parse.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseNote(text, meta) -> { note: Note|null, reason: string|null }`; `Note` fields `{ key, dir, filename, title, url, created, description, image, favicon, tags, cover, body, raw, lastModified, size }`.

- [ ] **Step 1: Write the failing parse tests**

`tests/markdown-parse.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNote } from '../src/lib/markdown.js';

const key = 'Self-Hosting & Accounts/Hosting Providers/Vaultwarden.md';
const legacy = `---
title: "Vaultwarden"
url: "https://vaultwarden.example"
created: 2026-07-28
description: "Lightweight, self-hosted Bitwarden-compatible password manager server."
tags:
  - "bookmarks"
---

![](https://example.com/cover.png)

Lightweight, self-hosted Bitwarden-compatible password manager server.

[Open original ↗](https://vaultwarden.example)
`;

test('parses a clipper note and falls back to the first body image for the cover', () => {
  const { note, reason } = parseNote(legacy, { key, lastModified: 1, size: 2 });
  assert.equal(reason, null);
  assert.equal(note.title, 'Vaultwarden');
  assert.equal(note.url, 'https://vaultwarden.example');
  assert.equal(note.created, '2026-07-28');
  assert.equal(note.description, 'Lightweight, self-hosted Bitwarden-compatible password manager server.');
  assert.deepEqual(note.tags, ['bookmarks']);
  assert.equal(note.image, '');
  assert.equal(note.cover, 'https://example.com/cover.png');
  assert.equal(note.dir, 'Self-Hosting & Accounts/Hosting Providers');
  assert.equal(note.filename, 'Vaultwarden.md');
  assert.equal(note.key, key);
  assert.match(note.body, /^!\[\]\(https:\/\/example\.com\/cover\.png\)/);
});

test('parses inline tags, CRLF, a BOM and an image key', () => {
  const text = '\uFEFF---\r\ntitle: React\r\nurl: https://react.dev\r\ncreated: 2026-01-02\r\ndescription: "The library for web UIs"\r\nimage: "https://react.dev/logo.png"\r\ntags: [frontend, library]\r\n---\r\n\r\nBody\r\n';
  const { note, reason } = parseNote(text, { key: 'React.md', lastModified: 0, size: 0 });
  assert.equal(reason, null);
  assert.deepEqual(note.tags, ['frontend', 'library']);
  assert.equal(note.created, '2026-01-02');
  assert.equal(note.description, 'The library for web UIs');
  assert.equal(note.cover, 'https://react.dev/logo.png');
});

test('a note without url is not a bookmark', () => {
  const { note, reason } = parseNote('---\ntitle: "Note"\n---\n\nbody\n', { key: 'Note.md', lastModified: 0, size: 0 });
  assert.equal(note, null);
  assert.equal(reason, 'no-url');
});

test('a note without frontmatter reports a reason', () => {
  const { note, reason } = parseNote('# Hello\n', { key: 'Hello.md', lastModified: 0, size: 0 });
  assert.equal(note, null);
  assert.equal(reason, 'no-frontmatter');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/markdown-parse.test.js`
Expected: FAIL because `src/lib/markdown.js` does not exist.

- [ ] **Step 3: Implement `parseNote` in `src/lib/markdown.js`**

Rules:
- Identify an optional BOM, then a frontmatter block delimited by a line `---` and the next line `---`. Support LF and CRLF.
- Parse only the subset used by the vault: `key: "quoted"`, `key: unquoted`, dates as strings, tags as a block list (`  - "x"`) or inline `[a, b]`. Strip matching single/double quotes; unescape `\"` and `\\` in double-quoted scalars.
- `title` falls back to the filename without `.md`; all other missing fields default to `""` or `[]`.
- `image` is the frontmatter value; `cover` is `image`, else the first `![...](url)` in the body, else `""`.
- `dir` is everything before the last `/` in `meta.key`, or `""`; `filename` is the last component.
- Return `{ note: null, reason: 'no-frontmatter' }` when the block is absent, `'bad-frontmatter'` when unterminated or the root is not a mapping, and `'no-url'` when `url` is missing or empty.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/markdown-parse.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/markdown.js tests/markdown-parse.test.js
git commit -m "feat: parse Obsidian Web Clipper bookmark notes"
```

---

### Task 3: Create, patch and name notes

**Files:**
- Modify: `src/lib/markdown.js`
- Create: `tests/markdown-write.test.js`

**Interfaces:**
- Consumes: `parseNote` from Task 2.
- Produces: `createNoteText({ title, url, created, description, image, favicon, tags }) -> string`, `patchFrontmatter(text, changes) -> string`, `filenameBase(title, hostname) -> string`, `uniqueFilename(base, existingNames) -> string`, `isStale(note, freshText) -> boolean`. `changes` is a subset of the managed keys, with strings or a tag array; `uniqueFilename` returns a name ending in `.md`.

- [ ] **Step 1: Write the failing write/patch tests**

`tests/markdown-write.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNoteText, patchFrontmatter, filenameBase, uniqueFilename, isStale } from '../src/lib/markdown.js';

test('createNoteText produces the exact clipper shape', () => {
  const text = createNoteText({
    title: 'Cozytile_hyprland',
    url: 'https://github.com/darkkal44/cozytile',
    created: '2025-06-16',
    description: 'A Cozy rice ❃',
    image: 'https://github.com/preview.png',
    favicon: 'https://github.com/favicon.ico',
    tags: ['bookmarks', 'rice'],
  });
  assert.equal(text, `---
title: "Cozytile_hyprland"
url: "https://github.com/darkkal44/cozytile"
created: 2025-06-16
description: "A Cozy rice ❃"
image: "https://github.com/preview.png"
favicon: "https://github.com/favicon.ico"
tags:
  - "bookmarks"
  - "rice"
---

![](https://github.com/preview.png)

A Cozy rice ❃

[Open original ↗](https://github.com/darkkal44/cozytile)
`);
});

test('a minimal note omits empty image, favicon and description lines', () => {
  const text = createNoteText({
    title: 'Example', url: 'https://example.com', created: '2026-11-15',
    description: '', image: '', favicon: '', tags: ['bookmarks'],
  });
  assert.equal(text, `---
title: "Example"
url: "https://example.com"
created: 2026-11-15
description: ""
tags:
  - "bookmarks"
---

[Open original ↗](https://example.com)
`);
  assert.ok(!text.includes('image:'));
  assert.ok(!text.includes('favicon:'));
});

test('patch changes one managed line and preserves comments, unknown keys and body', () => {
  const text = `---
title: "A"
# keep me
custom: 42
url: "https://a.example"
tags:
  - "bookmarks"
---

Body
`;
  assert.equal(patchFrontmatter(text, { title: 'B' }), text.replace('title: "A"', 'title: "B"'));
});

test('patch inserts a missing non-empty key and never an empty image', () => {
  const text = `---
title: "A"
url: "https://a"
---

Body
`;
  assert.equal(
    patchFrontmatter(text, { description: 'Hi' }),
    `---
title: "A"
url: "https://a"
description: "Hi"
---

Body
`,
  );
  assert.equal(patchFrontmatter(text, { image: '' }), text);
});

test('patch preserves a 2194-character description when only the title changes', () => {
  const long = 'x'.repeat(2194);
  const text = `---
title: "A"
url: "https://a"
description: "${long}"
---

Body
`;
  const out = patchFrontmatter(text, { title: 'B' });
  assert.ok(out.includes(`description: "${long}"`));
});

test('patch replaces a block tag list with quoted items', () => {
  const text = `---
title: "A"
url: "https://a"
tags:
  - "bookmarks"
---

Body
`;
  assert.equal(
    patchFrontmatter(text, { tags: ['bookmarks', 'rice', 'linux'] }),
    `---
title: "A"
url: "https://a"
tags:
  - "bookmarks"
  - "rice"
  - "linux"
---

Body
`,
  );
});

test('patch keeps CRLF endings and the BOM', () => {
  const text = '\uFEFF---\r\ntitle: "A"\r\nurl: "https://a"\r\n---\r\n\r\nBody\r\n';
  assert.equal(
    patchFrontmatter(text, { title: 'B' }),
    '\uFEFF---\r\ntitle: "B"\r\nurl: "https://a"\r\n---\r\n\r\nBody\r\n',
  );
});

test('filenameBase sanitizes and fits 120 characters and 200 bytes', () => {
  assert.equal(filenameBase('Cozytile_hyprland', 'github.com'), 'Cozytile_hyprland');
  assert.doesNotMatch(filenameBase('a/b:c*?"<>|', 'example.com'), /[<>:"/\\|?*]/);
  const name = filenameBase('च'.repeat(150), 'example.com');
  assert.ok([...name].length <= 120);
  assert.ok(Buffer.byteLength(`${name}.md`) <= 200);
});

test('uniqueFilename is case-insensitive and numbers collisions', () => {
  assert.equal(uniqueFilename('React', []), 'React.md');
  assert.equal(uniqueFilename('React', ['react.md']), 'React (2).md');
  assert.equal(uniqueFilename('React', ['react.md', 'React (2).md']), 'React (3).md');
});

test('isStale compares the exact loaded bytes', () => {
  const note = { raw: 'abc' };
  assert.equal(isStale(note, 'abc'), false);
  assert.equal(isStale(note, 'abc\n'), true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/markdown-write.test.js`
Expected: FAIL because the named exports do not exist.

- [ ] **Step 3: Implement the exports in `src/lib/markdown.js`**

- `createNoteText`: frontmatter key order `title, url, created, description, image, favicon, tags`; omit `image`/`favicon` when empty; always write `description` (quoted, possibly `""`); `created` unquoted; tags as a quoted block list with `bookmarks` present exactly once (case-insensitive, preserving the caller's order). Body: optional `![](image)` + blank line, optional description + blank line, `[Open original ↗](url)`, one trailing newline.
- Quoting: wrap strings in double quotes and escape `\` and `"`; convert embedded newlines to spaces.
- `patchFrontmatter`: detect the EOL style and BOM; find the block; replace the value lines of keys present in `changes` (a block list for `tags`); insert missing managed keys in canonical order before the closing `---` only when the value is non-empty; leave every other byte, including the body, untouched. Return the input unchanged when no change applies. `created` is unquoted.
- `filenameBase`: replace `<>:"/\|?*` and control chars with `-`, collapse whitespace, trim trailing dots/spaces, fall back to the hostname, then `Bookmark`; cap at 120 code points and ensure `base + '.md'` is at most 200 UTF-8 bytes by dropping trailing code points.
- `uniqueFilename`: compare case-insensitively against `existingNames`; try `base.md`, then `base (2).md`, `base (3).md`, … re-fitting the base so the full name stays within 200 bytes.
- `isStale`: `note.raw !== freshText`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/markdown-write.test.js tests/markdown-parse.test.js`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/markdown.js tests/markdown-write.test.js
git commit -m "feat: create and surgically patch bookmark notes"
```

---

### Task 4: In-memory index, filtering, search, formatting

**Files:**
- Create: `src/lib/notes.js`, `tests/notes-index.test.js`

**Interfaces:**
- Consumes: `Note` from Task 2.
- Produces: `buildIndex(notes) -> { notes, collections, tags, byKey, byUrl }`, `filterNotes(index, { collection, query }) -> Note[]`, `sortNewest(notes) -> Note[]`, `normalizeUrl(url) -> string`, `domainOf(url) -> string`, `findByUrl(index, url) -> Note|null`, `formatDate(created, now?) -> string`, `obsidianUri(vaultName, storePath, key) -> string`, `BASE_TAG = 'bookmarks'`.

- [ ] **Step 1: Write the failing index tests**

`tests/notes-index.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIndex, filterNotes, sortNewest, normalizeUrl, domainOf,
  findByUrl, formatDate, obsidianUri, BASE_TAG,
} from '../src/lib/notes.js';

const note = (over) => ({
  key: 'X.md', dir: '', filename: 'X.md', title: '', url: '', created: '',
  description: '', image: '', favicon: '', tags: [], cover: '', body: '',
  raw: '', lastModified: 0, size: 0, ...over,
});

const notes = [
  note({ key: 'Development/React.md', dir: 'Development', filename: 'React.md', title: 'React', url: 'https://react.dev', created: '2026-01-02', description: 'The library', tags: [BASE_TAG, 'frontend'] }),
  note({ key: 'Development/Learning/TS.md', dir: 'Development/Learning', filename: 'TS.md', title: 'TypeScript', url: 'https://typescriptlang.org', created: '2025-12-01', description: 'Typed JavaScript', tags: [BASE_TAG] }),
  note({ key: 'Design/Figma.md', dir: 'Design', filename: 'Figma.md', title: 'Figma', url: 'https://figma.com', created: '2024-05-01', description: 'Design tool', tags: [BASE_TAG, 'design'] }),
];

test('buildIndex builds a nested tree with descendant counts', () => {
  const index = buildIndex(notes);
  assert.deepEqual(index.collections.map((c) => [c.path, c.count]), [['Design', 1], ['Development', 2]]);
  const dev = index.collections.find((c) => c.path === 'Development');
  assert.deepEqual(dev.children.map((c) => [c.path, c.count]), [['Development/Learning', 1]]);
});

test('tags exclude the base tag and are sorted by count then name', () => {
  const index = buildIndex(notes);
  assert.deepEqual(index.tags, [{ name: 'design', count: 1 }, { name: 'frontend', count: 1 }]);
});

test('filterNotes matches collection prefixes and every search token', () => {
  const index = buildIndex(notes);
  assert.deepEqual(filterNotes(index, { collection: 'Development', query: '' }).map((n) => n.title), ['React', 'TypeScript']);
  assert.deepEqual(filterNotes(index, { collection: '', query: 'typed javascript' }).map((n) => n.title), ['TypeScript']);
  assert.deepEqual(filterNotes(index, { collection: '', query: 'design tool' }).map((n) => n.title), ['Figma']);
  assert.deepEqual(filterNotes(index, { collection: '', query: 'nothing-here' }), []);
});

test('sortNewest orders by created desc then title', () => {
  assert.deepEqual(sortNewest(notes).map((n) => n.title), ['React', 'TypeScript', 'Figma']);
});

test('URL helpers normalize, display and find duplicates', () => {
  assert.equal(normalizeUrl('https://Example.com/a/#x'), 'https://example.com/a');
  assert.equal(normalizeUrl('https://example.com/'), 'https://example.com/');
  assert.equal(domainOf('https://www.example.com/x'), 'example.com');
  const index = buildIndex(notes);
  assert.equal(findByUrl(index, 'https://react.dev/').title, 'React');
});

test('formatDate omits the current year', () => {
  const now = new Date(2026, 10, 15);
  assert.equal(formatDate('2026-06-16', now), 'Jun 16');
  assert.equal(formatDate('2025-04-11', now), 'Apr 11, 2025');
  assert.equal(formatDate('', now), '');
});

test('obsidianUri points at the note inside the vault', () => {
  assert.equal(
    obsidianUri('notes', 'Bookmarks', 'Development/React.md'),
    'obsidian://open?vault=notes&file=Bookmarks%2FDevelopment%2FReact',
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/notes-index.test.js`
Expected: FAIL because `src/lib/notes.js` does not exist.

- [ ] **Step 3: Implement `src/lib/notes.js`**

- `buildIndex`: sort with `sortNewest`; build nested collection nodes keyed by path, counts including descendants; collections sorted case-insensitively by name; tags counted once per note, excluding `BASE_TAG`, sorted by count desc then name; maps by key and by normalized URL.
- `filterNotes`: `collection` matches `note.dir === collection` or a `collection + '/'` prefix; query is split on whitespace, every token must appear case-insensitively in title, description, URL, domain or tags.
- `sortNewest`: `created` desc as a string (ISO dates sort correctly), then title case-insensitively.
- `normalizeUrl`: parse with `new URL`; lowercase host; drop the hash; remove a trailing slash except for the root; return the original string trimmed on failure.
- `domainOf`: hostname without a leading `www.`, `""` on failure.
- `formatDate`: strict `YYYY-MM-DD`; output `Jun 16` for the same year as `now`, `Apr 11, 2025` otherwise; `""` for empty/invalid.
- `obsidianUri`: strip `.md`, join `storePath` and the key with `/`, `encodeURIComponent` both parameters.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/notes-index.test.js tests/markdown-*.test.js`
Expected: PASS (21 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/notes.js tests/notes-index.test.js
git commit -m "feat: index, filter and search bookmark notes"
```

---

### Task 5: Vault file layer

**Files:**
- Create: `src/lib/paths.js`, `src/lib/concurrency.js`, `src/lib/vaultfs.js`, `tests/vault-helpers.test.js`

**Interfaces:**
- Consumes: `parseNote`, `patchFrontmatter`, `filenameBase`, `uniqueFilename`, `isStale`, `domainOf` from Tasks 2–4.
- Produces: `VaultError` (with `.code`), `pickStore()`, `getStoredStore()`, `clearStoredStore()`, `permissionOf(handle)`, `requestPermission(handle)`, `scanStore(onProgress?)`, `readFileText(key)`, `writeNewFile(dir, base, text)`, `updateFile(note, changes)`, `moveFile(note, dir)`, `trashFile(note)`, `createDirectory(name)`; plus `joinPath`, `dirOf`, `baseOf` in `paths.js` and `mapLimit` in `concurrency.js`.

- [ ] **Step 1: Write the failing helper tests**

`tests/vault-helpers.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinPath, dirOf, baseOf } from '../src/lib/paths.js';
import { mapLimit } from '../src/lib/concurrency.js';

test('path helpers join and split vault keys', () => {
  assert.equal(joinPath('', 'React.md'), 'React.md');
  assert.equal(joinPath('Development', 'React.md'), 'Development/React.md');
  assert.equal(dirOf('Development/React.md'), 'Development');
  assert.equal(dirOf('React.md'), '');
  assert.equal(baseOf('Development/React.md'), 'React.md');
});

test('mapLimit preserves order and never exceeds the limit', async () => {
  let active = 0;
  let peak = 0;
  const out = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return n * 2;
  });
  assert.deepEqual(out, [2, 4, 6, 8, 10]);
  assert.ok(peak <= 2);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/vault-helpers.test.js`
Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement the helpers**

- `paths.js`: `joinPath(dir, name)`, `dirOf(key)`, `baseOf(key)`.
- `concurrency.js`: `mapLimit(items, limit, fn)` preserving order, starting at most `limit` tasks at once.

- [ ] **Step 4: Run the helper tests to verify they pass**

Run: `node --test tests/vault-helpers.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement `src/lib/vaultfs.js`**

Rules:
- IndexedDB database `vaultmarks`, object store `handles`, key `store`. `pickStore()` calls `showDirectoryPicker({ id: 'vaultmarks', mode: 'readwrite' })`; if it contains a `Bookmarks` directory, the store is that directory with `{ vaultName: picked.name, storePath: 'Bookmarks', storeLabel: picked.name + '/Bookmarks', obsidianLinks: true }`; otherwise the store is the picked directory with `{ vaultName: null, storePath: '', storeLabel: picked.name, obsidianLinks: false }`. Store the handle and return the settings object. A cancelled picker throws `VaultError('cancelled')`.
- `permissionOf` / `requestPermission` use `queryPermission`/`requestPermission` with `{ mode: 'readwrite' }` and return `granted|prompt|denied`; a missing handle is `VaultError('no-store')`.
- `scanStore`: throw `VaultError('needs-permission')` unless permission is `granted`. Walk recursively, skipping entries whose names start with `.`, reading only `.md` files. Gather handles, then parse with `mapLimit(files, 8, …)`. Count unparseable notes as `skipped`. Return `{ notes, skipped }`; call `onProgress(loaded, total)` after each parse.
- `readFileText(key)`: resolve the nested path and return `{ text, lastModified, size }`.
- `writeNewFile(dir, base, text)`: resolve/create the directory, list entry names, choose `uniqueFilename`, create with `create:true`, write in a `createWritable` stream, `close()`, return `{ key }`.
- `updateFile(note, changes)`: re-read `note.key`; if `isStale(note, text)` throw `VaultError('conflict')`; `patchFrontmatter`; write; if `changes.title` yields a different filename, rename to a unique sibling name. Return `{ key }`.
- Rename/move helper: use `FileSystemFileHandle.move(dirHandle, name)` when it exists; otherwise copy the text to the target, read it back and compare, then remove the source. A failed remove throws `VaultError('partial')` and leaves both files.
- `moveFile(note, dir)`: target a unique name in `dir`, move, return `{ key }`.
- `trashFile(note)`: create `.vaultmarks-trash` at the store root if needed; name `${new Date().toISOString().replace(/[:.]/g, '-')}--${note.filename}`; move; return `{ trashedAs }`. A failed move throws and leaves the original in place.
- `createDirectory(name)`: root only; trim; reject `/`, control characters, `.`/`..`, names over 200 bytes with `VaultError('invalid-name')`; reject an existing name case-insensitively with `VaultError('exists')`; create and return `{ path }`.
- Every write path checks `permissionOf === 'granted'` and throws `VaultError('needs-permission')` otherwise.

- [ ] **Step 6: Verify syntax and all unit tests**

Run: `node --check src/lib/vaultfs.js && npm test`
Expected: no syntax errors; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/vaultfs.js src/lib/paths.js src/lib/concurrency.js tests/vault-helpers.test.js
git commit -m "feat: add the File System Access vault layer"
```

---

### Task 6: Settings and page capture

**Files:**
- Create: `src/lib/settings.js`, `src/lib/capture.js`, `tests/capture.test.js`

**Interfaces:**
- Consumes: `domainOf` from Task 4; `VaultError` not needed here.
- Produces: `getSettings()`, `saveSettings(partial)`, `getLibraryTabId()`, `setLibraryTabId(id)`; `captureActiveTab()`, `normalizeMeta(raw, pageUrl)`, `isSavableUrl(url)`.

- [ ] **Step 1: Write the failing capture tests**

`tests/capture.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMeta, isSavableUrl } from '../src/lib/capture.js';

test('normalizeMeta resolves images, caps descriptions and falls back to the host', () => {
  const meta = normalizeMeta({
    title: '   ',
    url: 'https://example.com/a',
    description: ' d '.repeat(600),
    image: '/cover.png',
    favicon: 'data:image/png;base64,x',
  }, 'https://example.com/a');
  assert.equal(meta.title, 'example.com');
  assert.equal(meta.image, 'https://example.com/cover.png');
  assert.equal(meta.description.length, 1000);
  assert.equal(meta.favicon, 'https://example.com/favicon.ico');
});

test('normalizeMeta keeps an http favicon and trims the title', () => {
  const meta = normalizeMeta({
    title: '  A   page ', url: 'https://example.com', description: 'Hi',
    image: 'https://cdn.example.com/i.png', favicon: 'https://example.com/icon.png',
  }, 'https://example.com');
  assert.equal(meta.title, 'A page');
  assert.equal(meta.favicon, 'https://example.com/icon.png');
  assert.equal(meta.image, 'https://cdn.example.com/i.png');
});

test('isSavableUrl accepts only http and https', () => {
  assert.equal(isSavableUrl('https://example.com'), true);
  assert.equal(isSavableUrl('http://example.com'), true);
  assert.equal(isSavableUrl('chrome://settings'), false);
  assert.equal(isSavableUrl('file:///tmp/x'), false);
  assert.equal(isSavableUrl('not a url'), false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/capture.test.js`
Expected: FAIL because `src/lib/capture.js` does not exist.

- [ ] **Step 3: Implement `capture.js` and `settings.js`**

- `normalizeMeta(raw, pageUrl)`: collapse whitespace in the title; fall back to `domainOf(pageUrl)`; description collapsed and sliced to 1000; image resolved against `pageUrl`, kept only for `http(s)` and at most 2000 chars; favicon kept when `http(s)`, else `${origin}/favicon.ico`; URL = `pageUrl` when it is savable.
- `captureActiveTab()`: `chrome.tabs.query({ active: true, currentWindow: true })`, then `chrome.scripting.executeScript({ target: { tabId }, func: extractMeta })`; import the returned raw strings through `normalizeMeta`. Throw `Error('unsupported')` for non-savable URLs or injection failures. `extractMeta` is a self-contained function reading `og:title`, `document.title`, canonical/`location.href`, `og:description`, `meta[name=description]`, `og:image`, `twitter:image`, `link[rel~="icon"]`.
- `settings.js`: defaults `{ vaultName: null, storePath: '', storeLabel: '', obsidianLinks: false, lastCollection: '' }` in `chrome.storage.local`; `getSettings` merges defaults; `saveSettings` merges a partial; `getLibraryTabId`/`setLibraryTabId` use `chrome.storage.session`.

- [ ] **Step 4: Run the tests and syntax checks**

Run: `node --test tests/capture.test.js && node --check src/lib/settings.js && node --check src/lib/capture.js`
Expected: PASS (3 tests), no syntax errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/settings.js src/lib/capture.js tests/capture.test.js
git commit -m "feat: capture page metadata and persist settings"
```

---

### Task 7: Popup save flow

**Files:**
- Modify: `manifest.json`, `tests/manifest.test.js`
- Create: `src/popup/popup.html`, `src/popup/popup.css`, `src/popup/popup.js`, `src/lib/ui.js`, `tests/pages.test.js`

**Interfaces:**
- Consumes: `captureActiveTab`, `isSavableUrl`; `getSettings`, `saveSettings`, `getLibraryTabId`, `setLibraryTabId`; `getStoredStore`, `permissionOf`, `requestPermission`, `pickStore`, `scanStore`, `writeNewFile`; `buildIndex`, `findByUrl`, `domainOf`, `obsidianUri`, `BASE_TAG`; `filenameBase`, `createNoteText`.
- Produces: `ui.js` with `h(tag, props, ...children)`, `toast(message, kind)`, `icon(name)`, `faviconUrl(pageUrl, size)`, `openLibraryTab()`, `createTagInput({ input, chips, initial, suggestions })`, `collectionOptions(index)`.

- [ ] **Step 1: Add failing page tests**

`tests/pages.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('popup has no inline script or handlers and the wiring ids exist', async () => {
  const html = await read('src/popup/popup.html');
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  for (const id of ['setup', 'form', 'cover', 'title', 'url', 'description', 'tags', 'collection', 'save', 'status']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});
```

Add to `tests/manifest.test.js`:

```js
test('the action opens the popup page that exists', async () => {
  assert.equal(manifest.action.default_popup, 'src/popup/popup.html');
  await readFile(new URL(manifest.action.default_popup, root), 'utf8');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/pages.test.js tests/manifest.test.js`
Expected: FAIL because the popup page and `default_popup` are missing.

- [ ] **Step 3: Build `ui.js`**

- `h(tag, props, ...children)`: create an element, set `className`, attributes, event listeners (`on*` functions via `addEventListener`), and append children; strings become text nodes (`textContent`).
- `icon(name)`: build an SVG element with `document.createElementNS` from a small internal path table (eye, pencil, trash, plus, refresh, external, settings).
- `faviconUrl(pageUrl, size = 32)`: `chrome.runtime.getURL(\`/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=${size}\`)`.
- `openLibraryTab()`: reuse the stored tab id via `chrome.tabs.get/update`, else `chrome.tabs.create` with `chrome.runtime.getURL('src/library/library.html')` and store the id.
- `toast(message, kind = 'info')`: append a status node to the popup/library root that disappears after 4 s.
- `createTagInput({ input, chips, initial, suggestions })`: chips with a remove button, Enter/comma commits, Backspace removes the last, suggestions via a `<datalist>`; returns `{ getTags: () => string[] }`.
- `collectionOptions(index)`: `[{ value, label }]` with `''` labelled `Unfiled`, then every collection path indented by depth with two spaces.

- [ ] **Step 4: Build the popup page**

`src/popup/popup.html` (360 px layout): a `#setup` section (message + **Choose vault folder** button), a `#form` with `#cover` image, `#title` input, `#url` output, `#description` textarea, `#tags` chip area + input, `#collection` select, `#save` button, and `#status` live region. External `<script type="module" src="popup.js">`; no inline handlers.

`popup.js` behaviour:
1. On load: `getSettings()` and `getStoredStore()`; if `storeLabel` is empty or no handle exists, show `#setup` (the button calls `openLibraryTab()` because the picker belongs in the library tab). Otherwise `permissionOf(handle)`; when not `granted`, show **Reconnect in library** (opens the library); when granted, show "Loading…", `scanStore()` and `buildIndex`, and treat a `NotFoundError` like the reconnect state.
2. `captureActiveTab()`; on `unsupported`, show "This page can't be saved" and disable Save; otherwise fill the fields, cover image and tags (base tag hidden from chips, suggestions from `index.tags.map((t) => t.name)`), and preselect the last-used collection from `getSettings().lastCollection` when it still exists, else `Unfiled`.
3. Save: validate `http(s)` URL and non-empty title; duplicate check with `findByUrl` → show "Already saved in <collection>" with **Open** and **Save anyway**; on save, `writeNewFile(selectedDir, filenameBase(title, domainOf(url)), createNoteText({ ..., tags: [BASE_TAG, ...userTags] }))`, keep the returned `key`, then show "Saved ✓" with **Open library**, **Open in Obsidian** (`obsidianUri(settings.vaultName, settings.storePath, key)` when `obsidianLinks`), and **Save another**.
4. After a successful save, `chrome.runtime.sendMessage({ type: 'vault-changed' })` (ignore "no receiver" errors) and `saveSettings({ lastCollection: selectedDir })`.
5. Keep focus in the title field on open; Save on Ctrl/Cmd+Enter.

`popup.css`: compact Raindrop-ish styling, system font, `prefers-color-scheme`, 360 px body, cover 16:9 with `object-fit: cover`, disabled states.

- [ ] **Step 5: Add `default_popup` to `manifest.json`**

```json
"action": {
  "default_popup": "src/popup/popup.html",
  "default_title": "Save to Vaultmarks",
  "default_icon": { "16": "icons/icon-16.png", "32": "icons/icon-32.png" }
}
```

- [ ] **Step 6: Run the tests and syntax checks**

Run: `npm test && node --check src/popup/popup.js && node --check src/lib/ui.js`
Expected: all tests pass (including the new page test), no syntax errors.

- [ ] **Step 7: Manual popup check (human or browser-driving agent)**

Setup once:

```bash
rm -rf /tmp/vaultmarks-test-vault
mkdir -p /tmp/vaultmarks-test-vault/Bookmarks
cp -a "/home/taxin/Documents/notes/Bookmarks/." /tmp/vaultmarks-test-vault/Bookmarks/
chromium --user-data-dir=/tmp/vaultmarks-chromium \
  --disable-extensions-except=/home/taxin/Work/vaultmarks \
  --load-extension=/home/taxin/Work/vaultmarks https://example.com
```

Verify: the toolbar icon opens the popup; before setup it offers the setup state; after choosing `/tmp/vaultmarks-test-vault` in the library, reopening the popup prefills title/description/cover; Save creates a note and the exact frontmatter shape; saving the same URL again shows "Already saved"; `chrome://settings` shows "This page can't be saved".

- [ ] **Step 8: Commit**

```bash
git add manifest.json tests/manifest.test.js tests/pages.test.js src/popup src/lib/ui.js
git commit -m "feat: add the Raindrop-style save popup"
```

---

### Task 8: Library onboarding, sidebar and list

**Files:**
- Create: `src/library/library.html`, `src/library/library.css`, `src/library/library.js`
- Modify: `tests/pages.test.js`, `src/lib/ui.js`

**Interfaces:**
- Consumes: all popup components, plus `permissionOf`, `requestPermission`, `pickStore`, `getStoredStore`, `clearStoredStore`, `scanStore`, `createDirectory`, `buildIndex`, `filterNotes`, `formatDate`, `domainOf`, `faviconUrl`, `openLibraryTab`; `getSettings`, `saveSettings`.
- Produces: the library shell with `#onboarding`, `#reconnect`, `#sidebar`, `#collections`, `#all`, `#search`, `#list`, `#empty`, `#new-bookmark`, `#settings`; row rendering used by Task 9.

- [ ] **Step 1: Extend the failing page test**

Add to `tests/pages.test.js`:

```js
test('library has no inline script or handlers and the wiring ids exist', async () => {
  const html = await read('src/library/library.html');
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  for (const id of ['onboarding', 'reconnect', 'sidebar', 'all', 'collections', 'search', 'list', 'empty', 'new-bookmark', 'settings', 'detail']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/pages.test.js`
Expected: FAIL because the library page is missing.

- [ ] **Step 3: Build the library shell**

`library.html`: header with the Vaultmarks wordmark and `#search`; a sidebar with `#all`, a Collections header with a `+` button, and `#collections`; a main area with the current collection title, `#new-bookmark`, `#list`, `#empty`; `#onboarding` and an inline `#reconnect` banner; a `<dialog id="detail">` and a `<dialog id="settings">`; external module script; no inline handlers.

`library.js` behaviour:
1. `init()`: `getSettings()`; if no stored handle → show `#onboarding` with **Choose your Obsidian vault folder** (the click calls `pickStore()`, `saveSettings(result)`, then `refresh()`); if `permissionOf` is `prompt` → show `#reconnect` (**Reconnect folder** → `requestPermission` → `refresh`); if `denied` → onboarding again.
2. `refresh()`: guard against concurrent scans with a generation counter; `scanStore` → `buildIndex`; render the sidebar, the list and the empty/summary line. Show "Scanning…" while running. Catch `VaultError('needs-permission')` by showing `#reconnect`; catch `VaultError('no-store')` and a `NotFoundError` from the folder by calling `clearStoredStore()`, resetting settings and showing onboarding with "Folder not found; choose it again."
3. Sidebar: **All bookmarks** with the total count; a nested collection list with counts and disclosure; clicking an item sets `state.collection` and rerenders. `+` calls `prompt('Collection name')`, then `createDirectory`; refresh and toast on success, or toast the `exists`/`invalid-name` error.
4. Search: debounce 120 ms; `/` focuses; Escape clears.
5. Rows: `<a>` thumbnail + title opening the URL in a new tab; a description clamped to two lines; `domain · formatDate(created)`; `loading="lazy"` on the cover; `onerror` swaps to the favicon tile. Use `textContent` for every note field. Row actions come in Task 9.
6. Live updates: refresh on `window` focus and `visibilitychange` (debounced 300 ms); `chrome.runtime.onMessage` `{ type: 'vault-changed' }` refreshes. Do not refresh while a dialog is open and edited.
7. Settings dialog: store label, **Change folder** (re-runs onboarding), **Rescan**, skipped-note count, version.
8. Empty states: no folder (onboarding), no bookmarks ("No bookmarks yet"), no results ("No matches").

`library.css`: the approved minimal layout — 260 px sidebar, 64×48 thumbnails, two-line description clamp, hover row highlight, `prefers-color-scheme`, no external fonts.

- [ ] **Step 4: Run the tests and syntax checks**

Run: `npm test && node --check src/library/library.js`
Expected: all tests pass, no syntax errors.

- [ ] **Step 5: Manual library check**

Using the test vault from Task 7: the onboarding appears on first open; after picking `/tmp/vaultmarks-test-vault` the 239 notes render; counts match; search, collection filtering, row links and focus refresh work; no note is modified (compare a few `md5sum`s before/after).

Restart Chromium with the same profile and open the library again: the reconnect banner appears if the grant was not retained, and clicking **Reconnect folder** restores the list without a crash. Close the library, remove the test folder with `mv`, reopen the library: onboarding returns with "Folder not found".

Also create a collection with `+` and confirm the folder appears on disk and in the sidebar.

- [ ] **Step 6: Commit**

```bash
git add src/library tests/pages.test.js
git commit -m "feat: add the minimal library with collections and search"
```

---

### Task 9: Detail, edit, move, delete, create collection

**Files:**
- Modify: `src/library/library.js`, `src/library/library.css`, `src/library/library.html`, `src/lib/ui.js`
- Modify: `tests/pages.test.js` (detail form ids)

**Interfaces:**
- Consumes: `updateFile`, `moveFile`, `trashFile`, `createDirectory`, `writeNewFile`, `readFileText`; `createNoteText`, `filenameBase`; `dirOf`, `baseOf`; `collectionOptions`, `createTagInput`, `toast`, `icon`, `obsidianUri`, `domainOf`.
- Produces: the interactive detail panel and row actions used by the final checklist.

- [ ] **Step 1: Extend the failing page test**

Add to the library ids in `tests/pages.test.js`: `detail-title`, `detail-url`, `detail-description`, `detail-tags`, `detail-collection`, `detail-save`, `detail-cancel`, `detail-open`, `detail-edit`, `detail-delete`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/pages.test.js`
Expected: FAIL because the detail form ids are missing.

- [ ] **Step 3: Implement the detail panel and row actions**

- Row hover/focus buttons: eye (`data-action="view"`), pencil (`data-action="edit"`), trash (`data-action="delete"`). Clicking the thumbnail/title still opens the URL. Buttons use `event.stopPropagation()`.
- Detail dialog opens with `<dialog>.showModal()`; view mode shows cover, title, URL, description, created, tag chips (base tag hidden) and collection; actions **Open**, **Copy link**, **Edit**, **Move to…** (switches to edit mode and focuses the collection select), **Delete**, **Open in Obsidian** (only when `obsidianLinks`), **Close**.
- Edit mode reuses the same dialog with inputs and the tag input; **Save** builds `changes` from the fields and calls `updateFile`. If the collection also changed, call `moveFile` after `updateFile` succeeds, passing a note whose `key`, `dir` and `filename` come from the returned `updated.key` (`dirOf`/`baseOf`); if the move fails, report it and leave the edited note in its old collection. **Cancel** restores view mode.
- New bookmark button opens the dialog empty in create mode; Save calls `writeNewFile` with `filenameBase(title, domainOf(url))` and `createNoteText`; refresh and toast.
- Delete asks `confirm('Move this bookmark to the hidden trash folder?')`, calls `trashFile`, closes the dialog, refreshes.
- Conflict: when `updateFile` throws `VaultError('conflict')`, show "This note changed in Obsidian. Reload and try again." with a **Reload** action that refreshes the note; never write.
- Write errors are shown in the dialog's status line, not just a toast, keyed by `VaultError.code`: `conflict`, `needs-permission`, `partial`, `exists`, `invalid-name`; any other error shows its message. Nothing is reported as saved unless the write resolved (the vault layer only returns after `close()`).
- All note-derived text is set with `textContent`; a note title containing `<script>` must render literally.
- After every mutation, `chrome.runtime.sendMessage({ type: 'vault-changed' })` (ignore receiver errors).

- [ ] **Step 4: Run the tests and syntax checks**

Run: `npm test && node --check src/library/library.js`
Expected: all tests pass, no syntax errors.

- [ ] **Step 5: Manual interaction check**

Using the test vault: hover actions appear; detail view/edit works; title edit renames the file; description/tag edits patch only the frontmatter; moving changes the folder; delete lands in `.vaultmarks-trash`; a new bookmark writes a correct note; creating a collection creates the folder.

Conflict check: open a note in an editor, change one byte, then Save from the panel → the conflict message appears and the file is unchanged.

Injection check: create a note whose title is `<img src=x onerror=alert(1)>`; the library must show the literal text, not an image or alert.

- [ ] **Step 6: Commit**

```bash
git add src/library src/lib/ui.js tests/pages.test.js
git commit -m "feat: edit, move and delete bookmarks from the library"
```

---

### Task 10: README, manual checklist, final verification

**Files:**
- Create: `README.md`, `docs/manual-test-checklist.md`

**Interfaces:**
- Consumes: everything.
- Produces: install/usage documentation and the verification record.

- [ ] **Step 1: Write `README.md`**

Sections: what it is; requirements (Chromium); install (`chrome://extensions` → Developer mode → Load unpacked → this folder); first run (pick the vault folder); usage (popup, library, edit/move/delete); data format (the Clipper keys, base tag, cover fallback); permissions explained (`activeTab`/`scripting` for reading the active page, `favicon` for local icons, `storage` for settings); troubleshooting (reconnect after restart, "This page can't be saved", conflict message); tests (`npm test`); storage guarantees (only the picked folder; `.vaultmarks-trash`).

- [ ] **Step 2: Write `docs/manual-test-checklist.md`**

Copy the manual checks from Task 7 Step 7, Task 8 Step 5 and Task 9 Step 5 into a checkbox list, and add: load unpacked on the real vault (read-only browsing first), save one real bookmark, verify it in Obsidian, delete it to trash, restart Chromium and confirm the reconnect path.

- [ ] **Step 3: Run the full automated suite**

```bash
npm test
find . -name '*.js' -not -path './node_modules/*' -exec node --check {} \;
```

Expected: all tests pass; no syntax errors.

- [ ] **Step 4: Final manual pass on the real vault (human)**

Follow `docs/manual-test-checklist.md` against `/home/taxin/Documents/notes`; confirm Obsidian shows the new note with title, description, cover, favicon and tags, and that `Bookmark Viewer.md` renders it.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/manual-test-checklist.md
git commit -m "docs: add install, usage and manual verification guides"
```

---

## Self-Review Notes

- **Spec coverage:** setup/permission (Tasks 5, 8), note format and surgical writes (Tasks 2–3), legacy covers (Tasks 2, 8), filenames (Task 3), popup capture (Tasks 6–7), minimal library/list/search (Tasks 4, 8), detail/edit/move/delete/create collection (Task 9), settings/live refresh (Task 8), testing (throughout, Task 10).
- **Interfaces:** `Note` fields and the `changes` object are fixed in Tasks 2–3 and reused verbatim; `VaultError.code` values are named where consumed; `obsidianUri` arguments match Task 4 and Task 9.
- **Deliberate simplifications:** no background worker, no context menu, no side panel, no multi-select, no full-article capture, no backfill; the popup reuses the library for folder picking.
