import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const infoPath = path.join(__dirname, '.server-info.json');
let baseUrl: string;
let docId: string;
let docId2: string;
let docId3: string;

test.beforeAll(() => {
  const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
  baseUrl = info.baseUrl;
  docId = info.id;
  docId2 = info.id2;
  docId3 = info.id3;
});

test.describe('expandToCurrentFile', () => {
  test('tree auto-expands to current file on load (programming/react/hello.md)', async ({ page }) => {
    await page.goto(`${baseUrl}/preview/${docId2}`);
    await page.waitForSelector('.ft-list', { timeout: 5000 });

    // programming/ should be expanded (visible as expanded directory)
    const progDir = page.locator('.ft-item.ft-expanded .ft-name:text("programming")');
    await expect(progDir).toBeVisible({ timeout: 3000 });

    // react/ should also be expanded (child of programming)
    const reactDir = page.locator('.ft-item.ft-expanded .ft-name:text("react")');
    await expect(reactDir).toBeVisible({ timeout: 3000 });

    // hello.md should have .ft-current highlight
    const current = page.locator('.ft-item.ft-current');
    await expect(current).toHaveCount(1);
    const text = await current.textContent();
    expect(text).toContain('hello.md');
  });

  test('root entries are all visible alongside expanded path', async ({ page }) => {
    await page.goto(`${baseUrl}/preview/${docId2}`);
    await page.waitForSelector('.ft-list', { timeout: 5000 });

    // Root should show: guide, programming, 读书, README.md
    const rootItems = await page.locator('.ft-list > .ft-item .ft-name').allTextContents();
    expect(rootItems.some(t => t.includes('guide'))).toBeTruthy();
    expect(rootItems.some(t => t.includes('programming'))).toBeTruthy();
    expect(rootItems.some(t => t.includes('读书'))).toBeTruthy();
    expect(rootItems.some(t => t.includes('README.md'))).toBeTruthy();
  });

  test('tree refresh after data-fullpath corruption still shows root entries', async ({ page }) => {
    await page.goto(`${baseUrl}/preview/${docId2}`);
    await page.waitForSelector('.ft-list', { timeout: 5000 });

    // Verify initial expansion is correct
    await expect(page.locator('.ft-item.ft-expanded .ft-name:text("programming")')).toBeVisible({ timeout: 3000 });

    // Corrupt data-fullpath to point to a non-existent sibling directory
    await page.evaluate(() => {
      const ftRoot = document.getElementById('ft-preact-root');
      if (ftRoot) ftRoot.setAttribute('data-fullpath', ftRoot.getAttribute('data-rootdir') + '读书/fake.md');
    });

    // Trigger tree-refresh (simulates filetree-changed WebSocket event)
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('onair:tree-refresh'));
    });

    // Wait for refresh to complete (tree re-renders)
    await page.waitForTimeout(1000);

    // ROOT entries must still be visible — this is the core assertion
    const rootItems = await page.locator('.ft-list > .ft-item .ft-name').allTextContents();
    expect(rootItems.some(t => t.includes('programming'))).toBeTruthy();
    expect(rootItems.some(t => t.includes('README.md'))).toBeTruthy();
  });

  test('tree items count does not drop to 1 after refresh with corrupted path', async ({ page }) => {
    await page.goto(`${baseUrl}/preview/${docId2}`);
    await page.waitForSelector('.ft-list', { timeout: 5000 });

    const countBefore = await page.locator('.ft-list > .ft-item').count();
    expect(countBefore).toBeGreaterThan(1);

    // Corrupt data-fullpath
    await page.evaluate(() => {
      const ftRoot = document.getElementById('ft-preact-root');
      if (ftRoot) ftRoot.setAttribute('data-fullpath', ftRoot.getAttribute('data-rootdir') + '读书/fake.md');
    });

    // Trigger tree-refresh
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('onair:tree-refresh'));
    });

    await page.waitForTimeout(1000);

    // Count must NOT drop to 1
    const countAfter = await page.locator('.ft-list > .ft-item').count();
    expect(countAfter).toBeGreaterThan(1);
  });

  test('current file is scrolled into view after tree expands', async ({ page }) => {
    await page.goto(`${baseUrl}/preview/${docId2}`);
    await page.waitForSelector('.ft-list', { timeout: 5000 });

    // Wait for expansion
    await expect(page.locator('.ft-item.ft-current')).toHaveCount(1, { timeout: 5000 });

    // Wait for auto-scroll (expandToCurrentFile uses double rAF)
    await page.waitForTimeout(1000);

    // Debug: check scroll state
    const scrollInfo = await page.locator('.ft-scroll').evaluate(el => ({
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      offsetHeight: el.offsetHeight,
    }));
    console.log('scrollInfo:', JSON.stringify(scrollInfo));

    // The current file should be visible within the scroll container
    const current = page.locator('.ft-item.ft-current');
    await expect(current).toBeVisible();

    const scrollContainer = page.locator('.ft-scroll');

    // Check that the scroll container scrolled (scrollTop > 0) if tree is tall enough
    const scrolled = await scrollContainer.evaluate(el => el.scrollTop > 0);
    const currentBox = await current.boundingBox();
    const scrollBox = await scrollContainer.boundingBox();

    console.log('scrolled:', scrolled, 'currentBox:', JSON.stringify(currentBox), 'scrollBox:', JSON.stringify(scrollBox));

    // If the tree is tall enough to require scrolling, verify the file is in view
    // Use a meaningful threshold (> 2px) to avoid false positives from subpixel rounding
    if (scrollInfo.scrollHeight - scrollInfo.clientHeight > 2) {
      expect(scrolled).toBeTruthy();
    }

    // Current file must be within the visible scroll area
    expect(currentBox!.y).toBeGreaterThanOrEqual(scrollBox!.y - 2);
    expect(currentBox!.y + currentBox!.height).toBeLessThanOrEqual(scrollBox!.y + scrollBox!.height + 2);
  });

  test('deep tree: current file is scrolled into view (100+ items)', async ({ page }) => {
    // many-dirs has 10 root dirs x 10 subdirs x 1 leaf = 110 items
    // Target: many-dirs/j/j/leaf.md (deep in the tree, near the bottom)
    await page.goto(`${baseUrl}/preview/${docId3}`);
    await page.waitForSelector('.ft-list', { timeout: 5000 });

    // Wait for expansion
    await expect(page.locator('.ft-item.ft-current')).toHaveCount(1, { timeout: 5000 });

    const current = page.locator('.ft-item.ft-current');
    await expect(current).toBeVisible();

    const scrollContainer = page.locator('.ft-scroll');
    const scrollBox = await scrollContainer.boundingBox();
    const currentBox = await current.boundingBox();
    expect(scrollBox).not.toBeNull();
    expect(currentBox).not.toBeNull();

    // Tree must be tall enough to require scrolling
    const scrollHeight = await scrollContainer.evaluate(el => el.scrollHeight);
    expect(scrollHeight).toBeGreaterThan(scrollBox!.height);

    // The scroll container should have scrolled
    const scrollTop = await scrollContainer.evaluate(el => el.scrollTop);
    expect(scrollTop).toBeGreaterThan(0);

    // Current file must be within the visible scroll area
    expect(currentBox!.y).toBeGreaterThanOrEqual(scrollBox!.y - 2);
    expect(currentBox!.y + currentBox!.height).toBeLessThanOrEqual(scrollBox!.y + scrollBox!.height + 2);
  });
});
