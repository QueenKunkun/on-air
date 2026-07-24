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

  // Should show an <img> element, not "Binary file"
  const img = page.locator('#content img');
  await expect(img).toBeVisible();
  const src = await img.getAttribute('src');
  expect(src).toContain('photo.png');
  expect(await page.locator('#content .file-binary').count()).toBe(0);
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
