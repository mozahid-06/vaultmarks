const DEFAULTS = {
  vaultName: null,
  storePath: '',
  storeLabel: '',
  obsidianLinks: false,
  lastCollection: '',
  sort: 'newest',
};

export async function getSettings() {
  const stored = await chrome.storage.local.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

export async function saveSettings(partial) {
  await chrome.storage.local.set(partial ?? {});
  return getSettings();
}

export async function getLibraryTabId() {
  const stored = await chrome.storage.session.get('libraryTabId');
  return stored?.libraryTabId ?? null;
}

export async function setLibraryTabId(id) {
  await chrome.storage.session.set({ libraryTabId: id ?? null });
}
