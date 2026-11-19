
```dataviewjs
const pages = dv.pages('"Bookmarks"');

function buildTree(pages) {
    const root = {};

    for (let page of pages) {
        let relativePath = page.file.folder.replace(/^Bookmarks\/?/, "");
        let parts = relativePath ? relativePath.split("/") : [];

        let nodePointer = root;
        for (let i = 0; i < parts.length; i++) {
            let part = parts[i];
            if (!nodePointer[part]) {
                nodePointer[part] = { _files: [], _subfolders: {} };
            }
            if (i === parts.length - 1) {
                nodePointer[part]._files.push(page);
            } else {
                nodePointer = nodePointer[part]._subfolders;
            }
        }

        if (parts.length === 0) {
            if (!root["_rootFiles"]) root["_rootFiles"] = [];
            root["_rootFiles"].push(page);
        }
    }
    return root;
}

function countItems(node) {
    let count = node._files ? node._files.length : 0;
    if (node._subfolders) {
        for (let key in node._subfolders) {
            count += countItems(node._subfolders[key]);
        }
    }
    return count;
}

// Extract clean domain hostname
function getDomain(urlStr) {
    if (!urlStr) return null;
    try {
        let cleanUrl = urlStr.trim();
        if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
            cleanUrl = 'https://' + cleanUrl;
        }
        return new URL(cleanUrl).hostname;
    } catch (e) {
        return null;
    }
}

// Fallback Bookmark SVG Icon encoded as Data URI (last resort, when nothing else loads)
const FALLBACK_ICON = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%235eead4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`;

// Edit (pencil) icon used for the edit button
const EDIT_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>`;

// Trash icon used for the delete button
const TRASH_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;

// Small UI glyphs (all SVG, no emoji)
const SEARCH_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>`;
const FOLDER_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-7.5l-2-2H4a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1Z"></path></svg>`;
const PLUS_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg>`;
const CLOSE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>`;
// Folder disclosure chevron (rotates 90° when the folder is open)
const CHEVRON_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"></path></svg>`;

// --- Responsive (phone) styles ---
// Inline styles cannot hold media queries, so a small stylesheet is added to
// this block. It only targets `.bv-viewer` elements and only under 620px, so
// the desktop layout is unchanged. 16px inputs stop iOS from zooming on focus.
const VIEWER_CSS = `
.bv-viewer { max-width: 100%; }
.bv-viewer * { box-sizing: border-box; }
@media (max-width: 620px) {
  .bv-viewer .bv-search-input,
  .bv-viewer .bv-add-url,
  .bv-viewer .bv-add-select,
  .bv-viewer .bv-add-input { font-size: 16px !important; }

  .bv-viewer .bv-search-input { height: 40px !important; }
  .bv-viewer .bv-round-btn { width: 40px !important; height: 40px !important; }

  .bv-viewer .bv-add-row { gap: 8px !important; }
  .bv-viewer .bv-add-url { flex: 1 1 100% !important; min-width: 0 !important; height: 40px !important; }
  .bv-viewer .bv-add-select { flex: 1 1 120px !important; max-width: none !important; min-width: 0 !important; height: 40px !important; }
  .bv-viewer .bv-add-btn { flex: 0 0 auto !important; height: 40px !important; padding: 0 18px !important; font-size: 15px !important; }
  .bv-viewer .bv-add-input { height: 40px !important; }

  .bv-viewer .bv-folder-summary { padding: 8px 2px !important; min-height: 40px !important; font-size: 0.98em !important; }
  .bv-viewer .bv-folder-body { margin-left: 8px !important; padding-left: 10px !important; }

  .bv-viewer .bv-card-grid { gap: 10px !important; }
  .bv-viewer .bv-card { border-radius: 10px !important; }
  .bv-viewer .bv-thumb { width: 92px !important; height: 92px !important; min-width: 92px !important; margin: 7px !important; padding: 6px !important; }
  .bv-viewer .bv-card-content { padding: 9px 10px 9px 3px !important; gap: 4px !important; }
  .bv-viewer .bv-card-title { font-size: 0.98em !important; line-height: 1.3 !important; }
  .bv-viewer .bv-card-desc { font-size: 0.8em !important; }
  .bv-viewer .bv-card-url { font-size: 0.7em !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; word-break: normal !important; }
  .bv-viewer .bv-card-bottom { gap: 8px !important; }
  .bv-viewer .bv-action-btn { width: 36px !important; height: 36px !important; border-radius: 8px !important; }
}

/* Small phones (iPhone SE width and similar) */
@media (max-width: 380px) {
  .bv-viewer .bv-thumb { width: 72px !important; height: 72px !important; min-width: 72px !important; margin: 6px !important; padding: 5px !important; }
  .bv-viewer .bv-folder-body { margin-left: 8px !important; padding-left: 8px !important; }
  .bv-viewer .bv-card-content { padding: 8px 8px 8px 2px !important; }
  .bv-viewer .bv-card-title { font-size: 0.92em !important; }
  .bv-viewer .bv-card-desc { font-size: 0.76em !important; }
  .bv-viewer .bv-action-btn { width: 34px !important; height: 34px !important; }
}
`;

