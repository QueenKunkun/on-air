import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const infoPath = path.join(__dirname, '.server-info.json');
let baseUrl: string;
let docId: string;

test.beforeAll(() => {
  const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
  baseUrl = info.baseUrl;
  docId = info.id;
});

test.beforeEach(async ({ page }) => {
  await page.goto(`${baseUrl}/preview/${docId}`);
  await page.waitForSelector('.ft-list', { timeout: 5000 });
});

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getVisibleFiles(page: Page): Promise<string[]> {
  return page.locator('.ft-item.ft-file .ft-name').allTextContents();
}

async function getVisibleDirs(page: Page): Promise<string[]> {
  return page.locator('.ft-item.ft-directory .ft-name').allTextContents();
}

async function expandDir(page: Page, name: string) {
  await page.click(`.ft-list > .ft-item.ft-directory:has(.ft-name:text("${name}"))`);
  await page.waitForSelector('.ft-children .ft-item', { timeout: 3000 });
}

async function expandDirNested(page: Page, ...names: string[]) {
  for (const name of names) {
    await page.click(`.ft-item.ft-directory:has(.ft-name:text("${name}"))`);
    await page.waitForSelector('.ft-children .ft-item', { timeout: 3000 });
  }
}

async function collapseDir(page: Page, name: string) {
  const dir = page.locator(`.ft-list > .ft-item.ft-directory.ft-expanded:has(.ft-name:text("${name}"))`);
  const row = dir.locator(':scope > .ft-row');
  await row.click();
  await expect(dir.locator(':scope > .ft-children')).toHaveCount(0, { timeout: 3000 });
}

// ─── Tree rendering ─────────────────────────────────────────────────────────

test('tree renders root entries', async ({ page }) => {
  const items = await page.locator('.ft-list > .ft-item').allTextContents();
  expect(items.some(t => t.includes('guide'))).toBeTruthy();
  expect(items.some(t => t.includes('src'))).toBeTruthy();
  expect(items.some(t => t.includes('README.md'))).toBeTruthy();
});

test('expand directory shows children', async ({ page }) => {
  await expandDir(page, 'src');
  const children = await page.locator('.ft-children .ft-item').allTextContents();
  expect(children.some(t => t.includes('index.ts'))).toBeTruthy();
  expect(children.some(t => t.includes('util.js'))).toBeTruthy();
});

test('locate button applies ft-current to current file', async ({ page }) => {
  await page.click('.ft-locate-btn');
  await page.waitForTimeout(500);
  const current = page.locator('.ft-item.ft-current');
  await expect(current).toHaveCount(1);
  await expect(current).toContainText('README.md');
});

// ─── Filter: .md only ───────────────────────────────────────────────────────

test('mdOnly: only .md files are visible', async ({ page }) => {
  await page.click('label:has-text(".md") input[type="checkbox"]');
  await page.waitForTimeout(500);

  const files = await getVisibleFiles(page);
  expect(files.length).toBeGreaterThan(0);
  for (const f of files) {
    expect(f.trim().endsWith('.md')).toBeTruthy();
  }
});

test('mdOnly: directories without .md files are hidden', async ({ page }) => {
  await page.click('label:has-text(".md") input[type="checkbox"]');
  await page.waitForTimeout(500);

  const dirs = await getVisibleDirs(page);
  // src/ has no .md files → should be hidden
  expect(dirs.some(t => t === 'src')).toBeFalsy();
  // programming/ has app.md → should be visible
  expect(dirs.some(t => t === 'programming')).toBeTruthy();
  // guide/ has setup.md → should be visible
  expect(dirs.some(t => t === 'guide')).toBeTruthy();
});

// ─── Filter: hide unsupported ───────────────────────────────────────────────

test('hideBinary: images visible, .wasm hidden', async ({ page }) => {
  await expandDir(page, 'src');
  const srcFiles = await page.locator('.ft-children .ft-item.ft-file .ft-name').allTextContents();
  expect(srcFiles.some(t => t.includes('module.wasm'))).toBeFalsy();
  expect(srcFiles.some(t => t.includes('util.js'))).toBeTruthy();
});

test('hideBinary: turning off reveals .wasm', async ({ page }) => {
  // Turn off hideBinary
  await page.click('label:has-text("Hide unsupported") input[type="checkbox"]');
  await page.waitForTimeout(500);

  await expandDir(page, 'src');
  const srcFiles = await page.locator('.ft-children .ft-item.ft-file .ft-name').allTextContents();
  expect(srcFiles.some(t => t.includes('module.wasm'))).toBeTruthy();
});

// ─── Filter: .gitignore ─────────────────────────────────────────────────────

