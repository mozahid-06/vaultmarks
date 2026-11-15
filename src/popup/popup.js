import { captureActiveTab, isSavableUrl } from '../lib/capture.js';
import { getSettings, saveSettings } from '../lib/settings.js';
import { getStoredStore, permissionOf, scanStore, writeNewFile } from '../lib/vaultfs.js';
import { buildIndex, findByUrl, domainOf, obsidianUri, BASE_TAG } from '../lib/notes.js';
import { createNoteText, filenameBase } from '../lib/markdown.js';
import { h, icon, openLibraryTab, createTagInput, fillCollectionSelect } from '../lib/ui.js';

const el = (id) => document.getElementById(id);

const state = {
  settings: null,
  index: null,
  meta: null,
  tagInput: null,
  savedKey: null,
  saveAnyway: false,
};

function setStatus(...content) {
  el('status').replaceChildren(
    ...content
      .flat(Infinity)
      .filter(Boolean)
      .map((item) => (typeof item === 'string' ? document.createTextNode(item) : item)),
  );
}

function notifyChanged() {
  try {
    chrome.runtime.sendMessage({ type: 'vault-changed' }).catch(() => {});
  } catch {
    // No library page is open; nothing to notify.
  }
}

function todayIso() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function showSetup(message) {
  el('form').hidden = true;
  el('setup').hidden = false;
  el('setup-message').textContent = message ?? 'Choose your Obsidian vault folder to start saving bookmarks.';
  el('choose-folder').textContent = 'Choose vault folder';
}

function showReconnect(message) {
  el('form').hidden = true;
  el('setup').hidden = false;
  el('setup-message').textContent = message ?? 'Vaultmarks needs permission to read your vault again.';
  el('choose-folder').textContent = 'Reconnect in library';
}

async function loadIndex() {
  setStatus('Loading…');
  const { notes } = await scanStore((loaded, total) => setStatus(`Loading… ${loaded}/${total}`));
  state.index = buildIndex(notes);
}

async function fillForm() {
  let meta;
  try {
    meta = await captureActiveTab();
  } catch {
    state.meta = null;
    el('setup').hidden = true;
    el('form').hidden = true;
    setStatus("This page can't be saved. Open a normal web page and try again.");
    return;
  }

  state.meta = meta;
  el('setup').hidden = true;
  el('form').hidden = false;
  el('title').value = meta.title;
  el('url').value = meta.url;
  el('description').value = meta.description;

  const cover = el('cover');
  if (meta.image) {
    cover.src = meta.image;
    cover.hidden = false;
  } else {
    cover.hidden = true;
    cover.removeAttribute('src');
  }

  fillCollectionSelect(el('collection'), state.index, state.settings.lastCollection);
  state.tagInput = createTagInput({
    input: el('tag-input'),
    chips: el('tags'),
    suggestions: state.index.tags.map((tag) => tag.name),
    exclude: [BASE_TAG],
  });

  el('title').focus();
  el('title').select();
}

function showDuplicate(existing) {
  const where = existing.dir === '' ? 'Unfiled' : existing.dir;
  setStatus(
    h(
      'div',
      { className: 'status-row' },
      h('span', { text: `Already saved in ${where}` }),
      h(
        'div',
        { className: 'actions' },
        h('button', { type: 'button', text: 'Open', onclick: () => window.open(existing.url, '_blank') }),
        h('button', {
          type: 'button',
          text: 'Save anyway',
          onclick: () => {
            state.saveAnyway = true;
            save();
          },
        }),
      ),
    ),
  );
}

function showSaved() {
  const settings = state.settings;
  const buttons = [];

  if (settings.obsidianLinks && settings.vaultName) {
    buttons.push(
      h('button', {
        type: 'button',
        text: 'Open in Obsidian',
        onclick: () => window.open(obsidianUri(settings.vaultName, settings.storePath, state.savedKey)),
      }),
    );
  }
  buttons.push(h('button', { type: 'button', text: 'Open library', onclick: () => openLibraryTab() }));
  buttons.push(h('button', { type: 'button', className: 'primary', text: 'Save another', onclick: resetForNext }));

  setStatus(
    h(
      'div',
      { className: 'status-row' },
      h('span', { className: 'saved', text: 'Saved ✓' }),
      h('div', { className: 'actions' }, ...buttons),
    ),
  );
}

async function resetForNext() {
  state.saveAnyway = false;
  setStatus('');
  await fillForm();
}

async function save() {
  const title = el('title').value.trim();
  const url = state.meta.url;
  const dir = el('collection').value;
  const description = el('description').value.trim();
  const tags = [BASE_TAG, ...state.tagInput.getTags()];
  const text = createNoteText({
    title,
    url,
    created: todayIso(),
    description,
    image: state.meta.image,
    favicon: state.meta.favicon,
    tags,
  });

  setStatus('Saving…');
  el('save').disabled = true;
  try {
    const { key } = await writeNewFile(dir, filenameBase(title, domainOf(url)), text);
    state.savedKey = key;
    setStatus('');
    await saveSettings({ lastCollection: dir });
    notifyChanged();
    showSaved();
  } catch (error) {
    setStatus(
      error?.code === 'needs-permission'
        ? 'Folder access was lost. Reconnect in the library.'
        : `Could not save: ${error?.message ?? error}`,
    );
  } finally {
    el('save').disabled = false;
  }
}

async function onSave(event) {
  event.preventDefault();
  if (!state.meta || !isSavableUrl(state.meta.url)) return;

  const title = el('title').value.trim();
  if (title === '') {
    setStatus('Add a title before saving.');
    el('title').focus();
    return;
  }

  const existing = findByUrl(state.index, state.meta.url);
  if (existing && !state.saveAnyway) {
    showDuplicate(existing);
    return;
  }

  await save();
}

async function init() {
  el('open-library').append(icon('external'));
  el('open-library').addEventListener('click', () => openLibraryTab());
  el('choose-folder').addEventListener('click', () => openLibraryTab());
  el('form').addEventListener('submit', onSave);
  el('form').addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      el('form').requestSubmit();
    }
  });

  const settings = await getSettings();
  state.settings = settings;

  if (!settings.storeLabel) {
    showSetup('Choose your Obsidian vault folder once, then save pages with one click.');
    return;
  }

  let handle = null;
  try {
    handle = await getStoredStore();
  } catch {
    handle = null;
  }
  if (!handle) {
    showSetup();
    return;
  }

  let permission = 'prompt';
  try {
    permission = await permissionOf(handle);
  } catch {
    permission = 'prompt';
  }
  if (permission !== 'granted') {
    showReconnect();
    return;
  }

  try {
    await loadIndex();
  } catch (error) {
    showReconnect(
      error?.name === 'NotFoundError'
        ? 'Your vault folder could not be found. Reconnect it in the library.'
        : undefined,
    );
    return;
  }

  await fillForm();
}

init();
