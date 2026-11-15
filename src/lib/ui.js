import { getLibraryTabId, setLibraryTabId } from './settings.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const ICONS = {
  eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z', 'M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z'],
  pencil: ['M4 20h4L19 9l-4-4L4 16v4z', 'M14 6l4 4'],
  trash: ['M6 7h12', 'M9 7V5h6v2', 'M8 7l1 12.5h6L17 7'],
  plus: ['M12 5v14', 'M5 12h14'],
  refresh: ['M20 12a8 8 0 1 1-2.4-5.7', 'M20 4.5V11h-6.5'],
  external: ['M14 4h6v6', 'M20 4l-9 9', 'M18 13v6H5V6h6'],
  settings: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M4.5 12h1.8M17.7 12h1.8M12 4.5v1.8M12 17.7v1.8', 'M6.7 6.7l1.3 1.3M16 16l1.3 1.3M17.3 6.7L16 8M8 16l-1.3 1.3'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  check: ['M5 13l4 4L19 7'],
  copy: ['M9 9h9v11H9z', 'M6 15H4V4h11v2'],
  folder: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  'chevron-right': ['M9 6l6 6-6 6'],
  'chevron-down': ['M6 9l6 6 6-6'],
};

export function h(tag, props = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'className') element.className = value;
    else if (key === 'text') element.textContent = value;
    else if (key === 'dataset') Object.assign(element.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) element.setAttribute(key, '');
    else element.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    element.append(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }
  return element;
}

export function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ICONS[name] ?? []) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

export function faviconUrl(pageUrl, size = 32) {
  return chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=${size}`);
}

export async function openLibraryTab() {
  const url = chrome.runtime.getURL('src/library/library.html?view=tab');
  const storedId = await getLibraryTabId();
  if (storedId != null) {
    try {
      const tab = await chrome.tabs.get(storedId);
      if (tab && (tab.url === undefined || tab.url.startsWith(url))) {
        await chrome.tabs.update(storedId, { active: true });
        return storedId;
      }
    } catch {
      // The tab is gone; create a fresh one below.
    }
  }

  const created = await chrome.tabs.create({ url });
  await setLibraryTabId(created.id);
  return created.id;
}

export function toast(message, kind = 'info') {
  const host = document.getElementById('status') ?? document.body;
  const node = h('div', { className: `toast toast-${kind}`, text: message });
  host.append(node);
  setTimeout(() => node.remove(), 4000);
  return node;
}

const tagInputs = new WeakMap();

export function createTagInput({ input, chips, initial = [], suggestions = [], exclude = [] }) {
  // Re-wiring the same input must not stack listeners: a stale instance would
  // consume the keystroke first and drop the tag. Abort the previous one.
  tagInputs.get(input)?.dispose();

  const tags = [];
  const excluded = new Set(exclude.map((tag) => tag.toLowerCase()));
  const controller = new AbortController();
  const { signal } = controller;

  const render = () => {
    chips.replaceChildren(
      ...tags.map((tag, index) =>
        h(
          'span',
          { className: 'chip' },
          h('span', { text: tag }),
          h(
            'button',
            {
              type: 'button',
              className: 'chip-remove',
              title: `Remove ${tag}`,
              'aria-label': `Remove ${tag}`,
              onclick: () => remove(index),
            },
            icon('close'),
          ),
        ),
      ),
    );
  };

  const add = (raw) => {
    for (const part of String(raw ?? '').split(',')) {
      const value = part.trim();
      if (value === '') continue;
      const key = value.toLowerCase();
      if (excluded.has(key) || tags.some((tag) => tag.toLowerCase() === key)) continue;
      tags.push(value);
    }
    render();
  };

  const remove = (index) => {
    tags.splice(index, 1);
    render();
  };

  const datalist = h('datalist', { id: `tag-suggestions-${input.id || 'tags'}` });
  document.getElementById(datalist.id)?.remove();
  datalist.append(...suggestions.map((name) => h('option', { value: name })));
  (input.parentElement ?? document.body).append(datalist);
  input.setAttribute('list', datalist.id);

  input.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Enter' || event.key === ',') {
        event.preventDefault();
        add(input.value);
        input.value = '';
      } else if (event.key === 'Backspace' && input.value === '' && tags.length > 0) {
        remove(tags.length - 1);
      }
    },
    { signal },
  );
  input.addEventListener(
    'blur',
    () => {
      if (input.value.trim() !== '') {
        add(input.value);
        input.value = '';
      }
    },
    { signal },
  );

  for (const tag of initial) add(tag);
  render();

  const handle = {
    getTags: () => [...tags],
    setTags: (next) => {
      tags.length = 0;
      for (const tag of next ?? []) add(tag);
      render();
    },
    dispose: () => controller.abort(),
  };
  tagInputs.set(input, handle);
  return handle;
}

export function collectionOptions(index) {
  const options = [{ value: '', label: 'Unfiled' }];
  const walk = (nodes, depth) => {
    for (const node of nodes) {
      options.push({ value: node.path, label: `${'  '.repeat(depth)}${node.name}` });
      walk(node.children, depth + 1);
    }
  };
  walk(index?.collections ?? [], 0);
  return options;
}

export function fillCollectionSelect(select, index, selected = '') {
  select.replaceChildren(...collectionOptions(index).map((option) => h('option', { value: option.value, text: option.label })));
  const values = new Set([...select.options].map((option) => option.value));
  select.value = values.has(selected) ? selected : '';
  return select;
}
