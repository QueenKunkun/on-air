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
  // Wait for tree to load
  await page.waitForSelector('.ft-list', { timeout: 5000 });
});

test('tree renders root entries', async ({ page }) => {
  // Should show guide/ and src/ directories, plus README.md
  const items = await page.locator('.ft-list > .ft-item').allTextContents();
  expect(items.some(t => t.includes('guide'))).toBeTruthy();
  expect(items.some(t => t.includes('src'))).toBeTruthy();
  expect(items.some(t => t.includes('README.md'))).toBeTruthy();
});

test('expand directory shows children', async ({ page }) => {
  // Click on src/ directory to expand it
  await page.click('.ft-list > .ft-item.ft-directory:has(.ft-name:text("src"))');
  // Wait for children to appear
  await page.waitForSelector('.ft-children .ft-item');
  const children = await page.locator('.ft-children .ft-item').allTextContents();
  expect(children.some(t => t.includes('index.ts'))).toBeTruthy();
  expect(children.some(t => t.includes('util.js'))).toBeTruthy();
});

test('locate button applies ft-current to current file', async ({ page }) => {
  // Click the locate button
  await page.click('.ft-locate-btn');
  // Wait a bit for async expansion + rAF
  await page.waitForTimeout(500);
  // The current file (README.md) should have .ft-current
  const current = await page.locator('.ft-item.ft-current');
  await expect(current).toHaveCount(1);
  const text = await current.textContent();
  expect(text).toContain('README.md');
});

test('filter hide unsupported removes .wasm files', async ({ page }) => {
  // Verify server returns .wasm when hideBinary is OFF
  const apiRes = await page.evaluate(async (id) => {
    const res = await fetch('/api/tree?id=' + encodeURIComponent(id) + '&dir=src');
    const json = await res.json();
    return json.entries.map((e: any) => e.name);
  }, docId);
  console.log('API src/ (no hideBinary):', apiRes);
  expect(apiRes.some((n: string) => n === 'module.wasm')).toBeTruthy();

  // Verify server hides .wasm when hideBinary is ON
  const apiRes2 = await page.evaluate(async (id) => {
    const res = await fetch('/api/tree?id=' + encodeURIComponent(id) + '&dir=src&hideBinary=1');
    const json = await res.json();
    return json.entries.map((e: any) => e.name);
  }, docId);
  console.log('API src/ (hideBinary ON):', apiRes2);
  expect(apiRes2.some((n: string) => n === 'module.wasm')).toBeFalsy();

  // Expand src/ and verify .wasm is hidden in the tree
  await page.click('.ft-list > .ft-item.ft-directory:has(.ft-name:text("src"))');
  await page.waitForSelector('.ft-children .ft-item');
  const beforeItems = await page.locator('.ft-children .ft-item.ft-file .ft-name').allTextContents();
  console.log('src/ children (hideBinary ON):', beforeItems);
  expect(beforeItems.some(t => t.includes('module.wasm'))).toBeFalsy();

  // Toggle "Hide unsupported" off — .wasm should appear
  await page.click('label:has-text("Hide unsupported") input[type="checkbox"]');
  await page.waitForTimeout(1000);

  // Re-expand src/ after filter toggle collapsed everything
  await page.click('.ft-list > .ft-item.ft-directory:has(.ft-name:text("src"))');
  await page.waitForTimeout(500);

  const afterItems = await page.locator('.ft-children .ft-item.ft-file .ft-name').allTextContents();
  console.log('src/ children (hideBinary OFF):', afterItems);
  expect(afterItems.some(t => t.includes('module.wasm'))).toBeTruthy();
});

test('filter .md shows only markdown files', async ({ page }) => {
  // Check "Hide unsupported" first to clean up (it's checked by default)
  // Toggle .md filter on
  await page.click('label:has-text(".md") input[type="checkbox"]');
  await page.waitForTimeout(500);

  // After toggling .md, only .md files should be in the tree
  const files = await page.locator('.ft-item.ft-file').allTextContents();
  for (const f of files) {
    expect(f.trim().endsWith('.md') || f.trim().endsWith('.markdown')).toBeTruthy();
  }
  // README.md should still be there
  expect(files.some(t => t.includes('README.md'))).toBeTruthy();
});

test('filter toggle does not empty the tree (regression)', async ({ page }) => {
  // Toggle "Hide unsupported" — tree should NOT become empty
  await page.click('label:has-text("Hide unsupported") input[type="checkbox"]');
  await page.waitForTimeout(500);

  // Tree should still have items
  const items = await page.locator('.ft-list .ft-item').count();
  expect(items).toBeGreaterThan(0);
});

