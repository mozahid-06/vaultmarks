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
