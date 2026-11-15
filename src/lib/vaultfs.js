import { joinPath, dirOf, baseOf } from './paths.js';
import { mapLimit } from './concurrency.js';
import { parseNote, patchFrontmatter, filenameBase, uniqueFilename, isStale } from './markdown.js';
import { domainOf } from './notes.js';

const DB_NAME = 'vaultmarks';
const STORE_NAME = 'handles';
const STORE_KEY = 'store';
const TRASH_DIR = '.vaultmarks-trash';

export class VaultError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.name = 'VaultError';
    this.code = code;
  }
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withHandleStore(mode, run) {
  const db = await openDatabase();
  try {
    const tx = db.transaction(STORE_NAME, mode);
    const result = await run(tx.objectStore(STORE_NAME));
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return result;
  } finally {
    db.close();
  }
}

export async function getStoredStore() {
  return (await withHandleStore('readonly', (store) => idbRequest(store.get(STORE_KEY)))) ?? null;
}

export async function clearStoredStore() {
  await withHandleStore('readwrite', (store) => idbRequest(store.delete(STORE_KEY)));
}

async function putStoreHandle(handle) {
  await withHandleStore('readwrite', (store) => idbRequest(store.put(handle, STORE_KEY)));
}

export async function pickStore() {
  let picked;
  try {
    picked = await showDirectoryPicker({ id: 'vaultmarks', mode: 'readwrite' });
  } catch (error) {
    if (error?.name === 'AbortError') throw new VaultError('cancelled', 'Folder selection was cancelled');
    throw error;
  }

  let store = picked;
  let settings;
  try {
    store = await picked.getDirectoryHandle('Bookmarks');
    settings = {
      vaultName: picked.name,
      storePath: 'Bookmarks',
      storeLabel: `${picked.name}/Bookmarks`,
      obsidianLinks: true,
    };
  } catch {
    settings = { vaultName: null, storePath: '', storeLabel: picked.name, obsidianLinks: false };
  }

  await putStoreHandle(store);
  return settings;
}

export async function permissionOf(handle) {
  if (!handle) throw new VaultError('no-store');
  if (typeof handle.queryPermission !== 'function') return 'granted';
  return handle.queryPermission({ mode: 'readwrite' });
}

export async function requestPermission(handle) {
  if (!handle) throw new VaultError('no-store');
  if (typeof handle.requestPermission !== 'function') return 'granted';
  const current = await handle.queryPermission({ mode: 'readwrite' });
  if (current === 'granted') return 'granted';
  return handle.requestPermission({ mode: 'readwrite' });
}

async function requireWritableStore() {
  const handle = await getStoredStore();
  if (!handle) throw new VaultError('no-store');
  if ((await permissionOf(handle)) !== 'granted') {
    throw new VaultError('needs-permission', 'Folder access needs to be granted again');
  }
  return handle;
}

async function resolveDirectory(root, path, { create = false } = {}) {
  let handle = root;
  for (const segment of String(path).split('/')) {
    if (segment === '') continue;
    handle = await handle.getDirectoryHandle(segment, { create });
  }
  return handle;
}

async function resolveFile(root, key) {
  const parent = await resolveDirectory(root, dirOf(key));
  const name = baseOf(key);
  const handle = await parent.getFileHandle(name);
  return { handle, parent, name };
}

async function entryNames(dirHandle) {
  const names = [];
  for await (const [name] of dirHandle.entries()) names.push(name);
  return names;
}

async function moveHandle(handle, parent, targetDir, targetName) {
  if (typeof handle.move === 'function') {
    try {
      await handle.move(targetDir, targetName);
      return;
    } catch {
      // Fall through to the copy-and-verify path.
    }
  }

  const text = await (await handle.getFile()).text();
  const target = await targetDir.getFileHandle(targetName, { create: true });
  const writable = await target.createWritable();
  await writable.write(text);
  await writable.close();

  if ((await (await target.getFile()).text()) !== text) {
    throw new VaultError('io', 'The copied file did not verify');
  }

  try {
    await parent.removeEntry(handle.name);
  } catch {
    throw new VaultError('partial', `Copied to ${targetName}, but the original file could not be removed`);
  }
}

