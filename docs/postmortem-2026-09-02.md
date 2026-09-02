# Postmortem: v0.22.0 Search Feature Rollback

**Date:** 2026-09-02
**Author:** kk + opencode
**Status:** Resolved

## Summary

The v0.22.0 release included a "Find in Files" content search feature backed by ripgrep (`rg`). The release was rolled back due to the bundled `rg` binary (4.3 MB) blowing past the 1 MB VSIX limit. Subsequent attempts to fix the rg situation revealed deeper issues, leading to a full rollback of the search feature to a separate branch.

## Timeline

1. **Search feature merged** — `110dddb` added ripgrep-backed content search to the preview panel
2. **v0.22.0 released** — `5e01b7f` shipped the search feature with `@vscode/ripgrep` bundled
3. **VSIX too large** — User reported 5.3 MB VSIX, exceeding the 1 MB Marketplace limit
4. **Attempted fix: use system rg** — Rewrote `getRgPath()` to prefer system `rg` via `which rg`, removed `@vscode/ripgrep` from dependencies
5. **`copy-ripgrep.mjs` still had old code** — The script was rewritten but the file on disk still had the old `require('@vscode/ripgrep')` logic, which recreated `dist/ripgrep/` (5 MB) on every build
6. **Branching混乱** — Multiple attempts to move commits between `main`, `rg-no-bundle`, and `content-search-v2` resulted in the search feature accidentally remaining on `main`
7. **Feature rolled back** — Search feature moved to `content-search-v2` branch, `main` reset to v0.21.0

## Root Causes

### 1. `copy-ripgrep.mjs` edit didn't persist
The file was rewritten via the `write` tool, but later build/test cycles appeared to use a stale version. The old script still called `require('@vscode/ripgrep').rgPath` and copied the binary to `dist/ripgrep/`, adding 5 MB to every build.

**Fix:** After editing, always verify the file content matches expectations before proceeding.

### 2. `@vscode/ripgrep` internal path is unreliable
VS Code 1.122.0 changed the bundled rg path (microsoft/vscode#318691). Extensions relying on `vscode.env.appRoot` + relative paths broke. VS Code closed the issue as `not planned` — the official stance is that extensions should not depend on internal binary paths.

**Fix:** System `rg` on PATH is the only reliable source. `getRgPath()` now tries `which rg` first.

### 3. `useLocalStorage` cross-tab sync
The hook dispatched `StorageEvent` to sync state across browser tabs. When two tabs had the same preview open, collapsing the file tree in one tab collapsed it in the other.

**Fix:** Removed `storage` event listener and manual `StorageEvent` dispatch. State loads from localStorage on mount, saves on change, no runtime sync.

### 4. `isHidden` filtered all dotfiles
`tree.ts` called `isHidden(name)` which returned `true` for anything starting with `.`, including `.claude`. Users couldn't see or navigate to dot-directories.

**Fix:** Removed `isHidden` filter from tree listing. `.gitignore` checkbox controls visibility of ignored files. `shouldSkipDir` still skips `node_modules`, `.git`, `.vscode`.

### 5. Stale content when switching file types
Clicking a code file (JSON/CSS) after viewing markdown left the old markdown HTML in `#content`. Preact's `render()` didn't fully replace server-rendered content.

**Fix:** Added `contentEl.innerHTML = ''` before `render()` via a `renderInto` helper.

## What Went Well

- System rg approach (`which rg`) is correct and confirmed by VS Code's own issue tracker
- Node.js grep fallback ensures search works without rg installed
- JSON syntax highlighting with regex-based tokenizer is lightweight and dependency-free
- Unit and E2E tests remained green throughout (103 unit, 93 E2E)

## What Went Wrong

- Edit tool writes didn't always persist (copy-ripgrep.mjs)
- Branch management was混乱 — too many parallel branches (`rg-no-bundle`, `content-search-v2`) for the same feature
- The search feature should have been on a feature branch from the start, not merged to main
- Attempted too many things in parallel (rg removal, search, JSON preview) without finishing one before starting the next

## Action Items

- [ ] When editing files, always verify content after writing before proceeding
- [ ] Keep feature work on feature branches until fully ready — never merge to main prematurely
- [ ] One problem at a time: finish rg removal, then test, then move to next issue
- [ ] Before creating new branches, check if an existing branch already covers the work

## Current Branch State

| Branch | Content |
|--------|---------|
| `main` | v0.21.0 + dotfiles fix (clean, no search) |
| `content-search-v2` | Search feature + rg removal + JSON preview + all fixes |
| `rg-no-bundle` | Old, superseded by content-search-v2 |