test('gitignore: .log files hidden when checked', async ({ page }) => {
  const files = await getVisibleFiles(page);
  expect(files.some(t => t.includes('debug.log'))).toBeFalsy();
});

test('gitignore: unchecking reveals .log files', async ({ page }) => {
  await page.click('.ft-filter label:has-text(".gitignore") input[type="checkbox"]');
  await page.waitForTimeout(1000);

  const files = await getVisibleFiles(page);
  expect(files.some(t => t.includes('debug.log'))).toBeTruthy();
});

// ─── Filter: all on ─────────────────────────────────────────────────────────

test('all filters on: empty directories are hidden', async ({ page }) => {
  // Turn on mdOnly
  await page.click('label:has-text(".md") input[type="checkbox"]');
  await page.waitForTimeout(500);

  // Try to expand programming/ → react/
  await expandDir(page, 'programming');
  await expandDirNested(page, 'react');

  // images/ has no .md files → should not expand
  const imagesExpanded = await page.locator('.ft-item.ft-directory.ft-expanded:has(.ft-name:text("images"))').count();
  expect(imagesExpanded).toBe(0);
});

test('all filters on: directories with .md files are visible', async ({ page }) => {
  await page.click('label:has-text(".md") input[type="checkbox"]');
  await page.waitForTimeout(500);

  const dirs = await getVisibleDirs(page);
  expect(dirs.some(t => t === 'programming')).toBeTruthy();
  expect(dirs.some(t => t === 'guide')).toBeTruthy();
  expect(dirs.some(t => t === '读书')).toBeTruthy();
});

// ─── Filter: collapse on toggle ─────────────────────────────────────────────

test('filter toggle collapses all directories', async ({ page }) => {
  await expandDir(page, 'src');
  const childrenBefore = await page.locator('.ft-children .ft-item').count();
  expect(childrenBefore).toBeGreaterThan(0);

  await page.click('.ft-filter label:has-text(".gitignore") input[type="checkbox"]');
  await page.waitForTimeout(500);

  const childrenAfter = await page.locator('.ft-children .ft-item').count();
  expect(childrenAfter).toBe(0);
});

// ─── Filter: persistence ────────────────────────────────────────────────────

test('filter state persists across page navigation', async ({ page }) => {
  // Turn on mdOnly
  await page.click('label:has-text(".md") input[type="checkbox"]');
  await page.waitForTimeout(500);

  // Navigate away and back
  await page.goto(`${baseUrl}/preview/${docId}`);
  await page.waitForSelector('.ft-list', { timeout: 5000 });

  // mdOnly should still be checked
  const mdCheckbox = page.locator('label:has-text(".md") input[type="checkbox"]');
  await expect(mdCheckbox).toBeChecked();
});

// ─── Search: basic matching ─────────────────────────────────────────────────

test('search *.md: only .md files visible', async ({ page }) => {
  const search = page.locator('.ft-search');
  await search.fill('*.md');
  await page.waitForTimeout(300);

  const files = await getVisibleFiles(page);
  expect(files.length).toBeGreaterThan(0);
  for (const f of files) {
    expect(f.trim().endsWith('.md')).toBeTruthy();
  }
});

test('search *.md: directories containing .md are visible', async ({ page }) => {
  const search = page.locator('.ft-search');
  await search.fill('*.md');
  await page.waitForTimeout(300);

  const dirs = await getVisibleDirs(page);
  expect(dirs.some(t => t === 'programming')).toBeTruthy();
  expect(dirs.some(t => t === 'guide')).toBeTruthy();
});

test('search *.md: directories without .md are hidden', async ({ page }) => {
  const search = page.locator('.ft-search');
  await search.fill('*.md');
  await page.waitForTimeout(300);

  const dirs = await getVisibleDirs(page);
  expect(dirs.some(t => t === 'src')).toBeFalsy();
});

// ─── Search: no matches ─────────────────────────────────────────────────────

test('search *.svg: no files or directories (no .svg in fixture)', async ({ page }) => {
  const search = page.locator('.ft-search');
  await search.fill('*.svg');
  await page.waitForTimeout(300);

  const files = await getVisibleFiles(page);
  expect(files.length).toBe(0);
  const dirs = await getVisibleDirs(page);
  expect(dirs.length).toBe(0);
});

test('search nonexistent pattern: everything hidden', async ({ page }) => {
  const search = page.locator('.ft-search');
  await search.fill('zzz_no_match_zzz');
  await page.waitForTimeout(300);

  expect((await getVisibleFiles(page)).length).toBe(0);
  expect((await getVisibleDirs(page)).length).toBe(0);
});

