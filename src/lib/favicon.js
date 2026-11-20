import { domainOf } from './notes.js';

// Icon attempts, in order: the note's own captured favicon (remote or inline),
// Google's service, DuckDuckGo's service, then Chrome's cached favicon.
export function faviconSources(note, cached = '') {
  const own =
    typeof note?.favicon === 'string' && /^(https?:|data:image\/)/i.test(note.favicon)
      ? note.favicon
      : '';
  const domain = domainOf(note?.url ?? '');
  const google = domain
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`
    : '';
  const duck = domain ? `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico` : '';
  return [own, google, duck, cached].filter(Boolean);
}

// First alphanumeric of the site name, ignoring a leading `www.`. Used when no
// icon loads, so a card shows a monogram instead of a blank space.
export function faviconLetter(note) {
  const label = domainOf(note?.url ?? '') || note?.title || '?';
  const match = label.replace(/^www\./i, '').match(/[a-z0-9]/i);
  return (match ? match[0] : '?').toUpperCase();
}
