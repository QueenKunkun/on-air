# Postmortem: sanitize-unknown-html JSX Rendering Bug

**Date:** 2026-09-03
**Author:** kk + opencode
**Status:** Resolved

## Summary

Markdown files containing JSX/HTML tags in code blocks (e.g., `<AppHeader />`) had those tags wrapped in collapsible `<details>` blocks by the `sanitizeUnknownHtml` plugin. The plugin was preprocessing the raw markdown source with regex, which couldn't distinguish between tags in code blocks vs. regular text.

## Timeline

1. **Bug reported** — User's `.agent/skills/component-refactoring/SKILL.md` showed `<AppHeader/>` wrapped in `<details class="onair-unknown-html">`
2. **First fix** — Added fenced code block tracking (`inCodeBlock` flag) to `sanitizeUnknownHtml`
3. **Second bug** — Inline code backticks (`<promise>TASK-{ID}:DONE</promise>`) also got wrapped
4. **Second fix** — Added backtick span stripping before tag detection
5. **User pushed back** — Asked if we should use markdown-it's hooks instead of string preprocessing
6. **Final fix** — Rewrote plugin as a markdown-it core rule operating on the token stream

## Root Cause

The original `sanitizeUnknownHtml` was a **string preprocessing step** that ran before markdown-it's parser. It used regex to detect HTML tags line by line, which had fundamental limitations:

- **Couldn't track code blocks reliably** — needed manual fence tracking (`inCodeBlock` flag)
- **Couldn't track inline code** — needed backtick stripping with null-byte placeholders
- **Couldn't handle paired tags across lines** — complex lookahead logic with arbitrary 500-line limit
- **Duplicated parser logic** — reimplemented what markdown-it already does (code block detection, inline code separation)

## The Proper Solution

markdown-it already separates content into typed tokens during parsing:

| Token type | What it represents |
|---|---|
| `code_inline` | Text inside backticks — **already isolated** |
| `code_block` / `fence` | Fenced/indented code blocks — **already isolated** |
| `html_inline` | Inline HTML tags in regular text |
| `html_block` | Block-level HTML |

A **core rule** registered after `text_join` operates on this token stream. Tags inside `code_inline` or `fence` tokens are never seen by the rule — the parser already handled them.

The rewritten plugin:
```ts
md.core.ruler.after('text_join', 'sanitize_unknown_html', sanitizeCore);
```

Iterates `html_inline` and `html_block` tokens, checks tag names against the allowlist, and modifies content in place. No string preprocessing, no regex tracking, no null-byte hacks.

## Lessons

- **Don't reimplement the parser** — if the library already separates content into typed tokens, use the tokens
- **String preprocessing before parsing is fragile** — it will always miss edge cases that the parser handles correctly
- **When the user says "use the library's hooks"** — they're usually right
- **Two rounds of regex fixes should be a red flag** — the approach is fundamentally wrong

## Files Changed

- `src/markdown/sanitize-unknown-html.ts` — complete rewrite (182 → 133 lines)