// ─── Search: Escape clears ──────────────────────────────────────────────────

test('Escape clears search and restores tree', async ({ page }) => {
  const search = page.locator('.ft-search');
  await search.fill('*.md');
  await page.waitForTimeout(300);
  expect((await getVisibleFiles(page)).every(t => t.endsWith('.md'))).toBeTruthy();

  await search.press('Escape');
  await page.waitForTimeout(300);

  expect(await search.inputValue()).toBe('');
  const files = await getVisibleFiles(page);
  expect(files.some(t => t.includes('README.md'))).toBeTruthy();
});

// ─── Search: expanded directories ───────────────────────────────────────────

test('search hides expanded directories without matches', async ({ page }) => {
  await expandDir(page, 'src');
  const srcBefore = await page.locator('.ft-list > .ft-item.ft-directory:has(.ft-name:text("src"))').count();
  expect(srcBefore).toBe(1);

  const search = page.locator('.ft-search');
  await search.fill('*.md');
  await page.waitForTimeout(500);

  const srcAfter = await page.locator('.ft-list > .ft-item.ft-directory:has(.ft-name:text("src"))').count();
  expect(srcAfter).toBe(0);
});

test('search keeps expanded directories with matches', async ({ page }) => {
  await expandDirNested(page, 'programming', 'react');

  const search = page.locator('.ft-search');
  await search.fill('*.md');
  await page.waitForTimeout(500);

  // programming/ should be visible (has app.md)
  const progVisible = await page.locator('.ft-list > .ft-item.ft-directory:has(.ft-name:text("programming"))').count();
  expect(progVisible).toBe(1);
  // react/ should be visible and expanded (has .md files)
  const reactExpanded = await page.locator('.ft-item.ft-directory.ft-expanded:has(.ft-name:text("react"))').count();
  expect(reactExpanded).toBeGreaterThanOrEqual(1);
});

// ─── Search: restore after clear ────────────────────────────────────────────

test('clearing search restores previously expanded directories', async ({ page }) => {
  await expandDir(page, 'src');
  const search = page.locator('.ft-search');
  await search.fill('*.md');
  await page.waitForTimeout(500);

  // src/ is hidden during search
  expect(await page.locator('.ft-list > .ft-item.ft-directory:has(.ft-name:text("src"))').count()).toBe(0);

  await search.press('Escape');
  await page.waitForTimeout(500);

  // src/ should reappear (but collapsed, since filter toggle resets expanded)
  const srcVisible = await page.locator('.ft-list > .ft-item.ft-directory:has(.ft-name:text("src"))').count();
  expect(srcVisible).toBe(1);
});

// ─── Search + filter combined ───────────────────────────────────────────────

test('search + mdOnly: both filters apply simultaneously', async ({ page }) => {
  // Turn on mdOnly
  await page.click('label:has-text(".md") input[type="checkbox"]');
  await page.waitForTimeout(500);

  // Verify mdOnly works: only .md files visible
  const filesAfterMdOnly = await getVisibleFiles(page);
  for (const f of filesAfterMdOnly) {
    expect(f.trim().endsWith('.md')).toBeTruthy();
  }

  // Search for a pattern with no matches
  const search = page.locator('.ft-search');
  await search.fill('zzz_no_match_zzz');
  await page.waitForTimeout(300);

  expect((await getVisibleFiles(page)).length).toBe(0);
  expect((await getVisibleDirs(page)).length).toBe(0);

  // Clear search
  await search.press('Escape');
  await page.waitForTimeout(300);

  // After clearing, .md files should reappear
  const filesAfterClear = await getVisibleFiles(page);
  expect(filesAfterClear.length).toBeGreaterThan(0);
  for (const f of filesAfterClear) {
    expect(f.trim().endsWith('.md')).toBeTruthy();
  }
});

// ─── Image preview ──────────────────────────────────────────────────────────

test('clicking image file shows image preview', async ({ page }) => {
  await expandDirNested(page, 'programming', 'react', 'images');

  const imgFile = page.locator('.ft-item.ft-file:has(.ft-name:text("photo.png"))');
  await expect(imgFile).toBeVisible();
  await imgFile.click();
  await page.waitForTimeout(500);

  const fileView = page.locator('#content .file-view');
  await expect(fileView).toBeVisible();
  const img = fileView.locator('img');
  await expect(img).toBeVisible();
  await expect(img).toHaveAttribute('src', /photo\.png/);
  expect(await fileView.locator('.file-binary').count()).toBe(0);
});

// ─── Expand/Collapse toggle ─────────────────────────────────────────────────

