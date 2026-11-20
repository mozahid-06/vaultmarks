export const BASE_TAG = 'bookmarks';

const INLINE_TAG = /(?:^|[\s(])#([\p{L}\p{N}][\p{L}\p{N}\p{M}_-]*)/gu;

// Hashtags in a captured description are the page's own tags. They only count
// when they start a word, so URL fragments and issue numbers are left alone.
export function tagsFromText(text) {
  const tags = [];
  const seen = new Set();
  for (const match of String(text ?? '').matchAll(INLINE_TAG)) {
    const tag = match[1].replace(/-+$/, '');
    if (tag.length < 2 || /^\d+$/.test(tag)) continue;
    const key = tag.toLowerCase();
    if (key === BASE_TAG || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function normalizeUrl(url) {
  const raw = String(url ?? '').trim();
  try {
    const parsed = new URL(raw);
    parsed.hash = '';
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return raw;
  }
}

export function domainOf(url) {
  try {
    return new URL(String(url ?? '').trim()).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

export function sortNewest(notes) {
  return [...notes].sort((a, b) => {
    const byDate = String(b.created ?? '').localeCompare(String(a.created ?? ''));
    if (byDate !== 0) return byDate;
    return String(a.title ?? '').toLowerCase().localeCompare(String(b.title ?? '').toLowerCase());
  });
}

const titleCompare = (a, b) =>
  String(a.title ?? '').toLowerCase().localeCompare(String(b.title ?? '').toLowerCase());

export function sortNotes(notes, mode = 'newest') {
  if (mode === 'oldest') {
    return [...notes].sort((a, b) => {
      const byDate = String(a.created ?? '').localeCompare(String(b.created ?? ''));
      return byDate !== 0 ? byDate : titleCompare(a, b);
    });
  }
  if (mode === 'title') {
    return [...notes].sort((a, b) => {
      const byTitle = titleCompare(a, b);
      return byTitle !== 0 ? byTitle : String(b.created ?? '').localeCompare(String(a.created ?? ''));
    });
  }
  return sortNewest(notes);
}

function sortTree(nodes) {
  nodes.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  for (const node of nodes) sortTree(node.children);
  return nodes;
}

export function buildIndex(notes, directories = []) {
  const ordered = sortNewest(notes);
  const byKey = new Map();
  const byUrl = new Map();
  const dirCounts = new Map();

  for (const note of ordered) {
    byKey.set(note.key, note);
    const normalized = normalizeUrl(note.url);
    if (normalized !== '' && !byUrl.has(normalized)) byUrl.set(normalized, note);
    if (note.dir !== '') dirCounts.set(note.dir, (dirCounts.get(note.dir) ?? 0) + 1);
  }

  const paths = new Set();
  for (const dir of [...dirCounts.keys(), ...directories]) {
    if (dir === '' || dir == null) continue;
    const parts = String(dir).split('/');
    for (let i = 1; i <= parts.length; i += 1) paths.add(parts.slice(0, i).join('/'));
  }

  const nodes = new Map();
  for (const path of paths) {
    nodes.set(path, { path, name: path.slice(path.lastIndexOf('/') + 1), count: 0, children: [] });
  }
  for (const node of nodes.values()) {
    for (const [dir, count] of dirCounts) {
      if (dir === node.path || dir.startsWith(`${node.path}/`)) node.count += count;
    }
    const slash = node.path.lastIndexOf('/');
    if (slash !== -1) nodes.get(node.path.slice(0, slash)).children.push(node);
  }

  const roots = [...nodes.values()].filter((node) => !node.path.includes('/'));

  const tagCounts = new Map();
  for (const note of ordered) {
    const seen = new Set();
    for (const tag of note.tags) {
      const name = String(tag).trim();
      if (name === '' || name.toLowerCase() === BASE_TAG) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = tagCounts.get(key);
      if (entry) entry.count += 1;
      else tagCounts.set(key, { name, count: 1 });
    }
  }
  const tags = [...tagCounts.values()].sort(
    (a, b) => b.count - a.count || a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
  );

  return { notes: ordered, collections: sortTree(roots), tags, byKey, byUrl };
}

export function filterNotes(index, { collection = '', query = '', tag = '' } = {}) {
  const tokens = String(query ?? '').toLowerCase().split(/\s+/).filter((token) => token !== '');
  const wantedTag = String(tag ?? '').trim().toLowerCase();
  return index.notes.filter((note) => {
    if (collection !== '' && note.dir !== collection && !note.dir.startsWith(`${collection}/`)) {
      return false;
    }
    if (wantedTag !== '' && !note.tags.some((value) => String(value).trim().toLowerCase() === wantedTag)) {
      return false;
    }
    if (tokens.length === 0) return true;
    const haystack = [
      note.title,
      note.description,
      note.url,
      domainOf(note.url),
      ...note.tags,
    ]
      .join(' ')
      .toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}

export function findByUrl(index, url) {
  const normalized = normalizeUrl(url);
  return (normalized !== '' && index?.byUrl.get(normalized)) || null;
}

export function formatDate(created, now = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(created ?? '').trim());
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
  const label = `${MONTHS[month - 1]} ${day}`;
  return year === now.getFullYear() ? label : `${label}, ${year}`;
}

export function obsidianUri(vaultName, storePath, key) {
  const file = [storePath, key.replace(/\.md$/i, '')]
    .filter((part) => part !== '' && part != null)
    .join('/');
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(file)}`;
}
