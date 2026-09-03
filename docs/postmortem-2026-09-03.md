# Postmortem: Code File Preview — Stale Content, Missing TOC/Highlight

**Date:** 2026-09-03
**Author:** kk + opencode
**Status:** Resolved

## Summary

Opening code files (JSON/TS/CSS/etc.) from the file tree left the old markdown content visible in `#content`. The TOC continued showing markdown headings, and the file tree highlighted the wrong file. Three attempts were needed to fix this properly.

## Timeline

1. **First attempt** — Added `contentEl.innerHTML = ''` before Preact `render()` in `openFile`
2. **Still broken** — Markdown content persisted. User reported it's still there.
3. **Second attempt** — Added `onair:content-change` custom event to trigger TOC re-read, updated `data-fullpath` for file tree highlight
4. **TOC still wrong** — User reported TOC still showed markdown headings. Event-based sync wasn't working.
5. **Final fix** — Abandoned Preact render entirely for code files. Plain DOM rendering + direct `tocCol.style.display = 'none'` + direct `data-fullpath` update. No cross-component communication needed.

## Root Causes

### 1. Preact render() conflicts with App tree

The App component (index.tsx) manages `#content` via its own Preact tree. When `openFile()` called `render(h(FilePreviewCode, ...), contentEl)`, it created a second Preact tree targeting the same DOM node. Preact's reconciliation couldn't properly replace server-rendered markdown HTML from a different tree.

**Evidence:** `contentEl.innerHTML = ''` before `render()` still left stale content.

### 2. Event-based state sync is fragile

The `onair:content-change` custom event was supposed to trigger the TOC to re-read headings. But the TOC component's `readHeadings` closure captured a stale `contentEl` reference, and the timing of Preact's state updates vs. native DOM manipulation made the event unreliable.

### 3. Two rendering paradigms don't mix

Markdown is rendered server-side into `#content`, then hydrated by the App's Preact tree (TOC, annotations, footnotes, etc.). Code files need completely different behavior (no headings, no annotations, no footnotes). Trying to reuse the same `#content` element for both paradigms caused constant conflicts.

## Final Design

Code files now bypass Preact entirely:

```
openFile()
  → isTextFile? → page navigation (server renders markdown)
  → isCodeFile? → fetch + renderCodeFile()
                    → contentEl.innerHTML = <code view HTML>  (plain DOM)
                    → tocCol.style.display = 'none'            (direct DOM)
                    → ftRoot.data-fullpath = newPath           (triggers MutationObserver)
```

No Preact render, no custom events, no state synchronization. Each concern is handled by direct DOM manipulation.

## What Went Well

- Plain DOM approach is simple, predictable, and fast
- File tree highlight works via existing MutationObserver (no new code needed)
- TOC hide/show is one line each way
- Unit and E2E tests stayed green (103 unit, 93 E2E)

## What Went Wrong

- Attempted to reuse Preact's render for a use case it wasn't designed for (cross-tree rendering)
- Event-based communication between components was over-engineered for a simple hide/show
- Didn't recognize early that the two rendering paradigms (server-rendered markdown vs. client-rendered code) are fundamentally incompatible in the same DOM node

## Lessons

- When the existing architecture doesn't fit, don't force it — use a simpler approach
- Direct DOM manipulation is fine for one-off UI updates; not everything needs a state management framework
- If `render()` doesn't work the first time, the second attempt with events won't fix the underlying issue
