// Capture the real extension panel for the README. No extension APIs are
// available outside Chromium, so the vault filesystem module is fulfilled with
// in-memory fixtures and chrome.storage is stubbed. Every pixel comes from the
// shipped HTML/CSS/JS.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { notes, directories, coverSvg } from './fixtures.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(here, '../../..');
const output = join(root, 'docs/brand/panel.png');

// PLAYWRIGHT_MODULE may be an installed package name or a directory on disk;
// ESM cannot import a directory, so point at its entry file.
let module = process.env.PLAYWRIGHT_MODULE ?? 'playwright';
if (module !== 'playwright' && existsSync(module) && statSync(module).isDirectory()) {
  module = join(module, 'index.mjs');
}

let chromium;
try {
  ({ chromium } = await import(module));
} catch {
  console.error('Set PLAYWRIGHT_MODULE=/path/to/playwright');
  process.exit(1);
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

const vaultStub = `export const BASE_TAG = 'bookmarks';
export async function getStoredStore() { return { name: 'notes' }; }
export async function permissionOf() { return 'granted'; }
export async function requestPermission() { return true; }
export async function pickStore() { return { handle: {}, storePath: 'Bookmarks', legacy: false }; }
export async function isLegacyStoreRecord() { return false; }
export async function adoptLegacyStoreRecord() {}
export async function clearStoredStore() {}
export async function scanStore() { return ${JSON.stringify({ notes, skipped: 0, directories })}; }
export async function createDirectory() {}
export async function moveDirectory() {}
export async function trashDirectory() {}
export async function updateFile() {}
export async function moveFile() {}
export async function trashFile() {}
export async function writeNewFile() {}
`;

const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);

  const cover = pathname.match(/^\/__brand\/cover-(\d+)\.svg$/);
  if (cover) {
    res.writeHead(200, { 'content-type': 'image/svg+xml' });
    res.end(coverSvg(Number(cover[1])));
    return;
  }

  const file = normalize(join(root, pathname));
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    let target = file;
    if ((await stat(target)).isDirectory()) target = join(target, 'index.html');
    const body = await readFile(target);
    res.writeHead(200, { 'content-type': mime[extname(target)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

await new Promise((done) => server.listen(0, '127.0.0.1', done));
const { port } = server.address();

const executablePath = process.env.CHROMIUM_PATH
  ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox'],
});

try {
  const page = await browser.newPage({
    viewport: { width: 780, height: 600 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });

  await page.route('**/src/lib/vaultfs.js', (route) =>
    route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: vaultStub }));

  await page.addInitScript(() => {
    const data = {
      vaultName: 'notes',
      storePath: 'Bookmarks',
      storeLabel: 'notes/Bookmarks',
      obsidianLinks: false,
      lastCollection: '',
      sort: 'newest',
    };
    globalThis.chrome = {
      storage: {
        local: {
          get: async (defaults) => ({ ...(defaults || {}), ...data }),
          set: async (patch) => Object.assign(data, patch),
        },
        session: { get: async () => null, set: async () => {} },
      },
      runtime: {
        getURL: () => 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221%22 height=%221%22/%3E',
        getManifest: () => ({ version: '0.0.0' }),
        onMessage: { addListener() {} },
        sendMessage: async () => {},
      },
      tabs: {
        get: async () => { throw new Error('no active tab'); },
        update: async () => {},
        create: async () => ({ id: 1 }),
        query: async () => [],
        sendMessage: async () => {},
      },
    };
  });

  await page.goto(`http://127.0.0.1:${port}/src/library/library.html`);
  await page.waitForSelector('#workspace', { state: 'visible' });
  await page.waitForFunction(() => document.querySelectorAll('#list .row').length >= 5);

  // Open the nested collection so the sidebar shows its full path.
  await page.click('button.disclosure[aria-expanded="false"]');
  await page.waitForFunction(() => document.querySelectorAll('#list .row').length >= 5);

  // Cover images are lazy: wait until the visible rows have decoded theirs.
  await page.waitForFunction(() =>
    [...document.querySelectorAll('#list .row .thumb img')]
      .every((image) => image.complete && image.naturalWidth > 0));

  await page.screenshot({ path: output });
  console.log(output);
} finally {
  await browser.close();
  server.close();
}
