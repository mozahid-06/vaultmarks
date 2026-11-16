import { getSettings, saveSettings } from '../lib/settings.js';
import {
  getStoredStore,
  permissionOf,
  requestPermission,
  pickStore,
  isLegacyStoreRecord,
  adoptLegacyStoreRecord,
  clearStoredStore,
  scanStore,
  createDirectory,
  moveDirectory,
  trashDirectory,
  updateFile,
  moveFile,
  trashFile,
  writeNewFile,
} from '../lib/vaultfs.js';
import { buildIndex, filterNotes, formatDate, domainOf, obsidianUri, findByUrl, BASE_TAG } from '../lib/notes.js';
import { createNoteText, filenameBase } from '../lib/markdown.js';
import { dirOf, baseOf, isUnder, remapPath, dropDestination } from '../lib/paths.js';
import { isSavableUrl, savePrefill, captureActiveTab } from '../lib/capture.js';
import { isTabView } from '../lib/view.js';
import {
  h,
  icon,
  toast,
  faviconUrl,
  createTagInput,
  fillCollectionSelect,
  openLibraryTab,
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
  prefill: null,
  captured: null,
  saveAnyway: false,
  reconnectMode: 'reconnect',
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

// Chrome can remember the folder, but only offers the permanent choice in the
// prompt it shows when permission is asked for again. Say so at that moment.
const RECONNECT_TEXT = {
  reconnect: 'Vaultmarks needs folder access again. When Chrome asks, choose “Allow on every visit”.',
  repick: 'Vaultmarks needs one reconnection after the update: choose your vault folder.',
};

function showReconnect(mode) {
  if (mode) state.reconnectMode = mode;
  const kind = state.reconnectMode === 'repick' ? 'repick' : 'reconnect';
  el('reconnect-message').textContent = RECONNECT_TEXT[kind];
  el('reconnect-folder').textContent = kind === 'repick' ? 'Choose vault folder' : 'Reconnect folder';
  el('reconnect').hidden = false;
  el('onboarding').hidden = true;
  el('workspace').hidden = false;
}

function showWorkspace() {
  state.reconnectMode = 'reconnect';
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
    const { notes, skipped, directories } = await scanStore();
    if (generation !== state.generation) return;
    state.index = buildIndex(notes, directories);
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
    if (generation === state.generation) {
      setScanning(false);
      if (state.index) renderList();
    }
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
        { className: 'collection-row', draggable: 'true', dataset: { path: node.path } },
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
        h(
          'div',
          { className: 'collection-actions' },
          h(
            'button',
            {
              type: 'button',
              'aria-label': `Rename ${node.name}`,
              title: 'Rename or move',
              onclick: () => renameCollection(node),
            },
            icon('pencil'),
          ),
          h(
            'button',
            {
              type: 'button',
              'aria-label': `Delete ${node.name}`,
              title: 'Delete',
              onclick: () => deleteCollection(node),
            },
            icon('trash'),
          ),
        ),
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
  state.prefill = null;
  state.captured = null;
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
  const headings = { save: 'Save bookmark', create: 'New bookmark', edit: 'Edit bookmark' };
  el('detail-form-heading').textContent = headings[state.mode] ?? 'Edit bookmark';

  const source = state.mode === 'edit' ? note : state.prefill;
  el('detail-title').value = source?.title ?? '';
  el('detail-url').value = source?.url ?? '';
  el('detail-description').value = source?.description ?? '';

  const cover = el('detail-form-cover');
  if (state.captured?.image) {
    cover.src = state.captured.image;
    cover.hidden = false;
  } else {
    cover.hidden = true;
    cover.removeAttribute('src');
  }

  fillCollectionSelect(
    el('detail-collection'),
    state.index,
    state.mode === 'edit'
      ? (note?.dir ?? '')
      : (state.prefill?.collection ?? (state.collection !== '' ? state.collection : '')),
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

function openCreate(prefill = null) {
  state.mode = prefill ? 'save' : 'create';
  state.prefill = prefill;
  state.captured = prefill ? { image: prefill.image, favicon: prefill.favicon } : null;
  state.saveAnyway = false;
  state.currentNote = null;
  el('detail').showModal();
  state.dialogOpen = true;
  renderDetailEdit(null);
}

async function ensureIndex() {
  if (!state.index) await refresh();
}

async function onSavePage() {
  let meta;
  try {
    meta = await captureActiveTab();
  } catch {
    toast("This page can't be saved.", 'error');
    return;
  }
  await ensureIndex();
  if (!state.index) {
    toast('Reconnect the vault folder first.', 'error');
    return;
  }
  openCreate(savePrefill(meta, {
    lastCollection: state.settings?.lastCollection ?? '',
    selectedCollection: state.collection,
  }));
}

function showDuplicate(existing) {
  const where = existing.dir === '' ? 'Unfiled' : existing.dir;
  setDetailStatus(
    h(
      'div',
      { className: 'status-row' },
      h('span', { text: `Already saved in ${where}` }),
      h(
        'div',
        { className: 'actions' },
        h('button', {
          type: 'button',
          text: 'Open',
          onclick: () => window.open(existing.url, '_blank'),
        }),
        h('button', {
          type: 'button',
          text: 'Save anyway',
          onclick: () => {
            state.saveAnyway = true;
            el('detail-form').requestSubmit();
          },
        }),
      ),
    ),
  );
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
    if (state.mode === 'create' || state.mode === 'save') {
      if (!state.index) {
        setDetailStatus('Reconnect the vault folder first.');
        return;
      }
      const existing = findByUrl(state.index, url);
      if (existing && !state.saveAnyway) {
        showDuplicate(existing);
        return;
      }
      const text = createNoteText({
        title,
        url,
        created: todayIso(),
        description,
        image: state.captured?.image ?? '',
        favicon: state.captured?.favicon ?? '',
        tags,
      });
      await writeNewFile(dir, filenameBase(title, domainOf(url)), text);
      if (state.mode === 'save') state.settings = await saveSettings({ lastCollection: dir });
      notifyChanged();
      closeDetail();
      await refresh();
      toast('Saved', 'success');
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
  el('new-bookmark').addEventListener('click', async () => {
    await ensureIndex();
    openCreate();
  });
  el('detail-form').addEventListener('submit', onDetailSubmit);
  el('detail-cancel').addEventListener('click', () => {
    if (state.mode === 'create' || state.mode === 'save') closeDetail();
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

let dragPath = null;
const MOVE_TYPE = 'application/x-vaultmarks-move';
const MOVE_TOKEN = crypto.randomUUID();

function isCollectionDrag(event) {
  return event.dataTransfer?.types.includes(MOVE_TYPE) ?? false;
}

function draggedCollection(event) {
  if (!isCollectionDrag(event)) return null;
  const [token, ...rest] = event.dataTransfer.getData(MOVE_TYPE).split('\n');
  return token === MOVE_TOKEN ? rest.join('\n') : null;
}

function markDrop(node) {
  for (const marked of document.querySelectorAll('.drop-target')) {
    if (marked !== node) marked.classList.remove('drop-target');
  }
  node?.classList.add('drop-target');
}

function clearDragMarks() {
  for (const node of document.querySelectorAll('.dragging, .drop-target')) {
    node.classList.remove('dragging', 'drop-target');
  }
}

function wireSidebarDnd() {
  const collections = el('collections');
  const all = el('all');

  collections.addEventListener('dragstart', (event) => {
    const row = event.target.closest?.('.collection-row');
    if (!row) return;
    clearDragMarks();
    dragPath = row.dataset.path;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(MOVE_TYPE, `${MOVE_TOKEN}\n${dragPath}`);
    row.classList.add('dragging');
  });

  collections.addEventListener('dragend', () => {
    dragPath = null;
    clearDragMarks();
  });

  collections.addEventListener('dragover', (event) => {
    if (!isCollectionDrag(event)) {
      markDrop(null);
      return;
    }
    const row = event.target.closest?.('.collection-row');
    const destination = row ? dropDestination(dragPath, row.dataset.path) : null;
    if (destination == null) {
      markDrop(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    markDrop(row);
  });

  collections.addEventListener('dragleave', (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) markDrop(null);
  });

  collections.addEventListener('drop', (event) => {
    const source = draggedCollection(event);
    if (source == null) return;
    const row = event.target.closest?.('.collection-row');
    const destination = row ? dropDestination(source, row.dataset.path) : null;
    if (destination == null) return;
    event.preventDefault();
    dragPath = null;
    clearDragMarks();
    moveCollection(source, destination);
  });

  all.addEventListener('dragover', (event) => {
    if (!isCollectionDrag(event) || dropDestination(dragPath, '') == null) {
      markDrop(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    markDrop(all);
  });

  all.addEventListener('dragleave', (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) markDrop(null);
  });

  all.addEventListener('drop', (event) => {
    const source = draggedCollection(event);
    if (source == null) return;
    const destination = dropDestination(source, '');
    if (destination == null) return;
    event.preventDefault();
    dragPath = null;
    clearDragMarks();
    moveCollection(source, destination);
  });
}

async function moveCollection(fromPath, destination) {
  try {
    const { path } = await moveDirectory(fromPath, destination);
    if (isUnder(state.collection, fromPath)) state.collection = remapPath(state.collection, fromPath, path);
    for (const p of [...expanded]) {
      if (isUnder(p, fromPath)) {
        expanded.delete(p);
        expanded.add(remapPath(p, fromPath, path));
      }
    }
    const parent = dirOf(path);
    if (parent !== '') expanded.add(parent);
    toast(`Moved to ${path}`, 'success');
    notifyChanged();
    await refresh();
    return path;
  } catch (error) {
    toast(messageFor(error), 'error');
    if (error?.code === 'needs-permission') showReconnect();
    return null;
  }
}

async function newCollection() {
  const where = state.collection === '' ? '' : ` in ${state.collection}`;
  const name = window.prompt(`Collection name${where}`);
  if (name == null) return;
  try {
    const { path } = await createDirectory(name, state.collection);
    if (state.collection !== '') expanded.add(state.collection);
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

async function renameCollection(node) {
  const entered = window.prompt('Collection path', node.path);
  if (entered == null || entered.trim() === '' || entered.trim() === node.path) return;
  await moveCollection(node.path, entered.trim());
}

async function deleteCollection(node) {
  const noun = node.count === 1 ? 'bookmark' : 'bookmarks';
  if (!window.confirm(`Move "${node.name}" and its ${node.count} ${noun} to trash?`)) return;
  try {
    await trashDirectory(node.path);
    for (const p of [...expanded]) if (isUnder(p, node.path)) expanded.delete(p);
    if (isUnder(state.collection, node.path)) state.collection = '';
    toast('Collection moved to trash', 'success');
    notifyChanged();
    await refresh();
  } catch (error) {
    toast(messageFor(error), 'error');
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

const tabView = isTabView(location.search);
if (tabView) document.documentElement.classList.remove('panel');

async function init() {
  el('open-settings').append(icon('settings'));
  el('new-collection').append(icon('plus'));
  el('new-bookmark').append(icon('plus'));
  el('expand').append(icon('external'));
  el('expand').addEventListener('click', () => openLibraryTab());
  if (tabView) el('expand').hidden = true;
  if (tabView) el('save-page').hidden = true;
  else el('save-page').addEventListener('click', onSavePage);
  el('open-settings').addEventListener('click', () => {
    renderSettings();
    el('settings').showModal();
    state.dialogOpen = true;
  });
  el('choose-folder').addEventListener('click', () => {
    // Setup is a one-time act best done in a durable tab: a folder picker can
    // otherwise close the popup. The tab runs the picker in place.
    if (tabView) chooseFolder();
    else openLibraryTab();
  });
  el('reconnect-folder').addEventListener('click', () => {
    // Picking a folder can close the popup, so a re-pick runs in the tab.
    if (state.reconnectMode !== 'repick') reconnect();
    else if (tabView) chooseFolder();
    else openLibraryTab();
  });
  el('new-collection').addEventListener('click', newCollection);
  el('search').addEventListener('input', onSearchInput);
  document.addEventListener('keydown', onKeydown);
  trackDialogs();
  wireDetail();
  wireSidebarDnd();

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

  // Older versions stored the `Bookmarks` child handle. Chrome's grant is on
  // the folder the user picked, so that handle can never be restored. A flat
  // vault stores the picked folder itself and only needs the record rewritten.
  let legacy = false;
  try {
    legacy = await isLegacyStoreRecord();
    if (legacy && !state.settings.storePath) {
      await adoptLegacyStoreRecord();
      legacy = false;
    }
  } catch {
    legacy = false;
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
    showReconnect(legacy ? 'repick' : 'reconnect');
    return;
  }

  // Reveal the chrome before the scan so the panel is never a blank box; the
  // summary shows "Scanning..." and the wordmark animates until the list lands.
  showWorkspace();
  await refresh();
}

init();
