# Vaultmarks — full brand identity

Date: 2026-11-20
Status: awaiting approval

## Intent

Vaultmarks is a Chromium extension first: you save the page you are on, and it
becomes a Markdown note in your Obsidian vault. The companion `vaultmarks.md`
page is how the same library is read, edited and extended on a phone.

Today those surfaces do not look related. The new app mark is indigo and
violet, the extension accent is periwinkle blue, the Obsidian page is teal, and
the GitHub repository opens with plain text. This project gives the product one
identity from the 16px toolbar icon to the repository page, and makes the
desktop-capture / phone-reading split the centre of the story.

Success looks like: a stranger lands on the repo, understands in five seconds
what Vaultmarks is and where it runs, and sees the same product on desktop and
phone. The maintainer sees one palette and one voice across every surface.

## Goals

- One palette, mark and voice across icon, extension, Obsidian page and repo.
- A README that leads with the product, not the implementation.
- Reproducible brand assets: a banner, social preview, and two product shots.
- A short brand guide so future UI work has a reference.
- No behaviour changes.

## Non-goals

- A landing page or docs site.
- Chrome Web Store listing assets and copy.
- Renaming the product, changing the version, or adding a license.
- New features, new screenshots of features that do not exist, or a redesign
  of the layouts.
- Recolouring site favicons or the per-note monograms stored in the vault.

## Anti-goals

- A generic purple SaaS look: gradients everywhere, glassmorphism, fake depth.
- Purple text on purple surfaces with weak contrast.
- A 16px icon whose detail turns to mud.
- Screenshots that misrepresent the UI.
- Heavy assets or runtime web-font dependencies.

## Constraints

- No build step. The extension is loaded unpacked; the viewer is one
  DataviewJS page.
- The extension supports light and dark colour schemes. The viewer's cards are
  dark, but its headings, tree and status text currently sit directly on the
  Obsidian page background, which may be light; it must paint its own dark
  surface so the identity and contrast do not depend on the user's theme.
- GitHub renders README images from relative paths; social previews must be
  1280×640 PNG.
- The app mark already exists as `icons/icon.svg` (full detail) and
  `icons/icon-small.svg` (16/32px). Do not redraw it.
- The live viewer at `~/Documents/notes/vaultmarks.md` is ahead of
  `obsidian/vaultmarks.md`; the repo copy must be brought up to date before
  recolouring.
- Tests are plain `node --test`; no new dependency may be required to run them.

## Approaches

- **A. Repo artwork only.** Safe and quick, but leaves desktop and phone
  looking like different products.
- **B. Full identity (chosen).** Repo artwork plus aligned extension and
  viewer palettes.
- **C. Full identity plus landing page.** Deferred; not needed to make the repo
  credible and adds a surface to maintain.

B was chosen because the phone is the main reading surface and the mark
already establishes the palette.

## Brand system

### Name and line

- Wordmark: **Vaultmarks**, capital V, no space, no suffix.
- Tagline: **Save on desktop. Read on your phone. Keep the files.**
- One-line description: *A Chromium bookmark extension that saves each
  bookmark as a Markdown note in your Obsidian vault.*
- Voice: quiet, exact, file-first. Short declarative sentences. No
  "supercharge", "AI", "second brain" or productivity jargon.

### Palette

| Token | Hex | Use |
| --- | --- | --- |
| Ink 950 | `#0c0a14` | Deepest background, banner base |
| Ink 900 | `#14101f` | Brand dark background, viewer surface |
| Ink 850 | `#1b1730` | Banner gradient, raised dark surfaces |
| Ink 800 | `#241d3d` | Hover, borders on dark |
| UI dark | `#14111d` | Extension `--bg` (its own neutral-ink step) |
| Viewer card | `#161226` | Viewer `cardBg` |
| Viewer panel | `#100c1e` | Viewer `leftPanelBg` |
| Violet 300 | `#c4b5fd` | Titles and primary text on dark |
| Violet 400 | `#a78bfa` | Accent on dark, links, UI borders |
| Violet 500 | `#8b6ef5` | Gradient midpoint |
| Violet 600 | `#6d4ae0` | Primary buttons on light, focus |
| Violet 700 | `#5a3fd1` | Gradient end, monogram tiles |
| Mark stroke | `#a794ff` / `#8f78e6` | Facet strokes in `icons/icon.svg` |
| Mark gradient | `#9b82f5` → `#5a3fd1` | Bookmark body in the mark |
| Paper | `#f7f5fb` | Light raised surfaces |
| Teal 400 | `#2dd4bf` | Success/positive states only |
| Danger | `#c0392b` light / `#f07171` dark | Destructive actions, unchanged |

