import { getSettings, saveSettings } from '../lib/settings.js';
import {
  getStoredStore,
  permissionOf,
  requestPermission,
  pickStore,
  clearStoredStore,
  scanStore,
  createDirectory,
  updateFile,
  moveFile,
  trashFile,
  writeNewFile,
} from '../lib/vaultfs.js';
import { buildIndex, filterNotes, formatDate, domainOf, obsidianUri, BASE_TAG } from '../lib/notes.js';
import { createNoteText, filenameBase } from '../lib/markdown.js';
import { dirOf, baseOf } from '../lib/paths.js';
import { isSavableUrl } from '../lib/capture.js';
import {
  h,
  icon,
  toast,
  faviconUrl,
  createTagInput,
  fillCollectionSelect,
} from '../lib/ui.js';

const el = (id) => document.getElementById(id);

const state = {
  settings: null,
  index: null,
  collection: '',
  query: '',
  skipped: 0,
  generation: 0,
  dialogOpen: false,
  mode: 'view',
  currentNote: null,
  tagInput: null,
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
  el('workspace').hidden = false;
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

function rowAction(action, iconName, label, note) {
  return h(
    'button',
    {
      type: 'button',
      className: 'icon-button',
      dataset: { action },
      title: label,
      'aria-label': label,
      onclick: (event) => {
        event.stopPropagation();
        event.preventDefault();
        if (action === 'delete') deleteNote(note);
        else openDetail(note, action === 'edit' ? 'edit' : 'view');
      },
    },
    icon(iconName),
  );
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
    h(
      'div',
      { className: 'row-actions' },
      rowAction('view', 'eye', `Details for ${note.title}`, note),
      rowAction('edit', 'pencil', `Edit ${note.title}`, note),
      rowAction('delete', 'trash', `Delete ${note.title}`, note),
    ),
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

const WRITE_ERRORS = {
  conflict: 'This note changed in Obsidian. Reload and try again.',
  'needs-permission': 'Vaultmarks lost access to your vault folder.',
  partial: 'The copy worked but the original file could not be removed. Check the folder.',
  exists: 'A collection with that name already exists.',
  'invalid-name': 'That collection name is not allowed.',
};

function messageFor(error) {
  return WRITE_ERRORS[error?.code] ?? error?.message ?? String(error);
}

function notifyChanged() {
  try {
    chrome.runtime.sendMessage({ type: 'vault-changed' }).catch(() => {});
  } catch {
    // No page is listening; nothing to notify.
  }
}

function todayIso() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function userTags(tags) {
  return tags.filter((tag) => tag.toLowerCase() !== BASE_TAG);
}

function sameTags(a, b) {
  const normalize = (list) => [...list].map((tag) => tag.toLowerCase()).sort().join('\u0000');
  return normalize(a) === normalize(b);
}

function setDetailStatus(node) {
  const target = state.mode === 'view' ? el('detail-status') : el('detail-form-status');
  target.replaceChildren();
  if (node != null) target.append(node);
}

function closeDetail() {
  state.currentNote = null;
  if (el('detail').open) el('detail').close();
}

function renderDetailView(note) {
  el('detail-form').hidden = true;
  el('detail-view').hidden = false;

  const cover = el('detail-cover');
  if (note.cover) {
    cover.src = note.cover;
    cover.hidden = false;
    cover.onerror = () => {
      cover.hidden = true;
    };
  } else {
    cover.hidden = true;
    cover.removeAttribute('src');
  }

  el('detail-heading').textContent = note.title;
  const link = el('detail-link');
  link.textContent = note.url;
  link.href = note.url;
  el('detail-date').textContent = [formatDate(note.created), domainOf(note.url)].filter(Boolean).join(' · ');
  el('detail-text').textContent = note.description === '' ? 'No description.' : note.description;
  el('detail-chips').replaceChildren(
    ...userTags(note.tags).map((tag) => h('span', { className: 'chip' }, h('span', { text: tag }))),
  );
  el('detail-collection-label').textContent = note.dir === '' ? 'Unfiled' : note.dir;

  const obsidian = el('detail-obsidian');
  if (state.settings?.obsidianLinks && state.settings.vaultName) {
    obsidian.hidden = false;
    obsidian.onclick = () => {
      window.open(obsidianUri(state.settings.vaultName, state.settings.storePath, note.key));
    };
  } else {
    obsidian.hidden = true;
  }

  setDetailStatus(null);
}

function renderDetailEdit(note) {
  el('detail-view').hidden = true;
  el('detail-form').hidden = false;
  el('detail-form-heading').textContent = state.mode === 'create' ? 'New bookmark' : 'Edit bookmark';

  el('detail-title').value = note?.title ?? '';
  el('detail-url').value = note?.url ?? '';
  el('detail-description').value = note?.description ?? '';

  fillCollectionSelect(
    el('detail-collection'),
    state.index,
    note?.dir ?? (state.collection !== '' ? state.collection : ''),
  );

  state.tagInput = createTagInput({
    input: el('detail-tag-input'),
    chips: el('detail-tags'),
    initial: note ? userTags(note.tags) : [],
    suggestions: (state.index?.tags ?? []).map((tag) => tag.name),
    exclude: [BASE_TAG],
  });

  setDetailStatus(null);
  el('detail-title').focus();
}

function openDetail(note, mode) {
  state.mode = mode;
  state.currentNote = note;
  el('detail').showModal();
  state.dialogOpen = true;
  if (mode === 'edit') renderDetailEdit(note);
  else renderDetailView(note);
}

function openCreate() {
  state.mode = 'create';
  state.currentNote = null;
  el('detail').showModal();
  state.dialogOpen = true;
  renderDetailEdit(null);
}

async function reloadNote(key) {
  await refresh();
  const fresh = state.index?.byKey.get(key) ?? null;
  if (!fresh) setDetailStatus(h('span', { text: 'This note no longer exists.' }));
  return fresh;
}

function showConflict(note) {
  setDetailStatus(
    h(
      'div',
      { className: 'status-row' },
      h('span', { text: 'This note changed in Obsidian. Reload and try again.' }),
      h(
        'div',
        { className: 'actions' },
        h('button', {
          type: 'button',
          text: 'Reload',
          onclick: async () => {
            const fresh = await reloadNote(note.key);
            if (fresh) {
              state.currentNote = fresh;
              renderDetailEdit(fresh);
            }
          },
        }),
      ),
    ),
  );
}

async function deleteNote(note) {
  if (!window.confirm('Move this bookmark to the hidden trash folder?')) return;
  try {
    await trashFile(note);
    notifyChanged();
    if (state.currentNote?.key === note.key) closeDetail();
    await refresh();
    toast('Moved to the hidden trash folder', 'success');
  } catch (error) {
    toast(messageFor(error), 'error');
    if (error?.code === 'needs-permission') showReconnect();
  }
}

async function onDetailSubmit(event) {
  event.preventDefault();
  const title = el('detail-title').value.trim();
  const url = el('detail-url').value.trim();
  const description = el('detail-description').value.trim();
  const dir = el('detail-collection').value;
  const tags = [BASE_TAG, ...state.tagInput.getTags()];

  if (title === '') {
    setDetailStatus('Add a title.');
    el('detail-title').focus();
    return;
  }
  if (!isSavableUrl(url)) {
    setDetailStatus('Enter a valid http(s) URL.');
    el('detail-url').focus();
    return;
  }

  el('detail-save').disabled = true;
  try {
    if (state.mode === 'create') {
      const text = createNoteText({
        title,
        url,
        created: todayIso(),
        description,
        image: '',
        favicon: '',
        tags,
      });
      await writeNewFile(dir, filenameBase(title, domainOf(url)), text);
      notifyChanged();
      closeDetail();
      await refresh();
      toast('Bookmark created', 'success');
      return;
    }

    const note = state.currentNote;
    const changes = {};
    if (title !== note.title) changes.title = title;
    if (url !== note.url) changes.url = url;
    if (description !== note.description) changes.description = description;
    if (!sameTags(userTags(note.tags), state.tagInput.getTags())) changes.tags = tags;

    let key = note.key;
    let currentDir = note.dir;
    if (Object.keys(changes).length > 0) {
      const updated = await updateFile(note, changes);
      key = updated.key;
      currentDir = dirOf(key);
      state.currentNote = { ...note, key, dir: currentDir, filename: baseOf(key) };
    }

    if (dir !== currentDir) {
      try {
        await moveFile({ ...note, key, dir: currentDir, filename: baseOf(key) }, dir);
      } catch (moveError) {
        setDetailStatus(`Saved, but moving failed: ${messageFor(moveError)}`);
        notifyChanged();
        await refresh();
        return;
      }
    }

    notifyChanged();
    closeDetail();
    await refresh();
    toast('Bookmark saved', 'success');
  } catch (error) {
    if (error?.code === 'conflict') showConflict(state.currentNote);
    else setDetailStatus(messageFor(error));
    if (error?.code === 'needs-permission') showReconnect();
  } finally {
    el('detail-save').disabled = false;
  }
}

function wireDetail() {
  el('new-bookmark').addEventListener('click', openCreate);
  el('detail-form').addEventListener('submit', onDetailSubmit);
  el('detail-cancel').addEventListener('click', () => {
    if (state.mode === 'create') closeDetail();
    else {
      state.mode = 'view';
      renderDetailView(state.currentNote);
    }
  });
  el('detail-close').addEventListener('click', closeDetail);
  el('detail-open').addEventListener('click', () => {
    if (state.currentNote) window.open(state.currentNote.url, '_blank');
  });
  el('detail-copy').addEventListener('click', async () => {
    if (!state.currentNote) return;
    try {
      await navigator.clipboard.writeText(state.currentNote.url);
      toast('Link copied', 'success');
    } catch {
      toast('Could not copy the link', 'error');
    }
  });
  el('detail-edit').addEventListener('click', () => {
    state.mode = 'edit';
    renderDetailEdit(state.currentNote);
  });
  el('detail-move').addEventListener('click', () => {
    state.mode = 'edit';
    renderDetailEdit(state.currentNote);
    el('detail-collection').focus();
  });
  el('detail-delete').addEventListener('click', () => {
    if (state.currentNote) deleteNote(state.currentNote);
  });
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
  wireDetail();

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