function injectViewerStyles() {
    if (typeof document === "undefined" || typeof dv === "undefined" || !dv.container) return;
    if (dv.container.classList) dv.container.classList.add("bv-viewer");
    // Replace any previous copy so edits to this block take effect immediately.
    const previous = document.getElementById("bv-viewer-styles");
    if (previous && previous.parentNode) previous.parentNode.removeChild(previous);
    const style = document.createElement("style");
    style.id = "bv-viewer-styles";
    style.textContent = VIEWER_CSS;
    (document.head || document.body).appendChild(style);
}

injectViewerStyles();

// Most notes in this vault keep their cover image in the body (`![](url)`)
// instead of frontmatter, so read it lazily (once per file) and cache it.
const bodyCoverCache = new Map();

function extractBodyCover(text) {
    if (!text) return "";
    const match = text.match(/!\[[^\]]*\]\(\s*<?([^)\s>]+)>?\s*\)/);
    return match ? match[1] : "";
}

function getBodyCover(page) {
    const path = page.file.path;
    if (!bodyCoverCache.has(path)) {
        const promise = (async () => {
            try {
                const file = app.vault.getAbstractFileByPath(path);
                if (!file) return "";
                return extractBodyCover(await app.vault.cachedRead(file));
            } catch (e) {
                return "";
            }
        })();
        bodyCoverCache.set(path, promise);
    }
    return bodyCoverCache.get(path);
}

// Colors for the card design
const COLORS = {
    cardBg: "#0f1e2e",
    leftPanelBg: "#0a1420",
    border: "rgba(94, 234, 212, 0.35)",
    title: "#5eead4",
    description: "#cbd5e1",
    url: "#5eead4",
    domainLabel: "#5eead4",
    highlight: "rgba(94, 234, 212, 0.35)"
};

// Shared style for the small edit/delete buttons on each card
const ACTION_BTN_STYLE = `flex-shrink: 0; background: transparent; border: 1px solid ${COLORS.border}; border-radius: 6px; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: ${COLORS.title}; opacity: 0.85; padding: 0; touch-action: manipulation;`;
const DELETE_ARMED_STYLE = `${ACTION_BTN_STYLE} border-color: #f87171; color: #f87171; background: rgba(248, 113, 113, 0.12);`;
const DELETE_HOVER_STYLE = `${ACTION_BTN_STYLE} border-color: rgba(248, 113, 113, 0.7); color: #f87171; opacity: 1;`;

// Styles for the "+" (add bookmark) button and its inline panel
const ADD_BTN_STYLE = `flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: transparent; border: 1px solid ${COLORS.border}; border-radius: 8px; width: 36px; height: 36px; box-sizing: border-box; cursor: pointer; color: ${COLORS.title}; opacity: 0.85; padding: 0; touch-action: manipulation;`;
const ADD_BTN_ACTIVE_STYLE = `${ADD_BTN_STYLE} opacity: 1; background: rgba(94, 234, 212, 0.12);`;
const CREATOR_STYLE = `display: flex; flex-direction: column; gap: 8px; padding: 12px; margin: 4px 0 10px; border: 1px solid ${COLORS.border}; border-radius: 10px; background: ${COLORS.cardBg};`;
const CREATOR_HIDDEN_STYLE = `display: none;`;
const CREATOR_MANUAL_HIDDEN_STYLE = `display: none; gap: 8px; flex-direction: column;`;
const CREATOR_MANUAL_STYLE = `display: flex; gap: 8px; flex-direction: column;`;

// --- Search helpers ---

function tokenize(term) {
    return term.toLowerCase().split(/\s+/).filter(Boolean);
}

function getSearchableFields(page) {
    const tagsVal = page.tags;
    return {
        title: (page.title || page.file.name || "").toLowerCase(),
        description: (page.description || "").toLowerCase(),
        url: (page.url || "").toLowerCase(),
        domain: (getDomain(page.url) || "").toLowerCase(),
        folder: (page.file && page.file.folder ? page.file.folder : "").toLowerCase(),
        tags: Array.isArray(tagsVal) ? tagsVal.join(" ").toLowerCase() : String(tagsVal || "").toLowerCase()
    };
}

// Returns -1 if any token is missing anywhere (AND logic across words),
// otherwise a relevance score (title matches weigh the most).
function scoreMatch(page, tokens) {
    const f = getSearchableFields(page);
    let score = 0;
    for (const tok of tokens) {
        let tokenScore = 0;
        if (f.title.includes(tok)) tokenScore += f.title.startsWith(tok) ? 6 : 4;
        if (f.domain.includes(tok)) tokenScore += 3;
        if (f.folder.includes(tok)) tokenScore += 2;
        if (f.description.includes(tok)) tokenScore += 2;
        if (f.url.includes(tok)) tokenScore += 1;
        if (f.tags.includes(tok)) tokenScore += 1;
        if (tokenScore === 0) return -1;
        score += tokenScore;
    }
    return score;
}

