import { getSettings, saveSettings } from '../lib/settings.js';
import {
  getStoredStore,
  permissionOf,
  requestPermission,
  pickStore,
  clearStoredStore,
  scanStore,
  createDirectory,
} from '../lib/vaultfs.js';
import { buildIndex, filterNotes, formatDate, domainOf } from '../lib/notes.js';
import { h, icon, toast, faviconUrl } from '../lib/ui.js';

const el = (id) => document.getElementById(id);

const state = {
  settings: null,
  index: null,
  collection: '',
  query: '',
  skipped: 0,
  generation: 0,
  dialogOpen: false,
};

const expanded = new Set();
let refreshTimer = null;
let searchTimer = null;

function setScanning(scanning) {
  document.body.classList.toggle('scanning', scanning);
  if (scanning) {
    el('summary').textContent = 'Scanning…';
  }
}

function showOnboarding(message) {
  el('onboarding').hidden = false;
  el('workspace').hidden = true;
  el('reconnect').hidden = true;
  if (message) el('onboarding-message').textContent = message;
}

function showReconnect() {
  el('reconnect').hidden = false;
  el('onboarding').hidden = true;
}

function showWorkspace() {
  el('onboarding').hidden = true;
  el('reconnect').hidden = true;
  el('workspace').hidden = false;
}

async function forgetStore() {
  try {
    await clearStoredStore();
  } catch {
    // Nothing stored; fine.
  }
  state.settings = await saveSettings({ vaultName: null, storePath: '', storeLabel: '', obsidianLinks: false });
  state.index = null;
  showOnboarding('Folder not found; choose it again.');
}

async function refresh() {
  const generation = (state.generation += 1);
  setScanning(true);
  try {
    const { notes, skipped } = await scanStore();
    if (generation !== state.generation) return;
    state.index = buildIndex(notes);
    state.skipped = skipped;
    showWorkspace();
    renderSidebar();
    renderList();
  } catch (error) {
    if (generation !== state.generation) return;
    if (error?.code === 'needs-permission') showReconnect();
    else if (error?.code === 'no-store' || error?.name === 'NotFoundError') await forgetStore();
    else toast(error?.message ?? String(error), 'error');
  } finally {
    if (generation === state.generation) setScanning(false);
  }
}

function scheduleRefresh(delay = 300) {
  if (state.dialogOpen) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refresh(), delay);
}

function selectCollection(path) {
  state.collection = path;
  renderSidebar();
  renderList();
}

function titleFor() {
  if (state.query !== '') return 'Search results';
  if (state.collection === '') return 'All bookmarks';
  return state.collection.slice(state.collection.lastIndexOf('/') + 1);
}

function sidebarButton({ label, count, active, depth = 0, onClick }) {
  return h(
    'button',
    {
      type: 'button',
      className: `nav-item${active ? ' active' : ''}`,
      style: `--depth:${depth}`,
      onclick: onClick,
    },
    h('span', { className: 'nav-label', text: label }),
    h('span', { className: 'nav-count', text: String(count) }),
  );
}

function renderNodes(nodes, depth) {
  return nodes.map((node) => {
    const hasChildren = node.children.length > 0;
    const isOpen = expanded.has(node.path);
    return h(
      'div',
      { className: 'collection-group' },
      h(
        'div',
        { className: 'collection-row' },
        hasChildren
          ? h(
              'button',
              {
                type: 'button',
                className: 'disclosure',
                'aria-label': `${isOpen ? 'Collapse' : 'Expand'} ${node.name}`,
                'aria-expanded': String(isOpen),
                onclick: () => {
                  if (isOpen) expanded.delete(node.path);
                  else expanded.add(node.path);
                  renderSidebar();
                },
              },
              icon(isOpen ? 'chevron-down' : 'chevron-right'),
            )
          : h('span', { className: 'disclosure-spacer' }),
        sidebarButton({
          label: node.name,
          count: node.count,
          depth,
          active: state.collection === node.path,
          onClick: () => selectCollection(node.path),
        }),
      ),
      hasChildren && isOpen
        ? h('div', { className: 'collection-children' }, ...renderNodes(node.children, depth + 1))
        : null,
    );
  });
}

function renderSidebar() {
  const total = state.index?.notes.length ?? 0;
  el('all').replaceChildren(
    sidebarButton({
      label: 'All bookmarks',
      count: total,
      active: state.collection === '' && state.query === '',
      onClick: () => selectCollection(''),
    }),
  );
  el('collections').replaceChildren(...renderNodes(state.index?.collections ?? [], 0));
}

function faviconTile(note) {
  return h('div', { className: 'favicon-tile' }, h('img', { alt: '', src: faviconUrl(note.url, 32) }));
}

function coverElement(note) {
  const wrap = h('div', { className: 'thumb' });
  if (note.cover) {
    const image = h('img', { loading: 'lazy', alt: '', src: note.cover });
    image.addEventListener('error', () => {
      image.remove();
      wrap.append(faviconTile(note));
    });
    wrap.append(image);
  } else {
    wrap.append(faviconTile(note));
  }
  return wrap;
}

