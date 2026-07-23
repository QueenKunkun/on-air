import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const infoPath = path.join(__dirname, '.server-info.json');
let baseUrl: string;
let docId: string;
let docId2: string;

test.beforeAll(() => {
  const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
  baseUrl = info.baseUrl;
  docId = info.id;
  docId2 = info.id2;
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
});