function filterAndSort(searchTerm) {
    if (!searchTerm) return pages;
    const tokens = tokenize(searchTerm);
    const scored = [];
    for (const p of pages) {
        const s = scoreMatch(p, tokens);
        if (s >= 0) scored.push({ page: p, score: s });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.map(x => x.page);
}

function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function highlightText(text, tokens) {
    const safe = escapeHtml(text || "");
    if (!tokens || tokens.length === 0) return safe;
    const escapedTokens = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter(Boolean);
    if (escapedTokens.length === 0) return safe;
    const re = new RegExp(`(${escapedTokens.join('|')})`, 'gi');
    return safe.replace(re, m => `<mark style="background: ${COLORS.highlight}; color: inherit; border-radius: 3px; padding: 0 1px;">${m}</mark>`);
}

// Three-tier icon fallback: the note's own captured favicon -> Google's favicon
// service (by domain) -> the bundled SVG icon. Nothing ever ends up blank/broken.
function renderFaviconFallback(container, domain, faviconUrl) {
    const googleFavicon = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : null;
    const firstSrc = (faviconUrl && faviconUrl.startsWith('http')) ? faviconUrl : (googleFavicon || FALLBACK_ICON);

    const iconImg = container.createEl("img", {
        attr: {
            src: firstSrc,
            style: "width: 34px; height: 34px; border-radius: 6px; opacity: 0.95;"
        }
    });

    let stage = (firstSrc === googleFavicon) ? "google" : (firstSrc === FALLBACK_ICON ? "fallback" : "own");

    iconImg.onerror = () => {
        if (stage === "own" && googleFavicon) {
            stage = "google";
            iconImg.src = googleFavicon;
        } else {
            stage = "fallback";
            iconImg.onerror = null;
            iconImg.src = FALLBACK_ICON;
            iconImg.setAttribute("style", "width: 26px; height: 26px; opacity: 0.7;");
        }
    };

    if (domain) {
        container.createEl("div", {
            text: domain,
            attr: {
                style: `margin-top: 8px; font-family: var(--font-monospace, monospace); font-size: 0.68em; color: ${COLORS.domainLabel}; opacity: 0.6; text-align: center; padding: 0 6px; word-break: break-all;`
            }
        });
    }
}

// Renders a cover image that fills the left panel, falling back to the
// favicon/domain treatment when the image fails to load.
function renderCoverImage(panel, src, domain, favicon) {
    const img = panel.createEl("img", {
        attr: { src: src, style: "width: 100%; height: 100%; object-fit: cover; margin: -8px;" }
    });
    img.onerror = () => {
        img.onerror = null;
        panel.empty();
        renderFaviconFallback(panel, domain, favicon);
    };
}

// Opens the underlying bookmark note in Obsidian so it can be edited directly
function openNoteForEditing(page) {
    const file = app.vault.getAbstractFileByPath(page.file.path);
    if (file) {
        const leaf = app.workspace.getLeaf(false);
        leaf.openFile(file);
    }
}

// Moves the note to Obsidian's configured trash (or the system trash when
// that is the user's setting) and resolves to true on success.
async function trashNote(page) {
    const file = app.vault.getAbstractFileByPath(page.file.path);
    if (!file) return false;
    try {
        if (app.fileManager && typeof app.fileManager.trashFile === "function") {
            await app.fileManager.trashFile(file);
        } else {
            await app.vault.trash(file, true);
        }
        bodyCoverCache.delete(page.file.path);
        return true;
    } catch (e) {
        console.error(`Bookmark Viewer: could not delete "${page.file.path}"`, e);
        return false;
    }
}

// Keeps the in-memory page list in step with a deletion; Dataview will fully
// refresh the block as well, this just avoids showing a stale card meanwhile.
function forgetPage(page) {
    try {
        const index = pages.indexOf(page);
        if (index !== -1 && typeof pages.splice === "function") pages.splice(index, 1);
    } catch (e) {
        // Dataview's DataArray may be read-only; ignoring is harmless.
    }
}

function renderCards(files, container, tokens) {
    tokens = tokens || [];
    const cardGrid = container.createEl("div", {
        cls: "bv-card-grid",
        attr: { style: "display: flex; flex-direction: column; gap: 14px; margin-top: 8px; margin-bottom: 12px;" }
    });

    for (let page of files) {
        const title = page.title || page.file.name;
        const url = page.url || "#";
        const description = page.description || "";
        const image = page.og_image || page.image || page.thumbnail || page.cover || page.banner || "";
        const favicon = page.favicon || "";
        const domain = getDomain(url);

        const card = cardGrid.createEl("div", {
            cls: "bv-card",
            attr: {
                style: `
                    display: flex;
                    background: ${COLORS.cardBg};
                    border: 1px solid ${COLORS.border};
                    border-radius: 12px;
                    overflow: hidden;
                    min-height: 92px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.35);
                `
            }
        });

        // Left panel: fixed square thumbnail (frontmatter or body image if present, otherwise favicon + domain label)
        const leftPanel = card.createEl("div", {
            cls: "bv-thumb",
            attr: {
                style: `width: 120px; height: 120px; min-width: 120px; align-self: center; background: ${COLORS.leftPanelBg}; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; padding: 8px; border-radius: 8px; margin: 8px;`
            }
        });

        if (image && typeof image === 'string' && image.startsWith('http')) {
            renderCoverImage(leftPanel, image, domain, favicon);
        } else {
            renderFaviconFallback(leftPanel, domain, favicon);
            // No frontmatter cover: use the body image when the note has one.
            getBodyCover(page).then((cover) => {
                if (cover && leftPanel.isConnected) {
                    leftPanel.empty();
                    renderCoverImage(leftPanel, cover, domain, favicon);
                }
            });
        }

        // Right side: content
        const content = card.createEl("div", {
            cls: "bv-card-content",
            attr: { style: "padding: 14px 18px 14px 4px; display: flex; flex-direction: column; justify-content: center; gap: 6px; flex-grow: 1; min-width: 0;" }
        });

        // Title: clamped to 2 lines, with search-term highlighting
        const titleEl = content.createEl("a", {
            href: url,
            cls: "external-link bv-card-title",
            attr: {
                style: `font-weight: bold; font-size: 1.05em; color: ${COLORS.title}; text-decoration: none; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis;`
            }
        });
        titleEl.innerHTML = highlightText(title, tokens);

        // Description: clamped to 2 lines, with search-term highlighting
        if (description) {
            const descEl = content.createEl("p", {
                cls: "bv-card-desc",
                attr: { style: `margin: 0; font-size: 0.85em; color: ${COLORS.description}; opacity: 0.9; line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis;` }
            });
            descEl.innerHTML = highlightText(description, tokens);
        }

        // Bottom row: URL (no limit, wraps freely) + edit/delete buttons
        const bottomRow = content.createEl("div", {
            cls: "bv-card-bottom",
            attr: { style: "display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 2px;" }
        });

        bottomRow.createEl("span", {
            text: url,
            cls: "bv-card-url",
            attr: { style: `font-size: 0.78em; color: ${COLORS.url}; opacity: 0.55; word-break: break-all; flex: 1; min-width: 0;` }
        });

        const actions = bottomRow.createEl("div", {
            cls: "bv-card-actions",
            attr: { style: "display: flex; align-items: center; gap: 6px; flex-shrink: 0;" }
        });

        const editBtn = actions.createEl("button", {
            cls: "bv-action-btn",
            attr: {
                style: ACTION_BTN_STYLE,
                title: "Edit this bookmark note"
            }
        });
        editBtn.innerHTML = EDIT_ICON_SVG;
        editBtn.onclick = (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            openNoteForEditing(page);
        };

        // Delete needs a second click within 3 seconds before the note is
        // trashed, so a stray click can never remove a bookmark.
        const deleteBtn = actions.createEl("button", {
            cls: "bv-action-btn",
            attr: {
                style: ACTION_BTN_STYLE,
                title: "Delete this bookmark note"
            }
        });
        deleteBtn.innerHTML = TRASH_ICON_SVG;

        let armed = false;
        let armTimer = null;
        deleteBtn.addEventListener("mouseenter", () => {
            if (!armed) deleteBtn.setAttribute("style", DELETE_HOVER_STYLE);
        });
        deleteBtn.addEventListener("mouseleave", () => {
            if (!armed) deleteBtn.setAttribute("style", ACTION_BTN_STYLE);
        });

        const disarm = () => {
            armed = false;
            clearTimeout(armTimer);
            deleteBtn.setAttribute("style", ACTION_BTN_STYLE);
            deleteBtn.setAttribute("title", "Delete this bookmark note");
        };

        deleteBtn.onclick = async (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            if (!armed) {
                armed = true;
                deleteBtn.setAttribute("style", DELETE_ARMED_STYLE);
                deleteBtn.setAttribute("title", "Click again to delete (moves the note to trash)");
                armTimer = setTimeout(disarm, 3000);
                return;
            }
            clearTimeout(armTimer);
            const deleted = await trashNote(page);
            if (deleted) {
                forgetPage(page);
                card.remove();
            } else {
                disarm();
            }
        };
    }
}

function renderTree(tree, parentEl, forceOpen, tokens) {
    const folderNames = Object.keys(tree)
        .filter(name => name !== "_rootFiles")
        .sort((a, b) => a.localeCompare(b));

    for (const folderName of folderNames) {
        const node = tree[folderName];
        const totalCount = countItems(node);

        const details = parentEl.createEl("details", {
            attr: { style: "margin: 3px 0;" }
        });

        if (forceOpen) {
            details.setAttribute("open", "");
        }

        // The summary is a full-width header row: chevron, folder, name, count.
        const summaryStyle = `display: flex; align-items: center; gap: 7px; list-style: none; cursor: pointer; padding: 4px 2px; color: ${COLORS.title}; font-weight: 600; font-size: 0.94em; user-select: none; touch-action: manipulation; -webkit-tap-highlight-color: transparent;`;
        const summary = details.createEl("summary", {
            cls: "bv-folder-summary",
            attr: { style: summaryStyle }
        });

        const chevronFor = (open) => `display: inline-flex; flex-shrink: 0; align-items: center; color: ${COLORS.title}; opacity: 0.8; transition: transform 120ms ease; transform: rotate(${open ? 90 : 0}deg);`;
        const chevron = summary.createEl("span", { attr: { style: chevronFor(!!forceOpen) } });
        chevron.innerHTML = CHEVRON_ICON_SVG;

        const folderIcon = summary.createEl("span", {
            attr: { style: `display: inline-flex; flex-shrink: 0; align-items: center; color: ${COLORS.title}; opacity: 0.85;` }
        });
        folderIcon.innerHTML = FOLDER_ICON_SVG;

        summary.createEl("span", {
            text: folderName,
            attr: { style: "min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" }
        });

        summary.createEl("span", {
            text: String(totalCount),
            attr: { style: `flex-shrink: 0; margin-left: 2px; padding: 1px 7px; border-radius: 999px; background: rgba(94, 234, 212, 0.14); color: ${COLORS.title}; font-size: 0.78em; font-weight: 500; opacity: 0.9;` }
        });

        details.addEventListener("toggle", () => {
            chevron.setAttribute("style", chevronFor(details.open));
        });

        // Children live inside an indented panel with a guide line, so each
        // nesting level is visibly one step deeper than its parent.
        const body = details.createEl("div", {
            cls: "bv-folder-body",
            attr: { style: "margin: 0 0 6px 8px; padding-left: 12px; border-left: 1px solid rgba(94, 234, 212, 0.25);" }
        });

        if (node._subfolders && Object.keys(node._subfolders).length > 0) {
            renderTree(node._subfolders, body, forceOpen, tokens);
        }

        if (node._files && node._files.length > 0) {
            renderCards(node._files, body, tokens);
        }
    }
}

// --- Fast add: create a bookmark note from a pasted link ---

// Notes created since this block rendered (Dataview's page list is a snapshot)
const addedThisSession = new Map();

function normalizeUrl(raw) {
    let value = String(raw || "").trim();
    if (!value) return null;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = "https://" + value;
    try {
        const parsed = new URL(value);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
        return parsed.href;
    } catch (e) {
        return null;
    }
}

function guessTitleFromUrl(url) {
    try {
        const parsed = new URL(url);
        const segment = parsed.pathname.split("/").filter(Boolean).pop() || "";
        const cleaned = decodeURIComponent(segment)
            .replace(/\.(html?|php|aspx?|jsp)$/i, "")
            .replace(/[-_+]+/g, " ")
            .trim();
        return cleaned || parsed.hostname.replace(/^www\./, "");
    } catch (e) {
        return url;
    }
}

function decodeEntities(value) {
    return String(value || "")
        .replace(/&#x([0-9a-f]+);/gi, (m, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (m, dec) => String.fromCodePoint(parseInt(dec, 10)))
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&");
}

function parseHtmlAttributes(tagText) {
    const attrs = {};
    const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    let match;
    while ((match = re.exec(tagText))) {
        attrs[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
    }
    return attrs;
}

// Pulls title, description, cover and favicon out of a page's HTML.
function extractPageMeta(html, pageUrl) {
    const metaTags = [];
    const metaRe = /<meta\b[^>]*>/gi;
    let match;
    while ((match = metaRe.exec(html))) metaTags.push(parseHtmlAttributes(match[0]));

    const metaValue = (...keys) => {
        for (const key of keys) {
            const tag = metaTags.find((t) => (t.property || t.name || "").toLowerCase() === key);
            if (tag && tag.content) return tag.content.trim();
        }
        return "";
    };

    const absolute = (value) => {
        if (!value) return "";
        try {
            return new URL(value, pageUrl).href;
        } catch (e) {
            return "";
        }
    };

    let title = metaValue("og:title", "twitter:title");
    if (!title) {
        const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
        title = titleMatch ? decodeEntities(titleMatch[1]).replace(/\s+/g, " ").trim() : "";
    }

    const description = metaValue("og:description", "description", "twitter:description")
        .replace(/\s+/g, " ")
        .trim();

    const image = absolute(metaValue("og:image", "og:image:url", "twitter:image", "twitter:image:src"));

    let favicon = "";
    const linkRe = /<link\b[^>]*>/gi;
    while ((match = linkRe.exec(html))) {
        const attrs = parseHtmlAttributes(match[0]);
        const rel = (attrs.rel || "").toLowerCase();
        if (rel.split(/\s+/).includes("icon") || rel === "apple-touch-icon") {
            favicon = absolute(attrs.href);
            if (favicon) break;
        }
    }

    return { title, description, image, favicon };
}

async function fetchPageMeta(url) {
    if (typeof requestUrl !== "function") throw new Error("requestUrl is not available");
    const response = await requestUrl({
        url,
        headers: { Accept: "text/html,application/xhtml+xml" }
    });
    if (!response || (response.status && response.status >= 400)) {
        throw new Error(`HTTP ${response && response.status}`);
    }
    const html = response.text || "";
    if (!html) throw new Error("Empty response");
    return extractPageMeta(html, url);
}

function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((resolve, reject) => setTimeout(() => reject(new Error("Request timed out")), ms))
    ]);
}