function renderRow(note) {
  return h(
    'article',
    { className: 'row', dataset: { key: note.key } },
    coverElement(note),
    h(
      'div',
      { className: 'row-body' },
      h(
        'a',
        { className: 'row-title', href: note.url, target: '_blank', rel: 'noreferrer', text: note.title },
      ),
      note.description ? h('p', { className: 'row-desc', text: note.description }) : null,
      h(
        'div',
        { className: 'row-meta' },
        h('span', { text: domainOf(note.url) }),
        h('span', { className: 'dot', text: '·' }),
        h('span', { text: formatDate(note.created) }),
      ),
    ),
    h('div', { className: 'row-actions' }),
  );
}

function renderList() {
  const notes = state.index
    ? filterNotes(state.index, { collection: state.collection, query: state.query })
    : [];
  el('collection-title').textContent = titleFor();
  el('list').replaceChildren(...notes.map(renderRow));
  el('empty').hidden = notes.length > 0;
  if (notes.length === 0) {
    el('empty').textContent = (state.index?.notes.length ?? 0) === 0 ? 'No bookmarks yet' : 'No matches';
  }
  if (!document.body.classList.contains('scanning')) {
    el('summary').textContent = `${notes.length} bookmark${notes.length === 1 ? '' : 's'}`;
  }
}

async function chooseFolder() {
  try {
    const settings = await pickStore();
    state.settings = await saveSettings(settings);
    await refresh();
  } catch (error) {
    if (error?.code !== 'cancelled') toast(error?.message ?? String(error), 'error');
  }
}

async function reconnect() {
  try {
    const handle = await getStoredStore();
    const permission = await requestPermission(handle);
    if (permission === 'granted') await refresh();
    else showReconnect();
  } catch (error) {
    if (error?.code === 'no-store') await forgetStore();
    else toast(error?.message ?? String(error), 'error');
  }
}

function renderSettings() {
  el('settings-body').replaceChildren(
    h(
      'dl',
      { className: 'settings-list' },
      h('dt', { text: 'Folder' }),
      h('dd', { text: state.settings?.storeLabel || 'Not set' }),
      h('dt', { text: 'Skipped notes' }),
      h('dd', { text: String(state.skipped ?? 0) }),
      h('dt', { text: 'Version' }),
      h('dd', { text: chrome.runtime.getManifest().version }),
    ),
    h(
      'div',
      { className: 'actions' },
      h('button', {
        type: 'button',
        text: 'Rescan',
        onclick: () => {
          el('settings').close();
          refresh();
        },
      }),
      h('button', {
        type: 'button',
        text: 'Change folder',
        onclick: () => {
          el('settings').close();
          chooseFolder();
        },
      }),
      h('button', { type: 'button', text: 'Close', onclick: () => el('settings').close() }),
    ),
  );
}

async function newCollection() {
  const name = window.prompt('Collection name');
  if (name == null) return;
  try {
    const { path } = await createDirectory(name);
    expanded.add(path);
    toast(`Created ${path}`, 'success');
    await refresh();
  } catch (error) {
    const messages = {
      exists: 'A collection with that name already exists.',
      'invalid-name': 'That collection name is not allowed.',
      'needs-permission': 'Vaultmarks lost access to your vault folder.',
    };
    toast(messages[error?.code] ?? error?.message ?? String(error), 'error');
    if (error?.code === 'needs-permission') showReconnect();
  }
}

function onSearchInput() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = el('search').value;
    renderSidebar();
    renderList();
  }, 120);
}

function onKeydown(event) {
  const target = event.target;
  const typing = target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
  if (event.key === '/' && !typing) {
    event.preventDefault();
    el('search').focus();
  } else if (event.key === 'Escape' && document.activeElement === el('search')) {
    el('search').value = '';
    state.query = '';
    renderSidebar();
    renderList();
  }
}

function trackDialogs() {
  for (const id of ['detail', 'settings']) {
    el(id).addEventListener('close', () => {
      state.dialogOpen = document.querySelector('dialog[open]') != null;
    });
  }
}

async function init() {
  el('open-settings').append(icon('settings'));
  el('new-collection').append(icon('plus'));
  el('open-settings').addEventListener('click', () => {
    renderSettings();
    el('settings').showModal();
    state.dialogOpen = true;
  });
  el('choose-folder').addEventListener('click', chooseFolder);
  el('reconnect-folder').addEventListener('click', reconnect);
  el('new-collection').addEventListener('click', newCollection);
  el('search').addEventListener('input', onSearchInput);
  document.addEventListener('keydown', onKeydown);
  trackDialogs();

  window.addEventListener('focus', () => scheduleRefresh(300));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleRefresh(300);
  });
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'vault-changed') scheduleRefresh(300);
  });

  state.settings = await getSettings();
  if (!state.settings.storeLabel) {
    showOnboarding();
    return;
  }

  let handle = null;
  try {
    handle = await getStoredStore();
  } catch {
    handle = null;
  }
  if (!handle) {
    showOnboarding();
    return;
  }

  let permission = 'prompt';
  try {
    permission = await permissionOf(handle);
  } catch {
    permission = 'prompt';
  }
  if (permission === 'denied') {
    showOnboarding('Vaultmarks no longer has access to that folder. Choose it again.');
    return;
  }
  if (permission === 'prompt') {
    showReconnect();
    return;
  }

  await refresh();
}

init();
