import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIndex, filterNotes, sortNewest, sortNotes, normalizeUrl, domainOf,
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

test('buildIndex includes empty and directory-only collections from the scan', () => {
  const index = buildIndex(notes, ['Design', 'Development', 'Development/Learning', 'Empty', 'Empty/Deep']);
  assert.deepEqual(index.collections.map((c) => c.path), ['Design', 'Development', 'Empty']);
  const empty = index.collections.find((c) => c.path === 'Empty');
  assert.equal(empty.count, 0);
  assert.deepEqual(empty.children.map((c) => c.path), ['Empty/Deep']);
  assert.equal(empty.children[0].count, 0);
});

test('buildIndex synthesizes ancestor directories that were not listed', () => {
  const index = buildIndex([], ['A/B/C']);
  assert.deepEqual(index.collections.map((c) => c.path), ['A']);
  assert.deepEqual(index.collections[0].children.map((c) => c.path), ['A/B']);
  assert.deepEqual(index.collections[0].children[0].children.map((c) => c.path), ['A/B/C']);
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

test('filterNotes narrows by tag and combines it with collection and query', () => {
  const index = buildIndex(notes);
  assert.deepEqual(filterNotes(index, { tag: 'design' }).map((n) => n.title), ['Figma']);
  assert.deepEqual(filterNotes(index, { tag: 'DESIGN' }).map((n) => n.title), ['Figma']);
  assert.deepEqual(filterNotes(index, { tag: 'frontend' }).map((n) => n.title), ['React']);
  assert.deepEqual(filterNotes(index, { collection: 'Development', tag: 'frontend' }).map((n) => n.title), ['React']);
  assert.deepEqual(filterNotes(index, { collection: 'Design', tag: 'frontend' }), []);
  assert.deepEqual(filterNotes(index, { query: 'typescript', tag: 'design' }), []);
  assert.deepEqual(filterNotes(index, { tag: 'missing' }), []);
});

test('sortNotes orders by newest, oldest and title', () => {
  assert.deepEqual(sortNotes(notes).map((n) => n.title), ['React', 'TypeScript', 'Figma']);
  assert.deepEqual(sortNotes(notes, 'newest').map((n) => n.title), ['React', 'TypeScript', 'Figma']);
  assert.deepEqual(sortNotes(notes, 'oldest').map((n) => n.title), ['Figma', 'TypeScript', 'React']);
  assert.deepEqual(sortNotes(notes, 'title').map((n) => n.title), ['Figma', 'React', 'TypeScript']);
  assert.deepEqual(sortNotes(notes, 'nonsense').map((n) => n.title), ['React', 'TypeScript', 'Figma']);
  assert.deepEqual(notes.map((n) => n.title), ['React', 'TypeScript', 'Figma']);
});

test('sortNotes breaks date ties with the title', () => {
  const tied = [
    note({ key: 'b.md', title: 'Beta', created: '2026-01-01' }),
    note({ key: 'a.md', title: 'Alpha', created: '2026-01-01' }),
  ];
  assert.deepEqual(sortNotes(tied, 'newest').map((n) => n.title), ['Alpha', 'Beta']);
  assert.deepEqual(sortNotes(tied, 'oldest').map((n) => n.title), ['Alpha', 'Beta']);
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

test('findByUrl tolerates a missing index (no scan yet)', () => {
  assert.equal(findByUrl(null, 'https://example.com/x'), null);
  assert.equal(findByUrl(undefined, 'https://example.com/x'), null);
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
