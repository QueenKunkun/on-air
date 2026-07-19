---
name: OnAir UI
description: >
  Use when discussing OnAir preview page UI: CSS variables, theme system, TOC
  styling, banner controls, resizer, font size controls, scrollbar design, layout
  rules. Also use when modifying page.css, markdown-page.html, or html-snippet.html.
compatibility: opencode
---

# OnAir UI Design System

## General Principles

These principles come from recurring bugs in this project. Always follow them.

### 1. Check both themes

Every UI addition or change must be verified in light AND dark mode. Dark mode colors are NOT inverted from light — each has an explicit CSS variable value. Never use hardcoded colors; always use `var(--*)`.

### 2. Homologous elements share one style

If vertical scrollbar is 16px, horizontal must also be 16px (`height` on `::-webkit-scrollbar`). If buttons have 26px height, all banner controls (select, input) must also be 26px. Don't let native defaults slip in.

### 3. Text needs breathing room

Content near a scrollbar needs explicit `padding-right` — the scrollbar itself doesn't create space. Without it, text sits flush against the scrollbar, which looks cramped. When adding new container elements near the right edge, always add `padding-right`.

### 4. Interactive elements must be visible

Anything clickable (splitters, resizers, toggle handles) needs a visible default state. `background: transparent` hides it. Show it with `var(--border)` or similar subtle color, then enhance on hover. Users won't discover invisible controls.

### 5. Inherit parent background in composite controls

When placing a control inside another container (e.g., an `<input>` inside the banner), use `background: transparent` to inherit the parent's background. Using a different CSS variable (`--fm-bg`, `--bg`) will create a color mismatch when the parent has a non-standard background (`--bnr-bg`).

### 6. Custom scrollbar transparent border = visible gap

`::-webkit-scrollbar-thumb` with `border: Npx solid transparent` + `background-clip: content-box` creates Npx of invisible area on each side of the thumb. This looks like a gap between the scrollbar and adjacent elements (e.g., resizer). Keep transparent border small (2px max).

### 7. Native form controls need explicit theming

`<select>`, `<option>`, `<input type="number">` all have native OS chrome that ignores CSS variables. Always override:
- `select` → custom dropdown arrow via SVG `background-image`
- `option` → explicit `background: var(--bg); color: var(--text);`
- `input[type=number]` → hide spinner via `-moz-appearance:textfield` + `::-webkit-inner-spin-button { -webkit-appearance:none }`

### 8. Interactions must not cause layout jumps

Any hover/active/focus transition that changes `width`, `height`, `padding`, `margin`, or `border-width` causes a layout shift (element jumps, adjacent content reflows). This looks cheap and disorients the user.

**Bad:** `:hover { width: 4px; }` — pushes adjacent content sideways.  
**Good:** `:hover { background: var(--link-c); }` — color-only, no reflow.

Allowed: `opacity`, `background`, `color`, `transform: scale` (scales from center, no reflow), `box-shadow`.

**Intentional reflows (font-size / zoom) need scroll anchoring.** Changing the content font size necessarily reflows the whole document, so the saved pixel scroll offset lands on different content and the passage the user was reading jumps away. Native CSS `overflow-anchor` does *not* compensate for a global font-size change. The standard fix: before the change, pick the element currently at the top of the viewport (first child whose `getBoundingClientRect().bottom > 0`) and record its `top`; after the change, add the element's new `top` delta to `scrollingElement.scrollTop`. `setFs` in `markdown-page.html` wraps its mutation in this `withScrollAnchor` helper. (Ratio-based `scrollTop/scrollHeight` restore drifts because images and code blocks are px-sized and don't scale with the font.)

### 9. Text content must degrade gracefully on small viewports

Status text (e.g., banner messages, connection indicators) should use an `icon + text` split in the HTML. On narrow viewports the text can be hidden with `@media` + `display:none`, while the icon remains. Always pair this with a `title` attribute on the container so users can hover to see the full status.

**Pattern:**
```html
<span id="statusTxt" title="Connected, live preview active…">
  <span class="status-icon">🔌</span>
  <span class="status-msg">Connected, live preview active…</span>
</span>
```
```css
@media (max-width: 800px) { .status-msg { display: none; } }
```
```js
// When updating status, keep icon + msg + title in sync:
iconEl.textContent = '🔌';
msgEl.textContent = 'Connected, live preview active…';
containerEl.title = 'Connected, live preview active…';
```

