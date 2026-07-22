# Agent preferences

## Committing
- Do NOT amend commits unless it's a genuine error (typo, broken build).
- Feature changes, requirement changes, and bug fixes all get new commits.
- Each commit message should accurately describe what changed.
- Commit messages must be in English.
- Commit one logical change at a time. After finishing each change (edit files, build passes), commit immediately before moving to the next task.

## Testing
- `pnpm test` runs the full suite: compile-tests → compile (webpack) → lint → vscode-test
- `vscode-test` requires a running VS Code instance; will fail in plain terminal
- Playwright e2e tests only: `npx playwright test --reporter=list`
- Build Preact frontend bundle: `pnpm run build:frontend` (esbuild → `dist/preview.js`)
- Compile server (webpack): `pnpm run compile` (builds `dist/extension.js`)
- Unit tests (toc-common): `node src/templates/toc-common.test.mjs`
- Test server starts automatically via `tests/global-setup.mjs`; writes `tests/.server-info.json`
- IMPORTANT: Always run `pnpm run build:frontend` before testing if frontend code changed — `pnpm test` only runs webpack (`compile`), not esbuild