async function collectMarkdown(dirHandle, prefix, out) {
  for await (const [name, entry] of dirHandle.entries()) {
    if (name.startsWith('.')) continue;
    if (entry.kind === 'directory') {
      await collectMarkdown(entry, joinPath(prefix, name), out);
    } else if (entry.kind === 'file' && /\.md$/i.test(name)) {
      out.push({ key: joinPath(prefix, name), handle: entry });
    }
  }
}

export async function scanStore(onProgress) {
  const root = await requireWritableStore();
  const files = [];
  await collectMarkdown(root, '', files);

  const notes = [];
  let skipped = 0;
  let loaded = 0;

  await mapLimit(files, 8, async ({ key, handle }) => {
    try {
      const file = await handle.getFile();
      const text = await file.text();
      const { note } = parseNote(text, { key, lastModified: file.lastModified, size: file.size });
      if (note) notes.push(note);
      else skipped += 1;
    } catch {
      skipped += 1;
    }
    loaded += 1;
    if (onProgress) onProgress(loaded, files.length);
  });

  return { notes, skipped };
}

export async function readFileText(key) {
  const root = await requireWritableStore();
  const { handle } = await resolveFile(root, key);
  const file = await handle.getFile();
  return { text: await file.text(), lastModified: file.lastModified, size: file.size };
}

export async function writeNewFile(dir, base, text) {
  const root = await requireWritableStore();
  const targetDir = await resolveDirectory(root, dir, { create: true });
  const filename = uniqueFilename(base, await entryNames(targetDir));
  const handle = await targetDir.getFileHandle(filename, { create: true });
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
  return { key: joinPath(dir, filename) };
}

export async function updateFile(note, changes) {
  const root = await requireWritableStore();
  const { handle, parent, name } = await resolveFile(root, note.key);
  const text = await (await handle.getFile()).text();
  if (isStale(note, text)) {
    throw new VaultError('conflict', 'This note changed in Obsidian. Reload and try again.');
  }

  const patched = patchFrontmatter(text, changes);
  if (patched !== text) {
    const writable = await handle.createWritable();
    await writable.write(patched);
    await writable.close();
  }

  let currentName = name;
  if (Object.hasOwn(changes, 'title') && String(changes.title ?? '').trim() !== '') {
    const desired = `${filenameBase(changes.title, domainOf(note.url))}.md`;
    if (desired.toLowerCase() !== currentName.toLowerCase()) {
      const taken = (await entryNames(parent)).filter((entry) => entry.toLowerCase() !== currentName.toLowerCase());
      const next = uniqueFilename(desired.replace(/\.md$/i, ''), taken);
      await moveHandle(handle, parent, parent, next);
      currentName = next;
    }
  }

  return { key: joinPath(dirOf(note.key), currentName) };
}

export async function moveFile(note, dir) {
  const root = await requireWritableStore();
  if (dir === note.dir) return { key: note.key };

  const { handle, parent, name } = await resolveFile(root, note.key);
  const targetDir = await resolveDirectory(root, dir, { create: true });
  const next = uniqueFilename(baseOf(name).replace(/\.md$/i, ''), await entryNames(targetDir));
  await moveHandle(handle, parent, targetDir, next);
  return { key: joinPath(dir, next) };
}

export async function trashFile(note) {
  const root = await requireWritableStore();
  const { handle, parent } = await resolveFile(root, note.key);
  const trashDir = await root.getDirectoryHandle(TRASH_DIR, { create: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const trashedAs = `${stamp}--${note.filename}`;
  await moveHandle(handle, parent, trashDir, trashedAs);
  return { trashedAs };
}

export async function createDirectory(name) {
  const trimmed = String(name ?? '').trim();
  if (
    trimmed === '' ||
    trimmed === '.' ||
    trimmed === '..' ||
    trimmed.includes('/') ||
    /[\u0000-\u001f\u007f]/.test(trimmed) ||
    new TextEncoder().encode(trimmed).length > 200
  ) {
    throw new VaultError('invalid-name', 'That collection name is not allowed');
  }

  const root = await requireWritableStore();
  const existing = (await entryNames(root)).filter((entry) => entry.toLowerCase() === trimmed.toLowerCase());
  if (existing.length > 0) throw new VaultError('exists', 'A collection with that name already exists');

  await root.getDirectoryHandle(trimmed, { create: true });
  return { path: trimmed };
}
