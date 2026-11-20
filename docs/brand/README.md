# Vaultmarks brand guide

Vaultmarks is a Chromium extension first: you save the page you are on, and it
becomes a Markdown note in your Obsidian vault. This folder holds the artwork
and the rules that keep every surface looking like the same product.

The code and the artwork in this repository are licensed under the GNU
General Public License v3.0. See [`../../LICENSE`](../../LICENSE).

## The mark

The mark is the faceted dark shard on the left and the nested violet bookmarks
on the right. It already ships in two cuts; do not redraw either one.

| File | Use | Minimum size |
| --- | --- | --- |
| `icons/icon.svg` | 48px and larger: README artwork, repository avatar, large placements | 48px |
| `icons/icon-small.svg` | Toolbar and store icon, 16px and 32px | 16px |

- The dark rounded tile is part of the mark. Do not place the detailed mark on
  a light background without it.
- Clear space on every side is at least the width of one bookmark bar in the
  mark.
- Do not recolour, rotate, outline or add a glow to the mark.
- In `banner.svg` and `social-preview.svg` the mark's centre shares the centre
  of the three-line text block, so the lockup reads level instead of hanging
  below the icon.

## Palette

| Token | Hex | Use |
| --- | --- | --- |
| Ink 950 | `#0c0a14` | Deepest background, banner base |
| Ink 900 | `#14101f` | Brand dark background, viewer surface |
| Ink 850 | `#1b1730` | Banner gradient, raised dark surfaces |
| Ink 800 | `#241d3d` | Mark artwork and illustration |
| UI dark | `#14111d` | Extension `--bg` in dark mode |
| Viewer card | `#161226` | Viewer `cardBg` |
| Viewer panel | `#100c1e` | Viewer `leftPanelBg` |
| Violet 300 | `#c4b5fd` | Titles and primary text on dark |
| Violet 400 | `#a78bfa` | Accent on dark, links, UI borders |
| Violet 500 | `#8b6ef5` | Sample-cover midpoint |
| Violet 600 | `#6d4ae0` | Primary buttons on light, focus |
| Violet 700 | `#5a3fd1` | Gradient end, monogram tiles |
| Mark stroke | `#a794ff` / `#8f78e6` | Facet strokes in `icons/icon.svg` |
| Mark gradient | `#9b82f5` → `#5a3fd1` | Bookmark body in the mark |
| Paper | `#f7f5fb` | Illustration background, not used by the UI |
| Success teal | `#2dd4bf` | Success and positive states only |
| Danger | `#c0392b` light / `#f07171` dark | Destructive actions |
| UI light surface | `#f8f6fc` | Extension `--surface` in light mode |
| UI light hover | `#f1edf9` | Extension `--hover` in light mode |
| UI dark surface | `#1d1829` | Extension `--surface` in dark mode |
| UI dark hover | `#262033` | Extension `--hover` in dark mode |
| UI dark line | `#322b45` | Neutral dividers in dark mode |

Rules:

- Violet is for identity and interaction. Teal is not a second brand colour;
  it is reserved for success states.
- Body copy stays neutral: `#d7d3e3` on dark, `#1b1726` on light.
- Every text/background pair reaches 4.5:1.
- Focus rings, selected rows and the viewer card boundary reach 3:1. Neutral
  dividers and input outlines are decorative and use the palette neutrals.
- The per-note monogram colours stored in the vault stay as they are. Only the
  runtime letter fallback uses Violet 700.

## Type

- Wordmark and headings: **Space Grotesk**, semibold. The wordmark is
  `Vaultmarks`, capital V, one word.
- UI and body: the system stack already in `src/library/library.css`. Do not
  add a runtime web font.
- Every line in `banner.svg` and `social-preview.svg` — wordmark, tagline and
  labels — is converted to paths. The font file is not committed, so the SVGs
  render identically on GitHub, in `rsvg-convert` and in any browser.
- Tagline: **Save on desktop. Read on your phone. Keep the files.**
- One-line description: *A Chromium bookmark extension that saves each
  bookmark as a Markdown note in your Obsidian vault.*

## Voice

Quiet, exact, file-first. Short declarative sentences. Say what happens to the
file.

- Use: save, capture, note, vault, folder, Markdown, plain file.
- Avoid: supercharge, AI, second brain, productivity, seamless, magical.
- Prefer the concrete noun: "the note lands in the collection you choose" over
  "your workflow is streamlined".
- Do not promise a feature the code does not have.

## Assets

| File | Size | Purpose |
| --- | --- | --- |
| `banner.svg` | 1600×400 | README header |
| `social-preview.svg` | 1280×640 | Source for the social preview |
| `social-preview.png` | 1280×640 | GitHub social preview upload |
| `panel.png` | 1560×1200 (780×600 at 2×) | Real extension panel, dark scheme |
| `phone.png` | 780×1508 (390×754 at 2×) | Viewer at phone width, cropped after the fourth card; folders are expanded for the capture |

The PNGs are committed so the README does not depend on a build. The SVGs are
the editable sources.

## Regenerating the screenshots

The captures drive the real extension page and the real viewer block. They
read Playwright from `PLAYWRIGHT_MODULE` (a package name or a directory) and
add no dependency to `package.json`.

```bash
PLAYWRIGHT_MODULE=/path/to/playwright \
  node docs/brand/tools/capture-panel.mjs

PLAYWRIGHT_MODULE=/path/to/playwright \
  node docs/brand/tools/capture-phone.mjs
```

- `capture-panel.mjs` serves the repository on `127.0.0.1`, stubs the folder
  layer with `docs/brand/tools/fixtures.mjs`, and captures
  `src/library/library.html` in dark mode at 780×600, 2×.
- `capture-phone.mjs` extracts the first `dataviewjs` block from
  `obsidian/vaultmarks.md`, runs it against a mock `dv` and `app`, and captures
  390px wide at 2×, cropped just below the fourth card so the README shows a
  phone-sized screen instead of the whole library.
- Neither harness is part of `npm test`; `node --test tests/brand.test.js`
  checks the committed dimensions instead.

If Chromium is not on `PATH`, set `CHROMIUM_PATH` to the executable.

## Social preview

GitHub has no API for the social preview. Upload
`docs/brand/social-preview.png` by hand under **Settings → General → Social
preview**. Re-upload it whenever the lockup changes.

## Changing the brand

1. Edit the source asset, not the committed PNG.
2. Re-render `social-preview.png` with
   `rsvg-convert -w 1280 -h 640 docs/brand/social-preview.svg -o docs/brand/social-preview.png`.
3. Re-run both capture harnesses.
4. Run `node --test tests/brand.test.js` and `npm test`.
5. Check the banner at 800px wide, the social preview at 640px, the panel at
   native size, and the phone shot at 390px.