test('expand then collapse: children hidden after second click', async ({ page }) => {
  await expandDir(page, 'src');
  const childrenBefore = await page.locator('.ft-children .ft-item').count();
  expect(childrenBefore).toBeGreaterThan(0);

  await collapseDir(page, 'src');
  const childrenAfter = await page.locator('.ft-children .ft-item').count();
  expect(childrenAfter).toBe(0);
});

test('collapse then re-expand: children visible again', async ({ page }) => {
  await expandDir(page, 'src');
  await collapseDir(page, 'src');

  // Re-expand
  await page.click(`.ft-list > .ft-item.ft-directory:has(.ft-name:text("src"))`);
  await page.waitForSelector('.ft-children .ft-item', { timeout: 3000 });
  const children = await page.locator('.ft-children .ft-item').count();
  expect(children).toBeGreaterThan(0);
});

test('collapse removes ft-expanded class', async ({ page }) => {
  await expandDir(page, 'src');
  const dir = page.locator('.ft-list > .ft-item.ft-directory:has(.ft-name:text("src"))');
  await expect(dir).toHaveClass(/ft-expanded/);

  await collapseDir(page, 'src');
  await expect(dir).not.toHaveClass(/ft-expanded/);
});

test('clicking directory toggle icon collapses expanded dir', async ({ page }) => {
  await expandDir(page, 'programming');

  // Click the toggle span directly
  const toggle = page.locator('.ft-list > .ft-item.ft-directory:has(.ft-name:text("programming")) > .ft-row > .ft-toggle');
  await toggle.click();
  await page.waitForTimeout(300);

  const dir = page.locator('.ft-list > .ft-item.ft-directory:has(.ft-name:text("programming"))');
  await expect(dir).not.toHaveClass(/ft-expanded/);
});

// ─── Hover behavior ─────────────────────────────────────────────────────────

test('hovering file does not highlight parent directory', async ({ page }) => {
  await expandDir(page, 'src');

  const fileItem = page.locator('.ft-children .ft-item.ft-file').first();
  await fileItem.hover();
  await page.waitForTimeout(100);

  const parentRow = page.locator('.ft-list > .ft-item.ft-directory:has(.ft-name:text("src"))').locator(':scope > .ft-row');
  const bg = await parentRow.evaluate(el => getComputedStyle(el).backgroundColor);
  expect(bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent').toBeTruthy();
});

test('hovering subdirectory does not highlight parent', async ({ page }) => {
  await expandDirNested(page, 'programming', 'react');

  const imagesDir = page.locator('.ft-children .ft-children .ft-item.ft-directory:has(.ft-name:text("images"))');
  await expect(imagesDir).toBeVisible();
  await imagesDir.hover();
  await page.waitForTimeout(100);

  // images/ own row should have hover
  const imagesRow = imagesDir.locator(':scope > .ft-row');
  const imagesBg = await imagesRow.evaluate(el => getComputedStyle(el).backgroundColor);
  expect(imagesBg).not.toBe('rgba(0, 0, 0, 0)');

  // react/ row should NOT have hover
  const reactRow = page.locator('.ft-children .ft-item.ft-directory:has(.ft-name:text("react"))').locator(':scope > .ft-row');
  const reactBg = await reactRow.evaluate(el => getComputedStyle(el).backgroundColor);
  expect(reactBg === 'rgba(0, 0, 0, 0)' || reactBg === 'transparent').toBeTruthy();

  // programming/ row should NOT have hover
  const progRow = page.locator('.ft-list > .ft-item.ft-directory:has(.ft-name:text("programming"))').locator(':scope > .ft-row');
  const progBg = await progRow.evaluate(el => getComputedStyle(el).backgroundColor);
  expect(progBg === 'rgba(0, 0, 0, 0)' || progBg === 'transparent').toBeTruthy();
});

test('hovering in ft-children gap does not highlight parent', async ({ page }) => {
  await expandDir(page, 'src');

  const srcDir = page.locator('.ft-list > .ft-item.ft-directory:has(.ft-name:text("src"))');
  const srcChildren = srcDir.locator(':scope > .ft-children');
  const box = await srcChildren.boundingBox();
  expect(box).not.toBeNull();

  const lastItem = srcChildren.locator(':scope > .ft-item').last();
  const lastBox = await lastItem.boundingBox();
  const gapY = lastBox ? lastBox.y + lastBox.height + 2 : box!.y + box!.height - 2;
  await page.mouse.move(box!.x + box!.width / 2, gapY);
  await page.waitForTimeout(100);

  const srcRow = srcDir.locator(':scope > .ft-row');
  const bg = await srcRow.evaluate(el => getComputedStyle(el).backgroundColor);
  expect(bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent').toBeTruthy();
});
