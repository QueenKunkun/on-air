# Design: Relative links to other documents in OnAir previews

## Problem

When a Markdown or HTML preview contains a relative link to another document
(e.g. `[notes](notes.md)`, `../plan.md`), clicking it does not open that
document's preview. The browser requests `GET /preview/<id>/notes.md`, which the
server currently serves as **raw bytes** (not a rendered preview), or 404s.

## Constraint discovered (drives the design)

The preview is served at `/preview/<id>/` and the page sets
`<base href="/preview/<id>/">`. Therefore the browser resolves **every relative
link against that URL** — i.e. against the **source document's own directory**,
not the workspace root.

Worse: a link such as `../parent.md` is normalized by the browser *before* the
request is sent into `/preview/parent.md` (the `..` escapes the `<id>` path
segment). The server can never recover the original intent — `..` links are
unrecoverable with the current URL model.

**Conclusion:** the only robust way to support `..` (parent-directory) links is
to **rewrite links at render time** to be relative to a chosen *resolution
root*. Because an in-scope target always lives *under* that root, the rewritten
path never contains `..`, so the browser never escapes the `<id>` segment.

## Scope rules (security boundary)

- **File is inside a workspace/folder** → resolution root = that workspace
  folder's root. Any link whose target lands inside the workspace works
  (siblings, subfolders, and `../parent`).
- **File is outside any workspace** → resolution root = the file's own
  directory. Only its directory and subfolders work; `../` escapes and is
  blocked.

Both are enforced by:
1. A rewritten in-scope path contains no `..`, so the browser stays under
   `/preview/<id>/`.
2. `resolveStaticPath` already guards against path traversal (target must be
   inside `rootDir`); out-of-scope links still 404.

## Design

Implemented as two logical commits.

### Commit 1 — resolve relative links against the workspace root; rewrite to root-relative

- `extension.ts`: compute `rootDir` =
  `vscode.workspace.getWorkspaceFolder(doc.uri)?.uri.fsPath` when the file is in
  a workspace, otherwise `path.dirname(doc.uri.fsPath)`. Pass it through to
  `registerDocument` (signature unchanged).
- `server.ts` `renderMarkdown`: call `md.render(src, { docDir, rootDir })` where
  `docDir = path.dirname(fullPath)`. Add a shared `rewriteLink(href, docDir,
  rootDir)`:
  - skip if `href` is external (`http(s):`, `//`), `#anchor`, `data:`,
    `mailto:`, or an absolute path;
  - else `absTarget = path.resolve(docDir, hrefPath)`,
    `rel = path.relative(rootDir, absTarget).split(sep).join('/')`, then
    re-append `#`/`?`. (Idempotent on re-render, and produces no `..` for
    in-scope targets.)
  - Apply via `renderer.rules.link_open` **and** `image`.
- `server.ts` HTML path: best-effort regex rewrite of `href="..."` / `src="..."`
  (same `rewriteLink`, skipping absolute/external) in user HTML before injecting
  the `<base>` tag.
- Net effect: images/embeds **and** `.md`/`.html` links resolve across the whole
  workspace; `../parent` works for in-workspace files. (Doc links still serve raw
  at this stage — Commit 2 renders them.)

### Commit 2 — open relative links to other Markdown/HTML docs as previews

- Add `import * as vscode from 'vscode';` to `server.ts`.
- In `handleRequest`'s static branch, after `resolveStaticPath` succeeds,
  classify the resolved file by extension
  (`.md`/`.markdown` → `markdown`, `.html`/`.htm` → `html`):
  - `uriKey = vscode.Uri.file(filePath).toString()` — identical to the key the
    extension uses (`doc.uri.toString()`), so the on-demand preview shares the
    **stable id** and stays live-syncable if the file is later opened/edited.
  - if not already registered, read the file and call
    `registerDocument(uriKey, path.basename(filePath), content, kind,
    targetRootDir, filePath)`, where `targetRootDir` is the target's workspace
    folder (if any) else its own directory.
  - `302` redirect to `/preview/<id><#fragment>` (preserves any anchor).
- Non-document types fall through to the existing raw static serving.

## Verification

- `npm run compile`.
- In-workspace doc `docs/a.md` linking `b.md` (sibling), `sub/c.md`
  (subfolder), `../notes/n.md` (parent) → all open as rendered previews; anchors
  preserved.
- A file opened from outside any workspace linking `../x.md` → blocked (404);
  sibling/subfolder links work.
- Editing a target document in VS Code live-updates its preview tab.

## Limitations

- HTML link rewriting is best-effort (attribute regex); Markdown rewriting is
  exact via markdown-it rules.
- External / absolute / `mailto:` / `data:` links are untouched.
- Scope for out-of-workspace files is limited to their own directory (per spec).
- Multi-root workspaces: a link is scoped to the folder containing its source
  document.
