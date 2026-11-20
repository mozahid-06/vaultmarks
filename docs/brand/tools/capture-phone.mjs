// Render the shipped DataviewJS viewer block in a bare HTML page at phone
// width, with the same public fixtures as the panel capture. The block is read
// straight out of obsidian/vaultmarks.md so the screenshot cannot drift from
// the real viewer.

import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { viewerPages, coverSvg } from './fixtures.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(here, '../../..');
const source = join(root, 'obsidian/vaultmarks.md');
const output = join(root, 'docs/brand/phone.png');

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

const md = await readFile(source, 'utf8');
const block = md.match(/```dataviewjs\n([\s\S]*?)```/);
if (!block) {
  console.error(`No dataviewjs block in ${source}`);
  process.exit(1);
}

const pages = viewerPages.map((page) => ({
  ...page,
  image: page.image.replace(/^/, 'https://brand.local'),
}));

const executablePath = process.env.CHROMIUM_PATH
  ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox'],
});

try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });

  await page.route('https://brand.local/__brand/cover-*.svg', (route) => {
    const index = Number(route.request().url().match(/cover-(\d+)\.svg$/)[1]);
    return route.fulfill({ contentType: 'image/svg+xml', body: coverSvg(index) });
  });

  await page.setContent(`<!doctype html>
<html><head><meta charset="utf-8"><title>Vaultmarks viewer</title>
<style>body { margin: 0; background: #0c0a14; }</style></head>
<body><div id="viewer"></div></body></html>`);

  await page.evaluate((pages) => {
    HTMLElement.prototype.createEl = function createEl(tag, options = {}) {
      const el = document.createElement(tag);
      if (options.cls) el.className = options.cls;
      if (options.text) el.textContent = options.text;
      for (const [name, value] of Object.entries(options.attr ?? {})) {
        el.setAttribute(name, value);
      }
      for (const [name, value] of Object.entries(options)) {
        if (['cls', 'text', 'attr'].includes(name) || value == null) continue;
        el.setAttribute(name, value);
      }
      this.appendChild(el);
      return el;
    };
    HTMLElement.prototype.empty = function empty() {
      this.replaceChildren();
    };
    HTMLElement.prototype.setText = function setText(value) {
      this.textContent = value;
    };

    globalThis.dv = {
      pages: () => pages,
      container: document.getElementById('viewer'),
    };
    globalThis.app = {
      vault: {
        getAbstractFileByPath: () => null,
        cachedRead: async () => '',
      },
      workspace: { getLeaf: () => ({ openFile() {} }) },
      fileManager: {},
    };
  }, pages);

  await page.addScriptTag({ content: block[1] });
  await page.waitForSelector('.bv-card', { state: 'attached' });
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach((details) => { details.open = true; });
  });
  await page.waitForSelector('.bv-card', { state: 'visible' });

  // Covers load when near the viewport; walk the page so every visible card
  // has its image rather than an empty tile.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 300) {
      window.scrollTo(0, y);
      await new Promise((done) => requestAnimationFrame(done));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.bv-thumb img')].every((image) => image.complete));

  // The README shows this at phone width, so a full-page shot six cards long
  // would run most of a screen down the page. Stop just below the last card
  // that fits inside the compact budget; the cut lands after a card, never
  // through one.
  const clip = await page.evaluate(() => {
    const bottoms = [...document.querySelectorAll('.bv-card')]
      .map((card) => Math.round(card.getBoundingClientRect().bottom + scrollY));
    const cut = Math.max(0, ...bottoms.filter((bottom) => bottom <= 800));
    return { x: 0, y: 0, width: 390, height: cut + 6 };
  });

  await page.screenshot({ path: output, clip });
  console.log(output, clip);
} finally {
  await browser.close();
}
