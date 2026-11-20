import { domainOf } from './notes.js';

function collapse(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function resolveHttpAsset(value, base) {
  const raw = String(value ?? '').trim();
  if (raw === '') return '';
  try {
    const url = new URL(raw, base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

export function isSavableUrl(url) {
  try {
    const protocol = new URL(String(url)).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeMeta(raw, pageUrl) {
  const source = raw ?? {};
  const page = String(pageUrl ?? '');
  let origin = '';
  try {
    origin = new URL(page).origin;
  } catch {
    origin = '';
  }

  let favicon = resolveHttpAsset(source.favicon, page);
  if (favicon === '' && origin !== '' && origin !== 'null') favicon = `${origin}/favicon.ico`;

  return {
    title: collapse(source.title) || domainOf(page),
    url: isSavableUrl(page) ? page : '',
    description: collapse(source.description).slice(0, 1000),
    image: resolveHttpAsset(source.image, page).slice(0, 2000),
    favicon,
  };
}

export function savePrefill(meta, { lastCollection = '', selectedCollection = '' } = {}) {
  return {
    title: meta.title,
    url: meta.url,
    description: meta.description,
    image: meta.image,
    favicon: meta.favicon,
    collection: lastCollection || selectedCollection || '',
  };
}

function extractMeta() {
  const meta = (selector) => document.querySelector(selector)?.content ?? '';
  return {
    title: meta('meta[property="og:title"]') || document.title || '',
    // The address bar is the source of truth. A canonical link can point at a
    // different page (and on single-page apps it can lag behind the URL the
    // user is actually looking at).
    url: location.href,
    description: meta('meta[property="og:description"]') || meta('meta[name="description"]') || '',
    image: meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]') || '',
    favicon: document.querySelector('link[rel~="icon"]')?.href || '',
    // YouTube (and other video sites) leave the Open Graph tags on the first
    // video when navigating inside the app, but their JSON-LD is updated.
    // Read it here and let the extension choose the entry for this URL.
    jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map((script) => script.textContent ?? '')
      .filter((text) => text.includes('VideoObject'))
      .slice(0, 10),
  };
}

// Prefer the URL read from the page itself: it is updated by the page's own
// history calls, even when Chrome's tab object still reports the previous
// URL. Fall back to the tab URL for pages that refuse injection.
export function preferredPageUrl(tabUrl, capturedUrl) {
  if (isSavableUrl(capturedUrl)) return String(capturedUrl);
  return isSavableUrl(tabUrl) ? String(tabUrl) : '';
}

function collectObjects(value, out) {
  if (Array.isArray(value)) {
    for (const item of value) collectObjects(item, out);
    return;
  }
  if (!value || typeof value !== 'object') return;
  out.push(value);
  if (Array.isArray(value['@graph'])) collectObjects(value['@graph'], out);
}

function videoIdOf(pageUrl) {
  try {
    const url = new URL(pageUrl);
    return url.searchParams.get('v')
      || url.pathname.match(/\/(?:shorts|embed|live)\/([A-Za-z0-9_-]+)/)?.[1]
      || '';
  } catch {
    return '';
  }
}

function isVideoObject(node) {
  const type = node?.['@type'];
  return type === 'VideoObject' || (Array.isArray(type) && type.includes('VideoObject'));
}

function firstImage(value) {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first === 'string') return collapse(first);
  if (first && typeof first === 'object') return collapse(first.url ?? first.contentUrl ?? '');
  return '';
}

// Pick the VideoObject that describes this exact page. Sites that navigate
// inside the app (YouTube) keep every video they played in the JSON-LD; the
// newest one wins the tie-break because it is usually the richest.
export function findVideoObject(values, pageUrl) {
  const nodes = [];
  for (const value of values ?? []) {
    let parsed = value;
    if (typeof parsed === 'string') {
      if (!parsed.includes('VideoObject')) continue;
      try {
        parsed = JSON.parse(parsed);
      } catch {
        continue;
      }
    }
    collectObjects(parsed, nodes);
  }

  const id = videoIdOf(pageUrl);
  let best = null;
  let bestScore = -1;
  for (const node of nodes) {
    if (!isVideoObject(node)) continue;
    const fields = [node['@id'], node.url, node.embedUrl, node.mainEntityOfPage]
      .filter((value) => typeof value === 'string');
    const matches = fields.some((value) => value === pageUrl || (id !== '' && value.includes(id)));
    if (!matches) continue;
    const thumb = firstImage(node.thumbnailUrl ?? node.image);
    const score = (node.name ? 2 : 0) + (node.description ? 2 : 0) + (thumb ? 1 : 0) + (node.embedUrl ? 1 : 0);
    if (score >= bestScore) {
      best = node;
      bestScore = score;
    }
  }
  return best;
}

export function structuredMeta(raw, pageUrl) {
  const source = raw ?? {};
  const video = findVideoObject(source.jsonLd ?? [], pageUrl);
  if (!video) return source;
  return {
    ...source,
    title: collapse(video.name) || source.title || '',
    // Once the right video is known, do not fall back to Open Graph fields:
    // on these sites they belong to the previously played video. An empty
    // description or image is better than the wrong one.
    description: collapse(video.description),
    image: firstImage(video.thumbnailUrl ?? video.image),
  };
}

const delay = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

async function readPage(tabId) {
  const results = await chrome.scripting.executeScript({ target: { tabId }, func: extractMeta });
  return results?.[0]?.result ?? null;
}

export async function captureActiveTab() {
  const [found] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!found) throw new Error('unsupported');

  // Re-read the tab instead of trusting the object from the query: the popup
  // can stay open while the page navigates (YouTube autoplay, SPA links).
  let tab = found;
  try {
    tab = await chrome.tabs.get(found.id);
  } catch {
    // Keep the queried tab if get() is not available.
  }
  if (!tab || !isSavableUrl(tab.url)) throw new Error('unsupported');

  let raw = null;
  let pageUrl = tab.url;
  const attempts = 5;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      raw = await readPage(tab.id);
    } catch {
      if (attempt === attempts - 1) throw new Error('unsupported');
      await delay(150);
      continue;
    }
    if (!raw) {
      if (attempt === attempts - 1) throw new Error('unsupported');
      await delay(150);
      continue;
    }
    // If the tab committed a navigation while the page was being read, read
    // the new document instead of mixing the old metadata with a new URL.
    let latest = tab;
    try {
      latest = await chrome.tabs.get(tab.id);
    } catch {
      // Keep the tab we already have.
    }
    if (latest && latest.url !== tab.url && isSavableUrl(latest.url)) {
      if (attempt === attempts - 1) break;
      tab = latest;
      await delay(150);
      continue;
    }
    pageUrl = preferredPageUrl(tab.url, raw.url);
    const waiting = Array.isArray(raw.jsonLd) && raw.jsonLd.length > 0
      && findVideoObject(raw.jsonLd, pageUrl) == null;
    if (!waiting || attempt === attempts - 1) break;
    // The page URL changed but its structured data has not caught up yet
    // (YouTube takes a few hundred milliseconds). Wait briefly and reread.
    await delay(250);
    try {
      tab = await chrome.tabs.get(tab.id);
    } catch {
      // Keep the tab we already have.
    }
  }

  pageUrl = preferredPageUrl(tab.url, raw?.url ?? '');
  return normalizeMeta(structuredMeta(raw, pageUrl), pageUrl);
}
