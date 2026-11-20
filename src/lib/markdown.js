function stripCR(line) {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}

function splitFrontmatter(text) {
  const content = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const firstNewline = content.indexOf('\n');
  if (firstNewline === -1) return { kind: 'none' };
  if (stripCR(content.slice(0, firstNewline)) !== '---') return { kind: 'none' };

  let pos = firstNewline + 1;
  while (pos <= content.length) {
    const nl = content.indexOf('\n', pos);
    const end = nl === -1 ? content.length : nl;
    if (stripCR(content.slice(pos, end)) === '---') {
      return {
        kind: 'ok',
        frontmatter: content.slice(firstNewline + 1, pos),
        body: nl === -1 ? '' : content.slice(nl + 1),
      };
    }
    if (nl === -1) break;
    pos = nl + 1;
  }
  return { kind: 'unterminated' };
}

function parseScalar(raw) {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\(["\\])/g, '$1');
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

function parseInlineList(raw) {
  const inner = raw.slice(1, -1);
  if (inner.trim() === '') return [];
  return inner
    .split(',')
    .map((item) => parseScalar(item))
    .filter((item) => item !== '');
}

function parseFrontmatterBlock(block) {
  const data = {};
  let listKey = null;
  for (const rawLine of block.split('\n')) {
    const line = stripCR(rawLine);
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const listItem = line.match(/^\s+-\s+(.*)$/);
    if (listItem) {
      if (listKey === null) return null;
      if (!Array.isArray(data[listKey])) data[listKey] = [];
      data[listKey].push(parseScalar(listItem[1]));
      continue;
    }

    if (/^\s/.test(line)) return null;

    const mapping = line.match(/^([A-Za-z0-9_][A-Za-z0-9_-]*):(?:[ \t]*(.*))?$/);
    if (!mapping) return null;
    const key = mapping[1];
    const rawValue = (mapping[2] ?? '').trim();
    listKey = rawValue === '' ? key : null;
    if (rawValue === '') {
      data[key] = '';
    } else if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      data[key] = parseInlineList(rawValue);
    } else {
      data[key] = parseScalar(rawValue);
    }
  }
  return data;
}

function firstBodyImage(body) {
  const match = body.match(/!\[[^\]]*\]\(\s*(?:<([^>\n]+)>|([^)\s]+))(?:\s+"[^"]*")?\s*\)/);
  return match ? (match[1] ?? match[2] ?? '') : '';
}

export function parseNote(text, meta) {
  const block = splitFrontmatter(text);
  if (block.kind === 'none') return { note: null, reason: 'no-frontmatter' };
  if (block.kind === 'unterminated') return { note: null, reason: 'bad-frontmatter' };

  const data = parseFrontmatterBlock(block.frontmatter);
  if (!data) return { note: null, reason: 'bad-frontmatter' };

  const url = typeof data.url === 'string' ? data.url.trim() : '';
  if (url === '') return { note: null, reason: 'no-url' };

  const body = block.body.replace(/^(?:[ \t]*\r?\n)+/, '');
  const key = meta.key;
  const slash = key.lastIndexOf('/');
  const dir = slash === -1 ? '' : key.slice(0, slash);
  const filename = slash === -1 ? key : key.slice(slash + 1);

  const title =
    typeof data.title === 'string' && data.title.trim() !== ''
      ? data.title
      : filename.replace(/\.md$/i, '');
  const image = typeof data.image === 'string' ? data.image : '';
  const tags = Array.isArray(data.tags) ? data.tags : [];

  return {
    note: {
      key,
      dir,
      filename,
      title,
      url,
      created: typeof data.created === 'string' ? data.created : '',
      description: typeof data.description === 'string' ? data.description : '',
      image,
      favicon: typeof data.favicon === 'string' ? data.favicon : '',
      tags,
      cover: image || firstBodyImage(body),
      body,
      raw: text,
      lastModified: meta.lastModified ?? 0,
      size: meta.size ?? 0,
    },
    reason: null,
  };
}

export const MANAGED_KEYS = ['title', 'url', 'created', 'description', 'image', 'favicon', 'tags'];

const encoder = new TextEncoder();
const KEY_PATTERN = /^([A-Za-z0-9_][A-Za-z0-9_-]*):(?:[ \t]*(.*))?$/;

function utf8Length(value) {
  return encoder.encode(value).length;
}

function quoteScalar(value) {
  const flat = String(value ?? '').replace(/\r\n|\r|\n/g, ' ');
  return `"${flat.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// A link or image destination in Markdown ends at the first `)` unless it is
// wrapped in angle brackets. Wikipedia-style URLs (`..._(software)`) would
// otherwise lose their tail and render as a broken link. Ordinary URLs keep
// the plain form so existing notes look the same.
function markdownDestination(value) {
  const raw = String(value ?? '').trim();
  if (raw === '') return '';
  if (!/[\s()<>\\]/.test(raw)) return raw;
  return `<${raw.replace(/[<>\\]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`).replace(/\s/g, '%20')}>`;
}

function normalizeTags(tags) {
  const seen = new Set();
  const out = [];
  for (const tag of Array.isArray(tags) ? tags : []) {
    const value = String(tag).trim();
    if (value === '') continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  if (!seen.has('bookmarks')) out.unshift('bookmarks');
  return out;
}

function formatManagedLines(key, value) {
  if (key === 'tags') {
    const lines = ['tags:'];
    for (const tag of normalizeTags(value)) lines.push(`  - ${quoteScalar(tag)}`);
    return lines;
  }
  if (key === 'created') return [`created: ${String(value ?? '').trim()}`];
  return [`${key}: ${quoteScalar(value)}`];
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return String(value ?? '').trim() !== '';
}

export function createNoteText({ title, url, created, description, image, favicon, tags }) {
  const lines = ['---'];
  lines.push(`title: ${quoteScalar(title)}`);
  lines.push(`url: ${quoteScalar(url)}`);
  const createdValue = String(created ?? '').trim();
  if (createdValue !== '') lines.push(`created: ${createdValue}`);
  lines.push(`description: ${quoteScalar(description)}`);
  if (String(image ?? '').trim() !== '') lines.push(`image: ${quoteScalar(image)}`);
  if (String(favicon ?? '').trim() !== '') lines.push(`favicon: ${quoteScalar(favicon)}`);
  lines.push('tags:');
  for (const tag of normalizeTags(tags)) lines.push(`  - ${quoteScalar(tag)}`);
  lines.push('---');

  const body = [];
  if (String(image ?? '').trim() !== '') body.push(`![](${markdownDestination(image)})`);
  if (String(description ?? '').trim() !== '') {
    body.push(String(description).replace(/\r\n|\r|\n/g, ' '));
  }
  body.push(`[Open original ↗](${markdownDestination(url)})`);

  return `${lines.join('\n')}\n\n${body.join('\n\n')}\n`;
}

export function patchFrontmatter(text, changes) {
  if (!changes || typeof changes !== 'object') return text;

  const bom = text.startsWith('\uFEFF') ? '\uFEFF' : '';
  const content = bom ? text.slice(1) : text;
  const firstNewline = content.indexOf('\n');
  if (firstNewline === -1) return text;
  if (stripCR(content.slice(0, firstNewline)) !== '---') return text;

  let pos = firstNewline + 1;
  let closeStart = -1;
  while (pos <= content.length) {
    const nl = content.indexOf('\n', pos);
    const end = nl === -1 ? content.length : nl;
    if (stripCR(content.slice(pos, end)) === '---') {
      closeStart = pos;
      break;
    }
    if (nl === -1) break;
    pos = nl + 1;
  }
  if (closeStart === -1) return text;

  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.slice(firstNewline + 1, closeStart).split(eol);
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  const ranges = new Map();
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(KEY_PATTERN);
    if (!match || !MANAGED_KEYS.includes(match[1])) continue;
    let end = i + 1;
    while (end < lines.length && /^\s+-\s+/.test(lines[end])) end += 1;
    ranges.set(match[1], { start: i, end });
  }

  const replacements = new Map();
  const insertions = new Map();
  for (let canon = 0; canon < MANAGED_KEYS.length; canon += 1) {
    const key = MANAGED_KEYS[canon];
    if (!Object.hasOwn(changes, key)) continue;
    const value = changes[key];
    const range = ranges.get(key);
    if (range) {
      replacements.set(range.start, { end: range.end, lines: formatManagedLines(key, value) });
      continue;
    }
    if (!hasValue(value)) continue;
    let anchor = lines.length;
    for (const later of MANAGED_KEYS.slice(canon + 1)) {
      const laterRange = ranges.get(later);
      if (laterRange) {
        anchor = laterRange.start;
        break;
      }
    }
    if (!insertions.has(anchor)) insertions.set(anchor, []);
    insertions.get(anchor).push(...formatManagedLines(key, value));
  }

  if (replacements.size === 0 && insertions.size === 0) return text;

  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (insertions.has(i)) out.push(...insertions.get(i));
    const replacement = replacements.get(i);
    if (replacement) {
      out.push(...replacement.lines);
      i = replacement.end;
    } else {
      out.push(lines[i]);
      i += 1;
    }
  }
  if (insertions.has(lines.length)) out.push(...insertions.get(lines.length));

  return `${bom}${content.slice(0, firstNewline + 1)}${out.join(eol)}${eol}${content.slice(closeStart)}`;
}

const INVALID_FILENAME = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;

function fitFilename(base) {
  let chars = [...base];
  if (chars.length > 120) chars = chars.slice(0, 120);
  let out = chars.join('').trim().replace(/[. ]+$/, '');
  while (out !== '' && utf8Length(`${out}.md`) > 200) {
    chars = [...out];
    chars.pop();
    out = chars.join('').trim().replace(/[. ]+$/, '');
  }
  return out;
}

export function filenameBase(title, hostname) {
  const clean = (value) =>
    String(value ?? '')
      .replace(INVALID_FILENAME, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/, '');

  let base = clean(title);
  if (base === '') base = clean(hostname);
  if (base === '') base = 'Bookmark';
  return fitFilename(base) || 'Bookmark';
}

export function uniqueFilename(base, existingNames = []) {
  const taken = new Set(existingNames.map((name) => String(name).toLowerCase()));
  const first = `${base}.md`;
  if (!taken.has(first.toLowerCase())) return first;

  for (let n = 2; ; n += 1) {
    const suffix = ` (${n})`;
    let stem = base;
    while (stem !== '' && utf8Length(`${stem}${suffix}.md`) > 200) {
      const chars = [...stem];
      chars.pop();
      stem = chars.join('');
    }
    const candidate = `${stem}${suffix}.md`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

export function isStale(note, freshText) {
  return note.raw !== freshText;
}
