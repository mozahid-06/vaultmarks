import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const readBuffer = (path) => readFile(new URL(`../${path}`, import.meta.url));

function pngSize(buffer) {
  assert.equal(buffer.toString('ascii', 1, 4), 'PNG');
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

test('brand SVGs contain no text elements', async () => {
  for (const file of ['banner.svg', 'social-preview.svg']) {
    const svg = await read(`docs/brand/${file}`);
    assert.match(svg, /<svg[^>]*width="(1600|1280)"/);
    assert.doesNotMatch(svg, /<text\b/i);
  }
});

test('banner and social preview have the declared sizes', async () => {
  assert.match(await read('docs/brand/banner.svg'), /width="1600"[^>]*height="400"/);
  assert.match(await read('docs/brand/social-preview.svg'), /width="1280"[^>]*height="640"/);
  assert.deepEqual(pngSize(await readBuffer('docs/brand/social-preview.png')), [1280, 640]);
});

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('extension tokens use the brand palette', async () => {
  const css = await read('src/library/library.css');
  const light = css.slice(0, css.indexOf('@media'));
  const dark = css.slice(css.indexOf('@media'), css.indexOf('* {'));

  for (const [token, value] of Object.entries({
    '--bg': '#ffffff',
    '--fg': '#1b1726',
    '--muted': '#6b6478',
    '--line': '#e7e2f0',
    '--accent': '#6d4ae0',
    '--accent-fg': '#ffffff',
    '--surface': '#f8f6fc',
    '--hover': '#f1edf9',
  })) {
    assert.match(light, new RegExp(`${token}: ${value};`), `light ${token}`);
  }

  for (const [token, value] of Object.entries({
    '--bg': '#14111d',
    '--fg': '#ece9f5',
    '--muted': '#a49db8',
    '--line': '#322b45',
    '--accent': '#a78bfa',
    '--accent-fg': '#14101f',
    '--surface': '#1d1829',
    '--hover': '#262033',
  })) {
    assert.match(dark, new RegExp(`${token}: ${value};`), `dark ${token}`);
  }

  assert.match(css, /\.favicon-letter\s*\{[^}]*background: #5a3fd1;/);
});

test('brand token pairs meet WCAG AA', () => {
  const pairs = [
    ['#1b1726', '#ffffff'],
    ['#6b6478', '#ffffff'],
    ['#ffffff', '#6d4ae0'],
    ['#ece9f5', '#14111d'],
    ['#a49db8', '#14111d'],
    ['#14101f', '#a78bfa'],
    ['#c4b5fd', '#161226'],
    ['#d7d3e3', '#161226'],
    ['#a78bfa', '#161226'],
  ];
  for (const [fg, bg] of pairs) {
    assert.ok(contrast(fg, bg) >= 4.5, `${fg} on ${bg} is ${contrast(fg, bg).toFixed(2)}:1`);
  }
});

test('viewer uses the brand palette and paints its own dark surface', async () => {
  const md = await read('obsidian/vaultmarks.md');
  for (const literal of [
    'cardBg: "#161226"',
    'leftPanelBg: "#100c1e"',
    'border: "rgba(167, 139, 250, 0.32)"',
    'title: "#c4b5fd"',
    'description: "#d7d3e3"',
    'url: "#a78bfa"',
    'domainLabel: "#a78bfa"',
    'highlight: "rgba(196, 181, 253, 0.32)"',
    'pageBg: "#14101f"',
    'dv.container.style.backgroundColor = COLORS.pageBg',
  ]) {
    assert.ok(md.includes(literal), `missing ${literal}`);
  }
  assert.ok(!md.includes('#5eead4'), 'teal text colour survived');
  assert.ok(!md.includes('rgba(94, 234, 212'), 'teal alpha survived');
  assert.ok(md.includes('%23a78bfa'), 'fallback icon is not violet');
  assert.ok(md.includes('background: #5a3fd1'), 'letter tile is not violet');
});

test('repo viewer matches the live note and keeps recent behaviour', async () => {
  const [repo, live] = await Promise.all([
    read('obsidian/vaultmarks.md'),
    readFile(`${process.env.HOME}/Documents/notes/vaultmarks.md`, 'utf8'),
  ]);
  assert.equal(repo, live);
  for (const name of ['renderFaviconFallback', 'whenNearViewport', 'mdDestination']) {
    assert.ok(repo.includes(name), `missing ${name}`);
  }
});

test('README screenshots exist at their declared sizes', async () => {
  assert.deepEqual(pngSize(await readBuffer('docs/brand/panel.png')), [1560, 1200]);
});

test('phone capture is a tall 390px-wide view', async () => {
  const [width, height] = pngSize(await readBuffer('docs/brand/phone.png'));
  assert.equal(width, 780);
  assert.ok(height > 1200, `phone capture is ${width}x${height}`);
});

test('README leads with the brand assets and tagline', async () => {
  const md = await read('README.md');
  for (const path of ['docs/brand/banner.svg', 'docs/brand/panel.png', 'docs/brand/phone.png']) {
    assert.ok(md.includes(path), `README is missing ${path}`);
  }
  assert.ok(md.includes('Save on desktop. Read on your phone. Keep the files.'));

  const images = [...md.matchAll(/!\[[^\]]*\]\((docs\/[^)\s]+)\)/g)].map((m) => m[1]);
  for (const image of images) {
    await assert.doesNotReject(read(image), `README image does not exist: ${image}`);
  }
});

test('brand guide documents the palette and capture commands', async () => {
  const guide = await read('docs/brand/README.md');
  for (const hex of ['#0c0a14', '#6d4ae0', '#a78bfa', '#c4b5fd', '#5a3fd1', '#2dd4bf']) {
    assert.ok(guide.includes(hex), `brand guide is missing ${hex}`);
  }
  assert.ok(guide.includes('docs/brand/tools/capture-panel.mjs'));
  assert.ok(guide.includes('docs/brand/tools/capture-phone.mjs'));
  assert.ok(guide.includes('PLAYWRIGHT_MODULE'));
});

test('manifest description matches the product line', async () => {
  const manifest = JSON.parse(await read('manifest.json'));
  assert.equal(
    manifest.description,
    'A Chromium bookmark extension that saves each bookmark as a Markdown note in your Obsidian vault — capture on desktop, read on your phone.',
  );
});

test('the repository is licensed GPL-3.0 and says so', async () => {
  const license = await read('LICENSE');
  assert.match(license, /GNU GENERAL PUBLIC LICENSE/);
  assert.match(license, /Version 3, 29 June 2007/);
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.license, 'GPL-3.0-only');
  const readme = await read('README.md');
  assert.match(readme, /GNU General Public License/);
});