This applies to any status element, not just the banner. The `800px` breakpoint may differ per component (the HTML-snippet banner uses `640px`).

## Theme System

3 states, controlled by CSS variables:

| State | Selector |
|---|---|
| Auto (follows OS) | `:root` + `@media (prefers-color-scheme: dark)` |
| Force dark | `.force-dark` (on `<html>`) |
| Force light | `.force-light` (on `<html>`) |

Preference saved to `localStorage('onair-theme')`. Values: `auto`, `dark`, `light`.

### CSS Variables — Light

```
--bg:#fff                    --text:#1f2328
--pre-bg:#f6f8fa            --border:#d8dee4
--quote-c:#59636e           --link-c:#0969da
--bnr-bg:#ddf4ff            --bnr-c:#0969da
--bnr-off-bg:#fff1e5        --bnr-off-c:#bc4c00
--btn-border:#b3d2f0        --btn-c:#0969da
--btn-hover-bg:#b3d2f0      --btn-on-bg:#0969da
--btn-on-c:#fff              --btn-on-border:#0969da
--fm-bg:#f6f8fa              --fm-border:#d8dee4
--sb-thumb:#d0d7de           --sb-thumb-hover:#adb5bd
--mark-bg:#fff1a8
```

### CSS Variables — Dark

```
--bg:#121314                 --text:#bbbebf
--pre-bg:#242526             --border:#2a2b2c
--quote-c:#858889            --link-c:#48a0c7
--bnr-bg:#1e1e1e             --bnr-c:#e0e0e0
--bnr-off-bg:#3a1a1a         --bnr-off-c:#e0a060
--btn-border:#505050         --btn-c:#e0e0e0
--btn-hover-bg:#3c3c3c       --btn-on-bg:#1f6feb
--btn-on-c:#fff               --btn-on-border:#1f6feb
--fm-bg:#242526               --fm-border:#2a2b2c
--sb-thumb:#4a4d4f            --sb-thumb-hover:#6a6d6f
--mark-bg:#4d4526
```

Highlight.js syntax colors are also themed (see `page.css` `--hljs-*` to `--h-builtin`).

## Page Layout

```css
body       { margin:0; font:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; background:var(--bg); color:var(--text); }
#wrapper   { display:flex; max-width:1440px; margin:0 auto; padding:0 24px; }
#toc       { width:380px; flex-shrink:0; position:sticky; top:38px; align-self:flex-start; max-height:calc(100vh - 46px); overflow:auto; padding:32px 0 24px 6px; box-sizing:border-box; font-size:14px; line-height:1.5; }
.markdown-body { flex:1; min-width:0; padding:32px 0 80px 24px; line-height:1.65; }
```

## TOC

### Scrollbar

All custom scrollbars share one rule set, sized by the `--sb-w` variable (default `16px`, user-adjustable — see banner control). Width is `var(--sb-w, 16px)` for both `width` and `height` so horizontal and vertical bars stay homologous.

```css
.onair-md::-webkit-scrollbar, .onair-md ::-webkit-scrollbar, #toc-list::-webkit-scrollbar, #toc-related::-webkit-scrollbar { width:var(--sb-w,16px); height:var(--sb-w,16px); }
… -track  { background:transparent; }
… -thumb  { background:var(--sb-thumb); border-radius:6px; border:2px solid transparent; background-clip:content-box; }
… -thumb:hover { background:var(--sb-thumb-hover); … }
… -corner { background:transparent; }
```

**Minimum thumb size (VSCode-style).** The thumb has `min-height:40px; min-width:40px` so it stays grabbable on long documents / wide code blocks, where WebKit would otherwise shrink it to a sliver. WebKit clamps to the track length for short scroll areas, so small containers are unaffected.

**Never reuse `--border` for the thumb.** In dark mode `--border` (`#2a2b2c`) is almost identical to `--pre-bg` (`#242526`), so a thumb tinted with `--border` disappears on code blocks. The thumb has its own `--sb-thumb`/`--sb-thumb-hover` colors, chosen to stand out against both `--bg` and `--pre-bg`.

