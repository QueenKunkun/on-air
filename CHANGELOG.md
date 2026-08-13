# Change Log

## [0.15.7] - 2026-08-13

- Toolbar: replace Wrap code / Hover notes text with icons (↵ / 💬)
- Toolbar: hide status text, show via title tooltip on hover
- Toolbar: dynamic --banner-h so sidebar/TOC no longer overlap on small screens
- Toolbar: tighten button padding; separate +/- and icon button widths


## [0.15.6] - 2026-08-10

- fix: enable opening file tree links in new tab/window


## [0.15.5] - 2026-08-08

- fix: TOC link click not scrolling content to heading


## [0.15.4] - 2026-07-29

- feat: sanitize unknown HTML tags in markdown rendering
- Add markdown-it plugin to wrap non-standard HTML tags in collapsible <details> blocks
- Prevents dangerous tags like <script>, <link> from loading external resources
- Handle self-closing tags without close tags
- Add print styles to hide UI elements


## [0.15.3] - 2026-07-28

- feat: Add image preview

## [0.15.0] - 2026-07-27

- feat: image preview (png/jpg/gif/webp/svg/bmp/ico render as inline base64 data URL)
- fix: file tree hiding and TOC scroll problems

## [0.14.0] - 2026-07-26

- fix: annotation rendering, LAN IP binding

## [0.13.2] - 2026-07-25

- fix: prevent rootDir from resolving to filesystem root '/' for opening non-file-scheme documents
- fix: serve raw HTML for iframe requests instead of redirecting to preview page
- feat: add isDangerousRootDir guard, walk depth/count limits, and diagnostic logging


## [0.13.0] - 2026-07-24

- feat: Add project file tree panel with search, filter, and expand-to-current-file
- feat: Multi-theme preset system with 8 themes (Auto, Dark, Light, Abyss, Kimbie Dark, Monokai Dimmed, Red, Quiet Light, HC Black, HC Light)
- feat: Split Files & TOC into independent side-by-side panels


## [0.12.0] - 2026-07-20

- feat: link bare .md references to a path-proximity picker (xref)
- feat: add a max content width control in the banner


## [0.11.0] - 2026-07-19

- feat: highlight text with ==mark== and attach notes shown as Hypothesis-style margin cards
- feat: render footnotes in a collapsible block at the bottom of the page
- feat: preview links now stay stable across restarts and reconnects


## [0.10.0] - 2026-07-19

- feat: show the file's relative path under the filename in the table of contents


## [0.9.0] - 2026-07-19

- feat: adjustable scrollbar width control in the preview banner


## [0.8.0] - 2026-07-19

- feat: Collapse the table of contents with a side handle (Markdown preview)
- feat: The HTML preview status badge


## [0.7.0] - 2026-07-18

- feat: Open relative links to other Markdown/HTML documents as live previews
- feat: Add a "Related documents" list under the table of contents
- feat: Make the TOC / Related divider draggable and remember its height


## [0.6.0] - 2026-07-17

- feat: TOC shows full path on hover with copy button
- feat: TOC now works in HTML previews too
- feat: html-snippet gets scroll-synced TOC highlight


## [0.5.1] - 2026-07-16

- fix: TOC links no longer scroll past the target heading; heading stays visible below the banner

## [0.5.0] - 2026-07-16

- feat: Add table of contents sidebar
- feat: Add font size controls in the preview banner

## [0.4.0] - 2026-07-15

- feat: auto-detect LAN IP and show LAN address options in the quick pick for sharing with colleagues on the same network


## [0.3.2] - 2026-07-15

- style: adopt VS Code Dark 2026 color palette for dark mode — softer text, proper syntax colors
- fix: use dedicated link color in dark mode for readability


## [0.3.1] - 2026-07-15

- feat: add theme switch dropdown with auto/dark/light modes and persistent preference
- style: unify banner control heights, custom dropdown arrow, hover lift animation


## [0.3.0] - 2026-07-14

- feat: add global "Wrap" toggle button in sticky banner to wrap long code block lines instead of horizontal scrolling
- fix: render YAML frontmatter as formatted block instead of broken hr fragments


## [0.2.1]

- feat: Add global "Wrap" toggle button in the sticky banner to wrap long code block lines instead of horizontal scrolling

## [0.2.0]

- feat: Serve static assets (images, embeds, attachments, etc.) located next to the previewed file via `/preview/<id>/<relative-path>`, so relative references like `![alt](images/foo.png)` or `<iframe src="embeds/page.html">` work in the live preview
- perf: Switched highlight.js to its core build plus 21 manually-registered common languages instead of the full ~190-language bundle, cutting the packaged extension size from ~1.1MB to ~300KB

## [0.1.0]

- feat: Added live preview for HTML files (full-page reload), Markdown continues to use targeted content refresh
- Initial release: generate a live local preview link, supports opening in browser / copying the link, live refresh on edit
- Syntax highlighting for code blocks (highlight.js)