test('gitignore filter hides .log files when checked', async ({ page }) => {
  // debug.log is in fixture root. With gitignore ON (*.log), it should be hidden.
  // With gitignore OFF, it should appear.
  const filesBefore = await page.locator('.ft-item.ft-file .ft-name').allTextContents();
  console.log('Files (gitignore ON):', filesBefore);
  expect(filesBefore.some(t => t.includes('debug.log'))).toBeFalsy();

  // Uncheck gitignore — tree should re-fetch and show debug.log
  await page.locator('.ft-filter label:has-text(".gitignore") input[type="checkbox"]').click();
  await page.waitForTimeout(1000);

  const filesAfter = await page.locator('.ft-item.ft-file .ft-name').allTextContents();
  console.log('Files (gitignore OFF):', filesAfter);
  expect(filesAfter.some(t => t.includes('debug.log'))).toBeTruthy();
});

test('mdOnly filter hides non-.md files', async ({ page }) => {
  // Initially: should see non-.md files like README.md (root), and directories
  // Toggle mdOnly on: only .md files remain
  const mdCheckbox = page.locator('.ft-filter label:has-text(".md") input[type="checkbox"]');
  await mdCheckbox.click();
  await page.waitForTimeout(500);

  const files = await page.locator('.ft-item.ft-file .ft-name').allTextContents();
  console.log('Files with mdOnly ON:', files);
  for (const f of files) {
    expect(f.trim().endsWith('.md')).toBeTruthy();
  }
});

test('hide unsupported keeps images visible, hides .wasm', async ({ page }) => {
  // programming/react/images/ has photo.png (image) and readme.txt (text)
  // programming/react/ also has hello.md
  // Expand the directory
  await page.click('.ft-list > .ft-item.ft-directory:has(.ft-name:text("programming"))');
  await page.waitForTimeout(300);
  await page.click('.ft-children .ft-item.ft-directory:has(.ft-name:text("react"))');
  await page.waitForTimeout(300);
  await page.click('.ft-children .ft-children .ft-item.ft-directory:has(.ft-name:text("images"))');
  await page.waitForTimeout(500);

  // With hideBinary ON (default): images are always visible, .wasm is hidden
  const imagesDir = page.locator('.ft-item.ft-directory:has(.ft-name:text("images"))');
  const childrenOn = await imagesDir.locator('.ft-children .ft-item.ft-file .ft-name').allTextContents();
  console.log('images/ children (hideBinary ON):', childrenOn);
  expect(childrenOn.some(t => t.includes('readme.txt'))).toBeTruthy();
  expect(childrenOn.some(t => t.includes('photo.png'))).toBeTruthy(); // images always visible

  // Also verify .wasm is hidden in src/
  await page.click('.ft-list > .ft-item.ft-directory:has(.ft-name:text("src"))');
  await page.waitForTimeout(500);
  const srcDir = page.locator('.ft-list > .ft-item.ft-directory:has(.ft-name:text("src"))');
  const srcChildren = await srcDir.locator('.ft-children .ft-item.ft-file .ft-name').allTextContents();
  console.log('src/ children (hideBinary ON):', srcChildren);
  expect(srcChildren.some(t => t.includes('module.wasm'))).toBeFalsy(); // unsupported hidden
  expect(srcChildren.some(t => t.includes('util.js'))).toBeTruthy(); // supported visible
});

test('toggling filter does not restore previously expanded dirs', async ({ page }) => {
  // Expand src/ directory
  await page.click('.ft-list > .ft-item.ft-directory:has(.ft-name:text("src"))');
  await page.waitForSelector('.ft-children .ft-item');
  const childrenBefore = await page.locator('.ft-children .ft-item').count();
  expect(childrenBefore).toBeGreaterThan(0);

  // Toggle a filter — tree should re-render and collapse everything
  const giCheckbox = page.locator('.ft-filter label:has-text(".gitignore") input[type="checkbox"]');
  await giCheckbox.click();
  await page.waitForTimeout(500);

  // src/ should be collapsed again (no children visible)
  const childrenAfter = await page.locator('.ft-children .ft-item').count();
  console.log('Children after filter toggle:', childrenAfter);
  expect(childrenAfter).toBe(0);
});