**Scoping — critical.** `page.css` is shared by both templates. The markdown selectors are scoped to `.onair-md` (a class set on `<html>` in `markdown-page.html` only), and `#toc-list`/`#toc-related` cover the TOC panels in both templates. This deliberately covers the markdown document scrollbar, code blocks (`pre`), and TOC — but **never** the user's own page in the HTML-snippet preview (its root/body/`pre` scrollbars stay native). Never use a bare `::-webkit-scrollbar` in this file.

**Always define `-corner`.** Where a vertical and horizontal scrollbar meet (e.g. `#toc-list` with wide links, or a code block that scrolls both ways) WebKit draws a separate `::-webkit-scrollbar-corner`. Without a rule it falls back to the browser default (white) — glaring in dark mode. Style it `background:transparent` (shows the element's `var(--bg)`).

### List & Links

- `#toc ul { list-style:none; padding:0; margin:0; }`
- `#toc li { margin:1px 0; }`
- `#toc > ul { padding-right:28px; }` — gap between text and scrollbar
- `#toc ul ul { padding-left:14px; }` — nested heading indent
- `#toc ul ul.c { display:none; }` — collapsed state

### Link (`#toc a`)

```
flex:1 1 0; min-width:max-content;
white-space:nowrap; overflow:visible;
display:block; padding:3px 6px; border-radius:4px;
color:var(--text); text-decoration:none;
```
- `min-width:max-content` — short links flex-grow to fill row, long links push TOC wider (horizontal scrollbar).
- On hover: `background:var(--pre-bg); color:var(--link-c);`

### Row structure

```
.r { display:flex; align-items:center; gap:1px; }
  .t (toggle button) or .s (spacer, 16px)  — before the link
  a (the heading link)
```

- `.t` — toggle child headings: `width:16px; height:16px; border-radius:3px; background:transparent; color:var(--quote-c); font-size:13px; cursor:pointer;` Hover: `background:var(--pre-bg); color:var(--text);`
- `.s` — spacer for items without children `{ width:16px; flex-shrink:0; display:inline-block; }`

### Header

Two stacked rows: `#toc-header` is `flex-direction:column`; the top `.toc-title-row` holds the filename (`#tocTitle`), copy-path button (`.toc-copy`) and master toggle (`.toc-m`); below it a `.toc-path` line shows the file's relative path (single-line, ellipsized, full path in `title`).

```
#toc-header { display:flex; flex-direction:column; gap:3px; padding:0 28px 10px 6px; font-weight:600; font-size:13px; color:var(--quote-c); }
#toc-header .toc-title-row { display:flex; align-items:center; gap:6px; }
#toc-header .toc-m { margin-left:auto; width:18px; height:18px; border:1px solid var(--border); border-radius:4px; background:transparent; color:var(--quote-c); cursor:pointer; }
#toc-header .toc-path { font-weight:400; font-size:11px; color:var(--quote-c); opacity:.7; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
```

Master toggle (`.toc-m`) shows `−` / `+` text, toggles all sub-lists simultaneously.

The relative path is computed server-side (`computeDisplayPath` in `server.ts`): relative to the workspace folder when the file is in one (prefixed with the folder name if several are open), otherwise relative to the parent of the nearest ancestor `.git` directory (so it includes the repo folder name), else the absolute path. It's passed as `{{REL_PATH_JSON}}` and re-sent on markdown live updates via the `relPath` field.

### Nested tree algorithm

JS stack-based: push root ul, iterate headings by level, pop stack while `lv >= current`, create li + a + sub-ul, push. Remove empty sub-uls, add toggle button to items with children, add spacer to items without.

## Resizer

There are two resizers. Both share one helper, `attachResizer(resizerEl, targetEl, opts)` in `toc-common.ts`, where `opts = { axis:'x'|'y', invert, key, def, min, max, get, set }`. `get`/`set` read/write the size on `targetEl`; `key` is the `localStorage` key; `def` is the size applied when nothing is saved (`null` = leave CSS in control); `invert:true` means dragging toward the start grows the size (used by the height resizer, whose handle is at the top).

```
.toc-resizer { width:4px; cursor:col-resize; flex-shrink:0; background:var(--border); transition:background .15s; }
.toc-resizer:hover, .toc-resizer.active { background:var(--link-c); }

.toc-related-resizer { height:4px; cursor:row-resize; flex-shrink:0; background:var(--border); transition:background .15s; margin-bottom:8px; }
.toc-related-resizer:hover, .toc-related-resizer.active { background:var(--link-c); }
```

- `.toc-resizer` — width of the TOC. Placed between `#toc` and `.markdown-body` inside `#wrapper`. Hover changes color only, never width (no layout jump).
- `.toc-related-resizer` — height of the Related block. Rendered as the first child of `#toc-related` (only when the doc has related links), so it sits between the TOC body and the "Related" header. It gets its geometry inline in `buildRelatedLinks` (`height/cursor/flex-shrink`) so a missing/late CSS rule can't collapse it to 0px; `page.css` owns only the color + `:hover`.

Both: hover changes color only — never the dimension, to avoid layout jump.

## TOC collapse handle (Markdown)

`#tocToggle` toggles the whole TOC sidebar via a pure-CSS edge tab — no JS geometry. Structure: `#wrapper > #tocSide > (#toc + #tocToggle)`. `#tocSide` owns the sticky/flex role and (being `position:sticky`) is the containing block; `#toc` owns width + `overflow:hidden` + scroll. The handle is `position:absolute; left:100%` so it protrudes past the TOC's right edge and rides it through resize/collapse automatically. This mirrors the HTML snippet's `#__otb` (`position:absolute; right:100%`), just flipped to the right; earlier `overflow:hidden` on `#toc` blocked this, which is why the wrapper was introduced. Clicking adds/removes `#tocSide.collapsed` (drives `#toc` width to `0` and hides `.toc-resizer` via `#tocSide.collapsed + .toc-resizer { display:none }`) so `.markdown-body` expands to full width. When collapsed the handle switches to `position:fixed; left:0` so it docks flush to the viewport's left edge instead of floating at the wrapper's `24px` left padding (mirrors the HTML snippet, whose closed handle docks to the screen edge). State persists in `localStorage` key `onair-toc-collapsed` (`'1'`/`'0'`). Icon flips `<` (hide) / `>` (show).

Border matches the splitter for visual parity: `border: 4px solid var(--border)` (same width as `.toc-resizer`) with `border-left:none`, and `:hover { border-color: var(--link-c) }` (mirrors `.toc-resizer:hover`). A thin 1px border here is invisible against `--bg` in dark mode — keep it at the splitter's 4px.

## Banner Controls

```
#banner { display:flex; align-items:center; justify-content:center; gap:12px; position:sticky; top:0; z-index:10; padding:6px 16px; font-size:13px; }
```

- Buttons (`.bp-btn`, `.wp-btn`): `height:26px; padding:0 10px; border:1px solid var(--btn-border); border-radius:4px; background:transparent; color:var(--btn-c); cursor:pointer;` Hover: `background:var(--btn-hover-bg); transform:translateY(-1px);`
- Active toggle (`.wp-btn.on`): `background:var(--btn-on-bg); color:var(--btn-on-c); border-color:var(--btn-on-border);`
- Text-changing toggle (`.wp-btn`): must have `min-width` so switching between short/long labels (e.g. "Wrap code" / "Unwrap code") doesn't push adjacent elements sideways.
- Select (`.bp-select`): same sizing, extra right padding for dropdown arrow via inline SVG `background-image`
- Select `<option>`: uses CSS variables `background:var(--bg); color:var(--text);`
- Stepper groups (`.bp-group`): each multi-button cluster (font size, scrollbar width) is a tight `display:inline-flex; gap:4px` unit led by an icon `.bp-label` (`A` for font, `‖` for scrollbar). The `#banner` `gap:16px` between groups vs `4px` inside makes each cluster read as one unit — otherwise two near-identical steppers (both with a `↺` and a `16` input) are indistinguishable. The icon label carries the meaning, so the buttons are plain `−`/`+`.

### Font Size Input

```
.fs-input { width:44px; height:26px; text-align:center; border:1px solid var(--btn-border); border-radius:4px; background:transparent; color:var(--btn-c); -moz-appearance:textfield; }
.fs-input::-webkit-inner-spin-button, .fs-input::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
```

Wrapped in a `.bp-group` led by an icon label (`.bp-label` = `A`). Layout: `A −[input]↺+`. Buttons ±2, ↺ resets to 16. Range clamped to 12–28. Persisted in `localStorage('onair-font-size')`.

### Scrollbar Width Input

Same `.fs-input` + `.bp-btn` styling as font size, wrapped in a `.bp-group` led by an icon label (`.bp-label` = `‖`). Layout: `‖ −[input]↺+`. Buttons ±4, ↺ resets to 16. No upper limit (floor 0). Sets `--sb-w` on `document.documentElement` and persists in `localStorage('onair-scrollbar-width')`. Markdown-only control; the HTML snippet has no banner but reads the same key on load and applies `--sb-w` so its TOC scrollbars honor the chosen width.

## HTML-snippet status badge (`#__onair_banner__`)

The HTML preview can't inject a top layout bar, so status lives in a floating corner widget: `#__onair_status` (a `position:fixed; bottom:12px; right:12px; pointer-events:none` container) holding two stacked layers — `#__onair_dot` (a 14px circle, `pointer-events:auto`) and `#__onair_banner__` (the full badge, `pointer-events:none` **always**). To avoid overlapping whatever the user's page puts in the bottom-right, the widget auto-collapses: 4s after any state change the container gains `.idle`, which shows the dot and hides the badge (color still conveys state). Every state handler — `onopen`, `closed`, `onclose` — calls `setStatus(icon,msg,color)` (updates both dot + badge), then `wakeBanner()` (remove `.idle`, clear timer, show the full badge) then `scheduleIdle()` (re-arm the 4s collapse), so even error (yellow) states settle back into a colored dot instead of lingering.

**Why two layers, not one morphing element.** The peek is pure CSS: `.__onair_status.idle .__onair_dot:hover ~ .__onair_banner__ { display:block }`. The critical rule is that **the hover target (`#__onair_dot`) never changes shape/size/position when hovered** — the badge that appears is a *separate* `pointer-events:none` sibling, so the cursor stays on the invariant dot and there is no feedback loop. An earlier one-element design (a single badge that morphed between a `border-radius:50%` circle when idle and a `border-radius:6px` rectangle on `:hover`) flickered frantically: where the circle edge and the rounded-rect corner cross, a static cursor is inside one shape but outside the other, so hovering expands it → boundary moves off the cursor → collapses → repeat. Rule of thumb: never let a `:hover` handler change the geometry of the element being hovered; split the invariant hit target from the changing visual.

## Footnotes & Annotations

Two **independent** systems, both built from `markdown-it-footnote` + `markdown-it-mark` (registered on the `md` instance in `server.ts`). Markdown preview only; the HTML-snippet template is untouched. All routing/positioning is client-side in `markdown-page.html` — no server template or websocket changes; the markup flows through `{{BODY}}` and the existing `update` payload, so both blocks rebuild on every live edit (`buildAnnotations()` then `processFootnotes()`, called after `buildToc()` on load and on each ws update, in that order).

### Routing rule (bottom vs. right)

Decided at the **marker position**, not the definition line. A `sup.footnote-ref` whose immediate previous sibling is a `<mark>` (i.e. `==text==^[note]` or `==text==[^id]`) → **annotation** (right column): its `<li>` is looked up by id, cloned into a card (backref stripped), and **removed from the bottom list**; the numeric `sup` is hidden (`display:none`) so the highlight itself is the anchor. Any footnote marker not glued to a `<mark>` → stays a **bottom footnote**. If removing annotation items empties the list, the whole `section.footnotes` + `hr.footnotes-sep` is removed.

### Bottom footnotes (`#footnotes-block`)

`processFootnotes()` wraps `section.footnotes` in `#footnotes-block` with a clickable `#footnotes-head` (a `.fn-toggle` caret + "Footnotes"). Collapsed state → `#footnotes-block.collapsed .footnotes { display:none }`, persisted in `onair-footnotes-collapsed`. Styled with theme vars (`.footnotes` is `88%`/`--quote-c`; `.footnote-backref` has no underline).

### Right annotation column (`#annotSide`)

Third flex child of `#wrapper`, after `.markdown-body`: `[…] .markdown-body [.annot-resizer] [#annotSide > (#annots + #annotToggle)]`. Unlike `#tocSide` it is **not** sticky — it scrolls with the document so cards stay beside their marks. `#annots` is `position:relative`; each `.annot-card` is `position:absolute`, its `top` computed as `markDocY(mark) − markDocY(#annots)` (document-Y delta, robust to scroll). `layoutCards()` sorts cards by mark position and applies **collision stacking** (push down to `prevBottom + 12px` gap); it re-runs on window resize, font-size change (inside `setFs`), and column resize (the `attachResizer` `set` callback). Absolutely-positioned cards ignore `#annots` padding, so `top:0` aligns with the column box top = the article box top (same flex row) = correct mark alignment.

- Resizer `.annot-resizer` sits **before** `#annotSide` (left edge), so `attachResizer` uses `invert:true` (drag left grows width); key `onair-annot-width`, `min:120`. CSS can't select a previous sibling, so the resizer is hidden via JS when the column is collapsed/absent.
- Collapse handle `#annotToggle` mirrors `#tocToggle` but flipped: `position:absolute; right:100%; border-right:none; border-radius:6px 0 0 6px`, docking `position:fixed; right:0` when collapsed. Icon `>` (hide) / `<` (show). Key `onair-annot-collapsed`.

### Highlight & marker styling

`.markdown-body mark { background:var(--mark-bg) }` (highlighter; own theme var — never reuse `--fm-bg`). Annotated marks get `.annot-mark` (dotted `--link-c` underline + pointer) and `.active` (a `--link-c` ring, mirrored on the card). Plain `.footnote-ref a` has no underline.

### Interactions & fallback

Click always reveals a note; the **shared** banner switch `#hoverBtn` ("Hover notes", a `.wp-btn.on` toggle, key `onair-annot-hover`) only gates whether *hover* also reveals it. When the annotation column is visible (`annotColumnVisible()`: `display!=='none'` and not collapsed) a mark click activates + scrolls its card; otherwise a mark click/hover shows `#annot-pop`, a single reusable popover appended to `<body>` (`position:absolute; z-index:60`), anchored under the mark and clamped to the viewport width. Below `max-width:1000px` a media query hides `#annotSide`/`.annot-resizer`, so the popover is the automatic narrow-screen fallback. Bottom footnote markers also get a hover popover (click stays a native `#fn` anchor jump).

### Future-authoring seams

Each `<mark>` and card carries a stable `data-annot-id`; `cardRegistry` maps `id ↔ mark ↔ card`; the build is idempotent (clears `#annots` and re-derives on every render) so a future write-back re-render stays clean.

## LocalStorage Keys

| Key | Type | Values |
|---|---|---|
| `onair-theme` | string | `auto`, `dark`, `light` |
| `onair-font-size` | number | 12–28 (default 16) |
| `onair-scrollbar-width` | number | ≥0 (default 16, step 4, no upper cap); drives `--sb-w` |
| `onair-toc-width` | number | 24–∞ (min 24 so the resizer stays grabbable; no upper cap — drag as wide as you like, content just scrolls; no forced default, CSS `clamp(420px,24vw,560px)` applies until the user drags) |
| `onair-related-height` | number | 120–480 (default 200) |
| `onair-footnotes-collapsed` | string | `'1'`/`'0'` — bottom footnotes block collapsed |
| `onair-annot-collapsed` | string | `'1'`/`'0'` — right annotation column collapsed |
| `onair-annot-width` | number | ≥120 — annotation column width |
| `onair-annot-hover` | string | `'1'`/`'0'` — hover-preview switch (shared) |

## File Locations

CSS and templates are extracted to `src/templates/`:
- `page.css` — all CSS variables and layout rules
- `markdown-page.html` — markdown preview page template (uses `{{CSS}}`, `{{ID}}`, `{{TITLE}}`, `{{BODY}}`, `{{ID_JSON}}`)
- `html-snippet.html` — HTML page snippet (uses `{{CSS}}`, `{{ID_JSON}}`)

These are imported into `src/server.ts` via webpack `asset/source`.
