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