The brand guide documents these real values; the extension and viewer are not
forced onto Ink 900 where their existing neutral steps already work.

Rules:

- Violet is for identity and interaction; teal is not a second brand colour.
- Body copy stays neutral (`#d7d3e3` dark, `#1b1726` light).
- Every text/background pair must reach 4.5:1; UI borders and focus rings 3:1.
- The per-note monogram colours in the vault stay as they are; only the
  runtime letter fallback uses violet.

### Type

- Wordmark and headings: **Space Grotesk** (SIL OFL), semibold/bold.
- UI and body: the existing system stack; do not add a runtime font.
- Every line of text in the banner and social preview — wordmark, tagline and
  labels — is converted to outlines and embedded, so the files render
  identically on GitHub, in `rsvg-convert`, and in any browser. The font file
  is not committed.

### Mark usage

- Keep the existing 512-grid mark and its small-size variant.
- Minimum size: 16px for the small variant, 48px for the detailed one.
- Clear space around the mark: at least the width of one bookmark bar.
- Do not place the mark on a light background without the dark tile it already
  carries; the tile is part of the mark.

## Deliverables

### Brand assets — `docs/brand/`

- `banner.svg` — 1600×400 README header: mark, wordmark, tagline, three small
  labels (Chromium extension · Obsidian · Markdown). Deep ink background with
  restrained facet linework taken from the mark.
- `social-preview.svg` and `social-preview.png` — 1280×640, same lockup with
  more breathing room; PNG under 1MB.
- `panel.png` — the real extension panel at 780×600, 2× scale.
- `phone.png` — the viewer at 390px width, 2× scale, composed from the viewer's
  own code and styles.
- `tools/capture-panel.mjs` and `tools/capture-phone.mjs` — the capture
  harnesses. They resolve Playwright from an environment path or a global
  install and fail with instructions when it is missing; they are not part of
  `npm test` and add no `package.json` dependency.
- `README.md` — brand guide: palette table, type, mark usage, clear space,
  voice, asset list, and how to regenerate the assets.

### Extension — `src/library/library.css`

Token-only change; no markup or behaviour changes.

- Light: `--bg #ffffff`, `--fg #1b1726`, `--muted #6b6478`, `--line #e7e2f0`,
  `--accent #6d4ae0`, `--accent-fg #ffffff`, `--surface #f8f6fc`,
  `--hover #f1edf9`.
- Dark: `--bg #14111d`, `--fg #ece9f5`, `--muted #a49db8`, `--line #322b45`,
  `--accent #a78bfa`, `--accent-fg #14101f`, `--surface #1d1829`,
  `--hover #262033`.
- `.favicon-letter` background moves from teal `#0f766e` to violet `#5a3fd1`.

### Viewer — `obsidian/vaultmarks.md` and the live note

1. Copy the live note over the repo copy so both carry the current icon
   fallback, lazy covers, edit-in-new-tab and Markdown-safe writes.
2. Give the block its own dark surface: `dv.container` receives the ink
   background, padding, radius and light text, so the tree, headings and
   status line stay readable on a light Obsidian theme instead of inheriting
   the page colour. This is the only structural change.
3. Replace the `COLORS` object:
   - `cardBg #161226`, `leftPanelBg #100c1e`
   - `border rgba(167, 139, 250, 0.32)`
   - `title #c4b5fd`, `description #d7d3e3`
   - `url #a78bfa`, `domainLabel #a78bfa`
   - `highlight rgba(196, 181, 253, 0.32)`
4. Replace every remaining teal literal (`#5eead4` and
   `rgba(94, 234, 212, …)`) with the matching violet value; the bundled link
   SVG stroke becomes `%23a78bfa`.
5. The runtime letter tile becomes `#5a3fd1` with light text.
6. Copy the recoloured file back to the live vault note; the two files stay
   byte-identical.

### README

Structure, in order:

1. Banner image with alt text "Vaultmarks".
2. `# Vaultmarks` (kept for GitHub/SEO) and the tagline.
3. Badges: Chromium MV3, no server, Obsidian, Markdown.
4. Two-sentence pitch: desktop capture, phone library, plain files.
5. `panel.png` under a short caption.
6. "Two places, one library" — a short desktop/phone split, with `phone.png`.
7. Install, First run, Usage, Data format, Obsidian view, Permissions,
   Storage guarantees, Troubleshooting, Repository layout, Development.