test('clicking image file shows image preview', async ({ page }) => {
  // Expand programming/react/images/
  await page.click('.ft-list > .ft-item.ft-directory:has(.ft-name:text("programming"))');
  await page.waitForTimeout(300);
  await page.click('.ft-children .ft-item.ft-directory:has(.ft-name:text("react"))');
  await page.waitForTimeout(300);
  await page.click('.ft-children .ft-children .ft-item.ft-directory:has(.ft-name:text("images"))');
  await page.waitForTimeout(500);

  // Click photo.png
  const imgFile = page.locator('.ft-children .ft-children .ft-item.ft-file:has(.ft-name:text("photo.png"))');
  await expect(imgFile).toBeVisible();
  await imgFile.click();
  await page.waitForTimeout(500);

  // Should show the file-view with an <img>, not "Binary file"
  const fileView = page.locator('#content .file-view');
  await expect(fileView).toBeVisible();
  const img = fileView.locator('img');
  await expect(img).toBeVisible();
  const src = await img.getAttribute('src');
  expect(src).toContain('photo.png');
  // Should NOT show "Binary file" message
  expect(await fileView.locator('.file-binary').count()).toBe(0);
});

test('hovering file does not highlight parent directory', async ({ page }) => {
  // Expand src/ directory
  await page.click('.ft-list > .ft-item.ft-directory:has(.ft-name:text("src"))');
  await page.waitForSelector('.ft-children .ft-item');

  const fileItem = page.locator('.ft-children .ft-item.ft-file').first();
  await expect(fileItem).toBeVisible();

  // Hover over the file child
  await fileItem.hover();
  await page.waitForTimeout(100);

  // Parent directory's .ft-row should NOT have hover background
  const parentDir = page.locator('.ft-list > .ft-item.ft-directory:has(.ft-name:text("src"))');
  const parentRow = parentDir.locator(':scope > .ft-row');
  const bg = await parentRow.evaluate(el => getComputedStyle(el).backgroundColor);
  console.log('Parent row bg on file hover:', bg);
  expect(bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent').toBeTruthy();
});

test('hovering subdirectory does not highlight parent', async ({ page }) => {
  // programming/ contains react/ which contains images/
  // Expand programming/ then react/
  await page.click('.ft-list > .ft-item.ft-directory:has(.ft-name:text("programming"))');
  await page.waitForTimeout(500);
  await page.click('.ft-children .ft-item.ft-directory:has(.ft-name:text("react"))');
  await page.waitForTimeout(500);

  // Hover over images/ (3rd level)
  const imagesDir = page.locator('.ft-children .ft-children .ft-item.ft-directory:has(.ft-name:text("images"))');
  await expect(imagesDir).toBeVisible();
  await imagesDir.hover();
  await page.waitForTimeout(100);

  // images/'s own .ft-row SHOULD have hover background
  const imagesRow = imagesDir.locator(':scope > .ft-row');
  const imagesBg = await imagesRow.evaluate(el => getComputedStyle(el).backgroundColor);
  console.log('images/ own row bg:', imagesBg);
  expect(imagesBg).not.toBe('rgba(0, 0, 0, 0)');

  // react/'s .ft-row should NOT have hover background
  const reactDir = page.locator('.ft-children .ft-item.ft-directory:has(.ft-name:text("react"))');
  const reactRow = reactDir.locator(':scope > .ft-row');
  const reactBg = await reactRow.evaluate(el => getComputedStyle(el).backgroundColor);
  console.log('react/ row bg on images/ hover:', reactBg);
  expect(reactBg === 'rgba(0, 0, 0, 0)' || reactBg === 'transparent').toBeTruthy();

  // programming/'s .ft-row should NOT have hover background
  const progDir = page.locator('.ft-list > .ft-item.ft-directory:has(.ft-name:text("programming"))');
  const progRow = progDir.locator(':scope > .ft-row');
  const progBg = await progRow.evaluate(el => getComputedStyle(el).backgroundColor);
  console.log('programming/ row bg on images/ hover:', progBg);
  expect(progBg === 'rgba(0, 0, 0, 0)' || progBg === 'transparent').toBeTruthy();
});

test('hovering in ft-children gap does not highlight parent', async ({ page }) => {
  // The real-world scenario: mouse passes through the gap between items
  await page.click('.ft-list > .ft-item.ft-directory:has(.ft-name:text("src"))');
  await page.waitForSelector('.ft-children .ft-item');

  const srcDir = page.locator('.ft-list > .ft-item.ft-directory:has(.ft-name:text("src"))');
  const srcChildren = srcDir.locator(':scope > .ft-children');
  const box = await srcChildren.boundingBox();
  expect(box).not.toBeNull();

  // Hover in the gap below the last child item
  const lastItem = srcChildren.locator(':scope > .ft-item').last();
  const lastBox = await lastItem.boundingBox();
  const gapY = lastBox ? lastBox.y + lastBox.height + 2 : box!.y + box!.height - 2;
  await page.mouse.move(box!.x + box!.width / 2, gapY);
  await page.waitForTimeout(100);

  // Parent's .ft-row should NOT have hover background
  const srcRow = srcDir.locator(':scope > .ft-row');
  const bg = await srcRow.evaluate(el => getComputedStyle(el).backgroundColor);
  console.log('src/ row bg on gap hover:', bg);
  expect(bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent').toBeTruthy();
});

test('search *.md shows only markdown files', async ({ page }) => {
  // Before search: should see non-.md files
  const beforeFiles = await page.locator('.ft-item.ft-file .ft-name').allTextContents();
  expect(beforeFiles.some(t => t.includes('README.md'))).toBeTruthy();

  // Type *.md in search
  const search = page.locator('.ft-search');
  await search.fill('*.md');
  await page.waitForTimeout(300);

  // Only .md files should be visible, directories still visible
  const files = await page.locator('.ft-item.ft-file .ft-name').allTextContents();
  console.log('Files after *.md search:', files);
  for (const f of files) {
    expect(f.trim().endsWith('.md')).toBeTruthy();
  }
  // Directories should still be visible
  const dirs = await page.locator('.ft-item.ft-directory .ft-name').allTextContents();
  expect(dirs.length).toBeGreaterThan(0);
});

test('search *.svg shows only svg files', async ({ page }) => {
  // No .svg files in fixture, so search should show no files
  const search = page.locator('.ft-search');
  await search.fill('*.svg');
  await page.waitForTimeout(300);

  const files = await page.locator('.ft-item.ft-file .ft-name').allTextContents();
  console.log('Files after *.svg search:', files);
  expect(files.length).toBe(0);
  // Directories should still be visible
  const dirs = await page.locator('.ft-item.ft-directory .ft-name').allTextContents();
  expect(dirs.length).toBeGreaterThan(0);
});

test('Escape clears search and restores all files', async ({ page }) => {
  // Search for *.md
  const search = page.locator('.ft-search');
  await search.fill('*.md');
  await page.waitForTimeout(300);

  const filtered = await page.locator('.ft-item.ft-file .ft-name').allTextContents();
  expect(filtered.every(t => t.trim().endsWith('.md'))).toBeTruthy();

  // Press Escape
  await search.press('Escape');
  await page.waitForTimeout(300);

  // Search input should be cleared
  expect(await search.inputValue()).toBe('');

  // Root-level non-.md files should be back (README.md is at root)
  const restored = await page.locator('.ft-item.ft-file .ft-name').allTextContents();
  console.log('Files after Escape:', restored);
  expect(restored.some(t => t.includes('README.md'))).toBeTruthy();
});

test('search with no match shows only directories', async ({ page }) => {
  const search = page.locator('.ft-search');
  await search.fill('nonexistent_pattern_!!!');
  await page.waitForTimeout(300);

  const files = await page.locator('.ft-item.ft-file .ft-name').allTextContents();
  expect(files.length).toBe(0);
  const dirs = await page.locator('.ft-item.ft-directory .ft-name').allTextContents();
  expect(dirs.length).toBeGreaterThan(0);
});

test('search hides expanded directories with no matching children', async ({ page }) => {
  // Expand src/ which has index.ts, util.js, module.wasm (no .md files)
  await page.click('.ft-list > .ft-item.ft-directory:has(.ft-name:text("src"))');
  await page.waitForSelector('.ft-children .ft-item');
  const srcBefore = await page.locator('.ft-list > .ft-item.ft-directory:has(.ft-name:text("src"))').count();
  expect(srcBefore).toBe(1);

  // Search *.md — src/ has no .md files, should be hidden
  const search = page.locator('.ft-search');
  await search.fill('*.md');
  await page.waitForTimeout(500);

  const srcAfter = await page.locator('.ft-list > .ft-item.ft-directory:has(.ft-name:text("src"))').count();
  console.log('src/ visible after *.md search:', srcAfter);
  expect(srcAfter).toBe(0);

  // programming/ has app.md, should still be visible
  const progAfter = await page.locator('.ft-list > .ft-item.ft-directory:has(.ft-name:text("programming"))').count();
  expect(progAfter).toBe(1);

  // Clear search — src/ should reappear
  await search.press('Escape');
  await page.waitForTimeout(500);
  const srcRestored = await page.locator('.ft-list > .ft-item.ft-directory:has(.ft-name:text("src"))').count();
  expect(srcRestored).toBe(1);
});
