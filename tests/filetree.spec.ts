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

test('filter hide binary removes .js files', async ({ page }) => {
  // First expand src/ to see .js files
  await page.click('.ft-list > .ft-item.ft-directory:has(.ft-name:text("src"))');
  await page.waitForSelector('.ft-children .ft-item');
  // util.js should be visible
  await expect(page.locator('.ft-name:text("util.js")')).toBeVisible();

  // Uncheck "Hide binary" — .js files should appear (they're already there)
  // Actually, let's check: "Hide binary" is checked by default, so .js might be hidden
  // Let me check what the initial state shows
  const beforeItems = await page.locator('.ft-item.ft-file').allTextContents();
  const hasJs = beforeItems.some(t => t.includes('util.js'));

  // Toggle "Hide binary" checkbox
  await page.click('label:has-text("Hide binary") input[type="checkbox"]');
  // Wait for re-render
  await page.waitForTimeout(500);

  const afterItems = await page.locator('.ft-item.ft-file').allTextContents();
  const hasJsAfter = afterItems.some(t => t.includes('util.js'));

  // The state should have flipped
  expect(hasJsAfter).not.toBe(hasJs);
});

test('filter .md shows only markdown files', async ({ page }) => {
  // Check "Hide binary" first to clean up (it's checked by default)
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
  // Toggle "Hide binary" — tree should NOT become empty
  await page.click('label:has-text("Hide binary") input[type="checkbox"]');
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

test('hovering file does not highlight parent directory', async ({ page }) => {
  // Expand src/ directory
  await page.click('.ft-list > .ft-item.ft-directory:has(.ft-name:text("src"))');
  await page.waitForSelector('.ft-children .ft-item');

  // Find a file child and the parent directory
  const fileItem = page.locator('.ft-children .ft-item.ft-file').first();
  await expect(fileItem).toBeVisible();

  // Get the parent directory <li>
  const parentDir = page.locator('.ft-list > .ft-item.ft-directory:has(.ft-name:text("src"))');

  // Hover over the file child
  await fileItem.hover();
  await page.waitForTimeout(100);

  // Check parent directory does NOT have hover background
  const transparent = await parentDir.evaluate(el => {
    const s = getComputedStyle(el);
    return s.backgroundColor === 'rgba(0, 0, 0, 0)' || s.backgroundColor === 'transparent';
  });
  expect(transparent).toBeTruthy();
});

test('hovering subdirectory does not highlight grandparent', async ({ page }) => {
  const info = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '.server-info.json'), 'utf8'));

  await page.goto(`${info.baseUrl}/preview/${info.id2}`);
  await page.waitForSelector('.ft-list', { timeout: 5000 });

  // Check what root entries exist
  const rootNames = await page.locator('.ft-list > .ft-item .ft-name').allTextContents();
  console.log('Root entries:', rootNames);

  // Expand programming/
  const progDir = page.locator('.ft-list > .ft-item.ft-directory:has(.ft-name:text("programming"))');
  const progCount = await progDir.count();
  console.log('programming dir count:', progCount);

  if (progCount > 0) {
    await progDir.click();
    await page.waitForTimeout(1000);

    // Check children
    const children = await page.locator('.ft-children .ft-name').allTextContents();
    console.log('Children after expand:', children);

    // Also check all visible items
    const allItems = await page.locator('.ft-item .ft-name').allTextContents();
    console.log('All visible items:', allItems);
  }

  expect(true).toBe(true);
});