function sanitizeFileName(name) {
    return String(name || "")
        .replace(/[\\/:*?"<>|#^\[\]]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^\.+/, "")
        .slice(0, 100)
        .trim() || "Bookmark";
}

function uniqueNotePath(folder, baseName) {
    let candidate = `${folder}/${baseName}.md`;
    let counter = 2;
    while (app.vault.getAbstractFileByPath(candidate)) {
        candidate = `${folder}/${baseName} ${counter}.md`;
        counter += 1;
    }
    return candidate;
}

function findExistingBookmark(url) {
    const key = url.replace(/\/+$/, "").toLowerCase();
    if (addedThisSession.has(key)) return addedThisSession.get(key);
    for (const page of pages) {
        const pageUrl = typeof page.url === "string" ? page.url.replace(/\/+$/, "").toLowerCase() : "";
        if (pageUrl && pageUrl === key) {
            return { title: page.title || page.file.name, folder: page.file.folder };
        }
    }
    return null;
}

async function createBookmarkNote({ url, title, description, image, favicon, folder }) {
    const finalTitle = (title || guessTitleFromUrl(url)).trim() || url;
    const path = uniqueNotePath(folder || "Bookmarks", sanitizeFileName(finalTitle));
    const now = new Date();
    const created = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const lines = ["---", `title: ${JSON.stringify(finalTitle)}`, `url: ${JSON.stringify(url)}`, `created: ${created}`];
    if (description) lines.push(`description: ${JSON.stringify(description)}`);
    if (image) lines.push(`image: ${JSON.stringify(image)}`);
    if (favicon) lines.push(`favicon: ${JSON.stringify(favicon)}`);
    lines.push("tags:", '  - "bookmarks"', "---", "");

    if (image) lines.push(`![](${image})`, "");
    if (description) lines.push(description, "");
    lines.push(`[Open original ↗](${url})`, "");

    await app.vault.create(path, lines.join("\n"));
    return { path, title: finalTitle };
}

// --- Search bar ---
const searchContainer = dv.container.createEl("div", {
    attr: { style: "display: flex; align-items: center; gap: 8px; margin-bottom: 4px;" }
});

const searchBox = searchContainer.createEl("div", {
    attr: { style: "position: relative; flex: 1; display: flex; align-items: center; min-width: 0;" }
});

const searchIcon = searchBox.createEl("span", {
    attr: { style: `position: absolute; left: 13px; top: 50%; transform: translateY(-50%); display: flex; color: ${COLORS.title}; opacity: 0.75; pointer-events: none;` }
});
searchIcon.innerHTML = SEARCH_ICON_SVG;

const searchInput = searchBox.createEl("input", {
    cls: "bv-search-input",
    attr: {
        type: "text",
        placeholder: "Search bookmarks (title, description, URL, tags)...",
        style: `flex: 1; width: 100%; height: 36px; box-sizing: border-box; padding: 0 14px 0 38px; border-radius: 8px; border: 1px solid ${COLORS.border}; background: ${COLORS.cardBg}; color: ${COLORS.description}; font-size: 0.95em; outline: none;`
    }
});

const addBtn = searchContainer.createEl("button", {
    cls: "bv-round-btn",
    attr: {
        style: ADD_BTN_STYLE,
        title: "Add a bookmark from a link"
    }
});
addBtn.innerHTML = PLUS_ICON_SVG;
addBtn.addEventListener("mouseenter", () => addBtn.setAttribute("style", ADD_BTN_ACTIVE_STYLE));
addBtn.addEventListener("mouseleave", () => addBtn.setAttribute("style", ADD_BTN_STYLE));

// Inline "fast add" panel: paste a link, press Enter, the note is created.
const creatorPanel = dv.container.createEl("div", {
    cls: "bv-add-panel",
    attr: { style: CREATOR_HIDDEN_STYLE }
});

const creatorRow = creatorPanel.createEl("div", {
    cls: "bv-add-row",
    attr: { style: "display: flex; align-items: center; gap: 8px; flex-wrap: wrap;" }
});

const newUrlInput = creatorRow.createEl("input", {
    cls: "bv-add-url",
    attr: {
        type: "text",
        placeholder: "Paste a link and press Enter",
        title: "Title, description, cover and favicon are fetched automatically",
        style: `flex: 1 1 240px; min-width: 200px; height: 36px; box-sizing: border-box; padding: 0 12px; border-radius: 8px; border: 1px solid ${COLORS.border}; background: ${COLORS.leftPanelBg}; color: ${COLORS.description}; font-size: 0.92em; outline: none;`
    }
});

const folderSelect = creatorRow.createEl("select", {
    cls: "bv-add-select",
    attr: {
        style: `flex: 0 1 auto; min-width: 150px; max-width: 220px; height: 36px; box-sizing: border-box; padding: 0 30px 0 10px; border-radius: 8px; border: 1px solid ${COLORS.border}; background-color: ${COLORS.leftPanelBg}; background-image: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMiIgaGVpZ2h0PSIxMiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM1ZWVhZDQiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJtNiA5IDYgNiA2LTYiLz48L3N2Zz4="); background-repeat: no-repeat; background-position: right 9px center; appearance: none; -webkit-appearance: none; color: ${COLORS.description}; font-size: 0.9em; font-family: inherit; outline: none;`,
        title: "Collection for the new bookmark"
    }
});

const folderSet = new Set(["Bookmarks"]);
for (const page of pages) {
    if (page.file && page.file.folder) folderSet.add(page.file.folder);
}
for (const folder of Array.from(folderSet).sort((a, b) => a.localeCompare(b))) {
    folderSelect.createEl("option", {
        text: folder === "Bookmarks" ? "Bookmarks (root)" : folder.replace(/^Bookmarks\//, ""),
        attr: { value: folder }
    });
}

const createBtn = creatorRow.createEl("button", {
    cls: "bv-add-btn",
    text: "Add",
    attr: {
        style: `flex-shrink: 0; height: 36px; box-sizing: border-box; padding: 0 16px; border-radius: 8px; border: 1px solid ${COLORS.border}; background: rgba(94, 234, 212, 0.12); color: ${COLORS.title}; cursor: pointer; font-size: 0.9em; touch-action: manipulation;`,
        title: "Fetch the page and create the note"
    }
});

const cancelBtn = creatorRow.createEl("button", {
    cls: "bv-round-btn",
    attr: {
        style: `flex-shrink: 0; display: flex; align-items: center; justify-content: center; height: 36px; width: 36px; box-sizing: border-box; background: transparent; border: 1px solid ${COLORS.border}; border-radius: 8px; cursor: pointer; color: ${COLORS.title}; opacity: 0.85; padding: 0; touch-action: manipulation;`,
        title: "Close"
    }
});
cancelBtn.innerHTML = CLOSE_ICON_SVG;

// Shown only when the page cannot be fetched (offline/blocked): a small
// "query" so the bookmark can still be saved by hand.
const manualRow = creatorPanel.createEl("div", {
    attr: { style: CREATOR_MANUAL_HIDDEN_STYLE }
});

const newTitleInput = manualRow.createEl("input", {
    cls: "bv-add-input",
    attr: {
        type: "text",
        placeholder: "Title",
        style: `height: 36px; box-sizing: border-box; padding: 0 12px; border-radius: 8px; border: 1px solid ${COLORS.border}; background: ${COLORS.leftPanelBg}; color: ${COLORS.description}; font-size: 0.92em; outline: none;`
    }
});

const newDescInput = manualRow.createEl("input", {
    cls: "bv-add-input",
    attr: {
        type: "text",
        placeholder: "Description (optional)",
        style: `height: 36px; box-sizing: border-box; padding: 0 12px; border-radius: 8px; border: 1px solid ${COLORS.border}; background: ${COLORS.leftPanelBg}; color: ${COLORS.description}; font-size: 0.92em; outline: none;`
    }
});

const createStatus = creatorPanel.createEl("div", {
    attr: { style: `font-size: 0.78em; color: ${COLORS.description}; opacity: 0.75; min-height: 1em;` }
});

let creatorOpen = false;
let manualMode = false;
let creating = false;
let pendingUrl = "";
let createRequestId = 0;

function setCreateStatus(text, isError) {
    createStatus.setText(text || "");
    createStatus.setAttribute("style", `font-size: 0.78em; min-height: 1em; color: ${isError ? "#f87171" : COLORS.description}; opacity: ${isError ? "1" : "0.75"};`);
}

function resetCreator() {
    manualMode = false;
    pendingUrl = "";
    creating = false;
    newUrlInput.value = "";
    newTitleInput.value = "";
    newDescInput.value = "";
    manualRow.setAttribute("style", CREATOR_MANUAL_HIDDEN_STYLE);
    createBtn.setText("Add");
    setCreateStatus("");
}

function setCreatorOpen(open) {
    creatorOpen = open;
    createRequestId += 1; // invalidates any in-flight fetch (cancel)
    creatorPanel.setAttribute("style", open ? CREATOR_STYLE : CREATOR_HIDDEN_STYLE);
    resetCreator();
    if (open) newUrlInput.focus();
}

function enterManualMode(url, message) {
    pendingUrl = url;
    manualMode = true;
    newTitleInput.value = guessTitleFromUrl(url);
    manualRow.setAttribute("style", CREATOR_MANUAL_STYLE);
    createBtn.setText("Save");
    setCreateStatus(message, true);
    newTitleInput.focus();
}

async function finishCreate(meta) {
    const folder = folderSelect.value || "Bookmarks";
    creating = true;
    createBtn.setText("Saving…");
    try {
        const note = await createBookmarkNote({ ...meta, folder });
        addedThisSession.set(meta.url.replace(/\/+$/, "").toLowerCase(), { title: note.title, folder });
        resetCreator();
        setCreateStatus(`Saved “${note.title}”.`);
        newUrlInput.focus();
    } catch (e) {
        console.error("Bookmark Viewer: could not create the note", e);
        creating = false;
        setCreateStatus(`Could not save the note: ${e.message || e}`, true);
    }
}

async function submitNewBookmark() {
    if (creating) return;

    if (manualMode) {
        const url = normalizeUrl(newUrlInput.value.trim()) || pendingUrl;
        if (!url) {
            setCreateStatus("That does not look like a valid http(s) link.", true);
            return;
        }
        const duplicate = findExistingBookmark(url);
        if (duplicate) {
            setCreateStatus(`Already saved as “${duplicate.title || "a bookmark"}”.`, true);
            return;
        }
        await finishCreate({
            url,
            title: newTitleInput.value.trim() || guessTitleFromUrl(url),
            description: newDescInput.value.trim(),
            image: "",
            favicon: ""
        });
        return;
    }

    const raw = newUrlInput.value.trim();
    if (!raw) {
        setCreateStatus("Paste a link first.", true);
        newUrlInput.focus();
        return;
    }

    const url = normalizeUrl(raw);
    if (!url) {
        setCreateStatus("That does not look like a valid http(s) link.", true);
        return;
    }

    const duplicate = findExistingBookmark(url);
    if (duplicate) {
        setCreateStatus(`Already saved as “${duplicate.title || "a bookmark"}”.`, true);
        return;
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
        enterManualMode(url, "You are offline. Check the title, then press Save.");
        return;
    }

    creating = true;
    const requestId = ++createRequestId;
    createBtn.setText("Fetching…");
    setCreateStatus("Fetching title, description and cover…");
    try {
        const meta = await withTimeout(fetchPageMeta(url), 12000);
        if (requestId !== createRequestId) return;
        await finishCreate({ url, ...meta });
    } catch (e) {
        if (requestId !== createRequestId) return;
        creating = false;
        enterManualMode(url, "Could not reach the page (offline or blocked). Check the title, then press Save.");
    }
}

function handleCreatorKeys(e) {
    if (e.key === "Enter") {
        e.preventDefault();
        submitNewBookmark();
    } else if (e.key === "Escape") {
        e.preventDefault();
        setCreatorOpen(false);
    }
}

newUrlInput.addEventListener("keydown", handleCreatorKeys);
newTitleInput.addEventListener("keydown", handleCreatorKeys);
newDescInput.addEventListener("keydown", handleCreatorKeys);
addBtn.onclick = () => setCreatorOpen(!creatorOpen);
createBtn.onclick = submitNewBookmark;
cancelBtn.onclick = () => setCreatorOpen(false);

const summaryEl = dv.container.createEl("div", {
    cls: "bv-status",
    attr: { style: `font-size: 0.78em; color: ${COLORS.description}; opacity: 0.6; margin-bottom: 10px; min-height: 1em;` }
});

const resultsContainer = dv.container.createEl("div", { cls: "bv-results" });

function renderAll(searchTerm) {
    resultsContainer.empty();

    const filtered = filterAndSort(searchTerm);
    const tokens = searchTerm ? tokenize(searchTerm) : [];

    if (searchTerm) {
        summaryEl.setText(`${filtered.length} bookmark${filtered.length === 1 ? '' : 's'} found for "${searchTerm}"`);
    } else {
        summaryEl.setText("");
    }

    if (searchTerm && filtered.length === 0) {
        resultsContainer.createEl("div", {
            text: `No bookmarks match "${searchTerm}"`,
            attr: { style: `padding: 16px; color: ${COLORS.description}; opacity: 0.7; font-size: 0.9em;` }
        });
        return;
    }

    const tree = buildTree(filtered);
    renderTree(tree, resultsContainer, !!searchTerm, tokens);

    if (tree._rootFiles && tree._rootFiles.length > 0) {
        renderCards(tree._rootFiles, resultsContainer, tokens);
    }
}

let debounceTimer = null;
searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        renderAll(searchInput.value.trim());
    }, 120);
});

searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        searchInput.value = "";
        renderAll("");
        searchInput.blur();
    }
});

// Initial render (unfiltered, folders collapsed as usual)
renderAll("");
```