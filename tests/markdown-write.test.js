import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNoteText, patchFrontmatter, filenameBase, uniqueFilename, isStale, parseNote } from '../src/lib/markdown.js';

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

test('URLs with parentheses or spaces keep their link and cover intact', () => {
  const url = 'https://en.wikipedia.org/wiki/Obsidian_(software)';
  const image = 'https://upload.wikimedia.org/foo bar_(1).png';
  const text = createNoteText({
    title: 'Obsidian', url, created: '2026-11-20',
    description: 'A note-taking app.', image, favicon: '',
  });

  assert.ok(text.includes('image: "https://upload.wikimedia.org/foo bar_(1).png"'));
  assert.ok(text.includes('![](<https://upload.wikimedia.org/foo%20bar_(1).png>)'));
  assert.ok(text.includes('[Open original ↗](<https://en.wikipedia.org/wiki/Obsidian_(software)>)'));

  const parsed = parseNote(text, { key: 'Bookmarks/Obsidian.md', lastModified: 0, size: 0 });
  assert.equal(parsed.note.url, url);
  assert.equal(parsed.note.image, image);
  assert.equal(parsed.note.cover, image);

  const bodyOnly = `---
title: "T"
url: "${url}"
---

![](<https://upload.wikimedia.org/foo%20bar_(1).png>)
`;
  const fromBody = parseNote(bodyOnly, { key: 'Bookmarks/T.md', lastModified: 0, size: 0 });
  assert.equal(fromBody.note.cover, 'https://upload.wikimedia.org/foo%20bar_(1).png');
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
