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

function extractMeta() {
  const meta = (selector) => document.querySelector(selector)?.content ?? '';
  return {
    title: meta('meta[property="og:title"]') || document.title || '',
    url: document.querySelector('link[rel="canonical"]')?.href || location.href,
    description: meta('meta[property="og:description"]') || meta('meta[name="description"]') || '',
    image: meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]') || '',
    favicon: document.querySelector('link[rel~="icon"]')?.href || '',
  };
}

export async function captureActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !isSavableUrl(tab.url)) throw new Error('unsupported');

  let results;
  try {
    results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractMeta });
  } catch {
    throw new Error('unsupported');
  }

  return normalizeMeta(results?.[0]?.result, tab.url);
}
