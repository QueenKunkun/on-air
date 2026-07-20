# Change Log

## [0.12.0] - 2026-07-20

- feat: link bare .md references to a path-proximity picker (xref)
- feat: show a version badge in the preview that copies on click
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
