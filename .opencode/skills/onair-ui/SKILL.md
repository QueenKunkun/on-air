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

```css
#toc::-webkit-scrollbar { width:16px; height:16px; }
#toc::-webkit-scrollbar-track { background:transparent; }
#toc::-webkit-scrollbar-thumb { background:var(--border); border-radius:6px; border:2px solid transparent; background-clip:content-box; }
#toc::-webkit-scrollbar-thumb:hover { background:var(--quote-c); border:2px solid transparent; background-clip:content-box; }
```

Both horizontal and vertical scrollbars use the same style (set `height` for horizontal).

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

```
#toc-header { display:flex; align-items:center; gap:6px; padding:0 28px 10px 6px; font-weight:600; font-size:13px; color:var(--quote-c); }
#toc-header .toc-m { margin-left:auto; width:18px; height:18px; border:1px solid var(--border); border-radius:4px; background:transparent; color:var(--quote-c); cursor:pointer; }
```

Master toggle (`.toc-m`) shows `−` / `+` text, toggles all sub-lists simultaneously.

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

## Banner Controls

```
#banner { display:flex; align-items:center; justify-content:center; gap:12px; position:sticky; top:0; z-index:10; padding:6px 16px; font-size:13px; }
```

- Buttons (`.bp-btn`, `.wp-btn`): `height:26px; padding:0 10px; border:1px solid var(--btn-border); border-radius:4px; background:transparent; color:var(--btn-c); cursor:pointer;` Hover: `background:var(--btn-hover-bg); transform:translateY(-1px);`
- Active toggle (`.wp-btn.on`): `background:var(--btn-on-bg); color:var(--btn-on-c); border-color:var(--btn-on-border);`
- Text-changing toggle (`.wp-btn`): must have `min-width` so switching between short/long labels (e.g. "Wrap code" / "Unwrap code") doesn't push adjacent elements sideways.
- Select (`.bp-select`): same sizing, extra right padding for dropdown arrow via inline SVG `background-image`
- Select `<option>`: uses CSS variables `background:var(--bg); color:var(--text);`

### Font Size Input

```
.fs-input { width:44px; height:26px; text-align:center; border:1px solid var(--btn-border); border-radius:4px; background:transparent; color:var(--btn-c); -moz-appearance:textfield; }
.fs-input::-webkit-inner-spin-button, .fs-input::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
```

Layout: `A− [input] [↺] A+`. Buttons ±2, ↺ resets to 16. Range clamped to 12–28. Persisted in `localStorage('onair-font-size')`.

## HTML-snippet status badge (`#__onair_banner__`)

The HTML preview can't inject a top layout bar, so status lives in a floating `position:fixed; bottom:12px; right:12px` badge (`pointer-events:none` so it never blocks the page). To avoid overlapping content the user's own page may put in the bottom-right, the badge auto-collapses: 4s after any state change it gains `.idle`, shrinking to a ~14px colored dot (color still conveys state). Hovering the dot (`.idle:hover`, which restores `pointer-events:auto`) expands it back to the full badge via pure CSS — no JS peek logic. Every state handler — `onopen`, `closed`, `onclose` — calls `wakeBanner()` (remove `.idle`, clear timer, show the message) then `scheduleIdle()` (re-arm the 4s collapse), so even error (yellow) states settle back into a colored dot instead of hovering forever. `pointer-events` is owned by CSS (base `none`, `.idle` `auto`), not the inline style, so the hover rule can win. The `transition` must only cover `padding`/`border-radius`, never `width`/`height`: those animate between a fixed dot size and `auto`, and transitioning to/from `auto` makes the box collapse mid-animation, sliding out from under the cursor → hover lost → re-expand → frantic flicker.

## LocalStorage Keys

| Key | Type | Values |
|---|---|---|
| `onair-theme` | string | `auto`, `dark`, `light` |
| `onair-font-size` | number | 12–28 (default 16) |
| `onair-toc-width` | number | 180–600 (no forced default; CSS `clamp(420px,24vw,560px)` applies until the user drags) |
| `onair-related-height` | number | 120–480 (default 200) |

## File Locations

CSS and templates are extracted to `src/templates/`:
- `page.css` — all CSS variables and layout rules
- `markdown-page.html` — markdown preview page template (uses `{{CSS}}`, `{{ID}}`, `{{TITLE}}`, `{{BODY}}`, `{{ID_JSON}}`)
- `html-snippet.html` — HTML page snippet (uses `{{CSS}}`, `{{ID_JSON}}`)

These are imported into `src/server.ts` via webpack `asset/source`.