8. Link to `docs/brand/README.md` for the brand guide.

Keep the existing technical content; edit for voice and add the sections above.
No screenshot may show a feature that does not exist.

### Repository metadata

- Description: *A Chromium bookmark extension that saves each bookmark as a
  Markdown note in your Obsidian vault — capture on desktop, read on your
  phone.*
- Topics: `chromium-extension`, `bookmarks`, `obsidian`, `markdown`,
  `dataviewjs`, `local-first`, `bookmark-manager`, `file-system-access`.
- `manifest.json`'s description becomes the same one-liner, so
  `chrome://extensions` stops using the old voice.
- The social preview is uploaded manually in GitHub repo settings from
  `docs/brand/social-preview.png`; GitHub exposes no API for it.
- Apply description and topics with `gh repo edit`. Commit and push the work
  to `main`, matching how this repository has been maintained; sync the live
  extension copy afterwards.

## Screenshot method

- **Panel:** serve the repo locally, open the real `library.html` in Chromium
  through Playwright, and intercept `src/lib/vaultfs.js` with a stub that
  returns a fixed set of notes and collections. Stub only `chrome.storage`
  and the folder layer; all rendering, CSS and interaction code stays real.
  Emulate the dark colour scheme, capture at 780×600, device scale 2. Do not
  add a mock mode to shipped code.
- **Phone:** run the viewer's actual DataviewJS block in a harness with a
  mock `dv` (`pages`, `container`) and `app.vault` for body covers, pointed at
  the same sample notes. Render into a 390px-wide container and capture at 2×
  on the viewer's own dark surface. If the harness cannot render faithfully,
  use a static composition built from the viewer's own card markup and
  `COLORS`; record that fallback in the plan rather than shipping an invented
  layout.
- Both harnesses live in `docs/brand/tools/` and are committed, so the
  screenshots can be regenerated. They document the Playwright path they
  expect and do not become test dependencies.

## Verification

- `npm test` passes (currently 92).
- New `tests/brand.test.js` asserts every README asset exists, the banner and
  social preview dimensions are as specified, the CSS accent tokens are
  present, and the viewer contains no `#5eead4` / `rgba(94, 234, 212` literals.
- Extract and `node --check` the viewer block; both copies remain identical.
- Contrast check for every token pair listed above, including the viewer on a
  light Obsidian page (the block's own dark surface must carry the text).
- Visual check of the banner at 800px wide, the social preview at 640px wide,
  the panel at native size, and the phone shot at 390px.
- Open the viewer block on a white Obsidian page and confirm no heading, tree
  row or status line inherits the page colour.
- Reload the extension and confirm no layout shift in light or dark mode.

## Risks

- **Purple-on-purple contrast.** Mitigated by fixed tokens plus measured
  contrast, and by keeping body copy neutral.
- **Viewer divergence.** The live note is ahead of the repo; syncing first
  prevents shipping a stale viewer with new colours.
- **Screenshots drifting from reality.** The extension shot uses the real page;
  the phone shot uses the viewer's own code. If either falls back to a
  composition, it must reuse the real markup and tokens, not a redesign.
- **Social preview is manual.** The asset is prepared and tested; uploading it
  is a settings action outside the repo.

## Calls made during review

- The viewer paints its own dark surface; it does not rely on the Obsidian
  theme.
- All banner and social-preview text is outlined, not just the wordmark.
- `panel.png` is captured in the dark colour scheme, matching the banner and
  phone shot. Light mode is verified but not used as a README image.
- The capture harnesses are committed in `docs/brand/tools/` with no new
  package dependency; the screenshots stay reproducible.
- Work is committed and pushed to `main`, and `gh repo edit` sets the new
  description and topics, following the repository's existing workflow.
- The brand guide records the real UI and icon values rather than forcing
  every surface onto Ink 900.
- The manifest description is updated to the new one-liner.

## Left to the builder

- Exact facet linework, glow and spacing in the banner and social preview.
- Exact wordmark outline conversion and kerning.
- Sample bookmark set used in the screenshots (real-looking, no private data).
- Caption wording that fits the existing README voice.
- Whether the phone shot includes a device frame (default: no frame, just the
  rounded card stack on the ink background).
