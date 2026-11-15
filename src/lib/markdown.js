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
  const match = body.match(/!\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/);
  return match ? match[1] : '';
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
