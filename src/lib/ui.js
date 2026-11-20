import { getLibraryTabId, setLibraryTabId } from './settings.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const ICONS = {
  eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z', 'M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z'],
  pencil: ['M4 20h4L19 9l-4-4L4 16v4z', 'M14 6l4 4'],
  trash: ['M6 7h12', 'M9 7V5h6v2', 'M8 7l1 12.5h6L17 7'],
  plus: ['M12 5v14', 'M5 12h14'],
  refresh: ['M20 12a8 8 0 1 1-2.4-5.7', 'M20 4.5V11h-6.5'],
  external: ['M14 4h6v6', 'M20 4l-9 9', 'M18 13v6H5V6h6'],
  settings: ['M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z', 'M15 12a3 3 0 1 1-6 0 3 3 0 1 1 6 0z'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  check: ['M5 13l4 4L19 7'],
  copy: ['M9 9h9v11H9z', 'M6 15H4V4h11v2'],
  folder: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  'chevron-right': ['M9 6l6 6-6 6'],
  'chevron-down': ['M6 9l6 6 6-6'],
  'chevron-up': ['M6 15l6-6 6 6'],
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

export function isPastTop(offset, threshold = 480) {
  return Number(offset) >= threshold;
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
let tagMenuSeq = 0;

export function createTagInput({ input, chips, initial = [], suggestions = [], exclude = [] }) {
  // Re-wiring the same input must not stack listeners: a stale instance would
  // consume the keystroke first and drop the tag. Abort the previous one.
  tagInputs.get(input)?.dispose();

  const tags = [];
  const excluded = new Set(exclude.map((tag) => tag.toLowerCase()));
  const known = [];
  const knownKeys = new Set();
  for (const raw of suggestions) {
    const name = String(raw ?? '').trim();
    if (name === '') continue;
    const key = name.toLowerCase();
    if (knownKeys.has(key) || excluded.has(key)) continue;
    knownKeys.add(key);
    known.push(name);
  }

  const controller = new AbortController();
  const { signal } = controller;

  const menu = h('div', {
    className: 'tag-menu',
    role: 'listbox',
    id: `tag-menu-${(tagMenuSeq += 1)}`,
  });
  menu.hidden = true;
  (input.parentElement ?? document.body).append(menu);

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', menu.id);
  input.setAttribute('aria-expanded', 'false');

  let options = [];
  let activeIndex = -1;

  const closeMenu = () => {
    menu.hidden = true;
    menu.replaceChildren();
    options = [];
    activeIndex = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };

  const positionMenu = () => {
    if (typeof input.getBoundingClientRect !== 'function' || typeof window === 'undefined') return;
    const rect = input.getBoundingClientRect();
    const viewport = window.innerHeight || 0;
    const below = viewport - rect.bottom - 12;
    const above = rect.top - 12;
    const openAbove = below < 140 && above > below;
    menu.style.position = 'fixed';
    menu.style.left = `${rect.left}px`;
    menu.style.width = `${rect.width}px`;
    menu.style.maxHeight = `${Math.max(80, Math.min(240, openAbove ? above : below))}px`;
    if (openAbove) {
      menu.style.top = 'auto';
      menu.style.bottom = `${viewport - rect.top + 4}px`;
    } else {
      menu.style.top = `${rect.bottom + 4}px`;
      menu.style.bottom = 'auto';
    }
  };

  if (typeof window !== 'undefined') {
    const reposition = () => {
      if (!menu.hidden) positionMenu();
    };
    window.addEventListener('resize', reposition, { signal });
    window.addEventListener('scroll', reposition, { signal, capture: true });
  }

  const setActive = (index) => {
    if (options.length === 0) return;
    activeIndex = ((index % options.length) + options.length) % options.length;
    options.forEach((option, position) => {
      const active = position === activeIndex;
      option.node.className = `tag-option${active ? ' active' : ''}`;
      option.node.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    input.setAttribute('aria-activedescendant', options[activeIndex].node.id);
    const node = options[activeIndex].node;
    if (typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'nearest' });
  };

  const choose = (option) => {
    add(option.value);
    input.value = '';
    closeMenu();
    if (typeof input.focus === 'function') input.focus();
  };

  const openMenu = () => {
    const query = input.value.trim();
    const lower = query.toLowerCase();
    const taken = new Set(tags.map((tag) => tag.toLowerCase()));
    const matches = known.filter((name) => {
      const key = name.toLowerCase();
      if (taken.has(key)) return false;
      return lower === '' || key.includes(lower);
    });
    const exact = lower === '' ? null : known.find((name) => name.toLowerCase() === lower) ?? null;
    const canCreate = lower !== '' && exact === null && !taken.has(lower) && !excluded.has(lower);
    if (matches.length === 0 && !canCreate) {
      closeMenu();
      return;
    }

    const rows = matches.map((name) => ({ value: name, create: false }));
    if (canCreate) rows.push({ value: query, create: true });

    options = rows.map((row, index) => {      const node = h(
        'div',
        {
          className: 'tag-option',
          role: 'option',
          id: `${menu.id}-option-${index}`,
          'aria-selected': 'false',
        },
        row.create
          ? [icon('plus'), h('span', { text: `Create “${row.value}”` })]
          : h('span', { className: 'tag-option-name', text: row.value }),
      );
      node.addEventListener(
        'pointerdown',
        (event) => {
          event.preventDefault();
          choose(row);
        },
        { signal },
      );
      return { ...row, node };
    });

    const hint = lower !== '' && matches.length === 0
      ? h('div', {
          className: 'tag-menu-note',
          role: 'presentation',
          text: known.length === 0 ? 'No tags yet' : `No tags match “${query}”`,
        })
      : null;

    menu.replaceChildren(...[hint, ...options.map((option) => option.node)].filter(Boolean));
    menu.hidden = false;
    positionMenu();
    input.setAttribute('aria-expanded', 'true');
    const exactIndex = matches.findIndex((name) => name.toLowerCase() === lower);
    if (exactIndex === -1) {
      activeIndex = -1;
      input.removeAttribute('aria-activedescendant');
    } else {
      setActive(exactIndex);
    }
  };

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

  input.removeAttribute('list');

  input.addEventListener(
    'input',
    () => {
      openMenu();
    },
    { signal },
  );
  input.addEventListener(
    'focus',
    () => {
      openMenu();
    },
    { signal },
  );
  input.addEventListener(
    'click',
    () => {
      openMenu();
    },
    { signal },
  );
  input.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        const option = menu.hidden ? null : options[activeIndex];
        if (option) choose(option);
        else {
          add(input.value);
          input.value = '';
          closeMenu();
        }
      } else if (event.key === ',') {
        event.preventDefault();
        add(input.value);
        input.value = '';
        closeMenu();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (menu.hidden) openMenu();
        if (!menu.hidden) setActive(activeIndex + (event.key === 'ArrowDown' ? 1 : -1));
      } else if (event.key === 'Escape' && !menu.hidden) {
        event.preventDefault();
        closeMenu();
      } else if (event.key === 'Backspace' && input.value === '' && tags.length > 0) {
        remove(tags.length - 1);
        if (!menu.hidden) openMenu();
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
      closeMenu();
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
    dispose: () => {
      controller.abort();
      menu.remove();
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('role');
      input.removeAttribute('aria-autocomplete');
      input.removeAttribute('aria-controls');
      input.removeAttribute('aria-activedescendant');
    },
  };
  tagInputs.set(input, handle);
  return handle;
}

export function collectionOptions(index) {
  const options = [{ value: '', label: 'Unfiled' }];
  const walk = (nodes) => {
    for (const node of nodes) {
      // Browsers collapse leading spaces in <option> labels, so indentation is
      // invisible there. The path is the only reliable way to show nesting.
      options.push({ value: node.path, label: node.path });
      walk(node.children);
    }
  };
  walk(index?.collections ?? []);
  return options;
}

export function fillCollectionSelect(select, index, selected = '') {
  select.replaceChildren(...collectionOptions(index).map((option) => h('option', { value: option.value, text: option.label })));
  const values = new Set([...select.options].map((option) => option.value));
  select.value = values.has(selected) ? selected : '';
  return select;
}
