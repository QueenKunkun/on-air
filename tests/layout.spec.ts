import { test, expect } from '@playwright/test';
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
  // Clear persisted panel state
  await page.evaluate(() => {
    localStorage.removeItem('onair-files-collapsed');
    localStorage.removeItem('onair-toc-collapsed');
    localStorage.removeItem('onair-files-width');
    localStorage.removeItem('onair-toc-width');
  });
  await page.reload();
  await page.waitForSelector('.ft-list', { timeout: 5000 });
});

test('banner theme select changes theme', async ({ page }) => {
  const themeSelect = page.locator('#themeSelect');
  await expect(themeSelect).toBeVisible();
  // Change theme
  await themeSelect.selectOption('vscode-dark');
  await page.waitForTimeout(200);
  const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  expect(theme).toBe('vscode-dark');
  // Change back
  await themeSelect.selectOption('auto');
  await page.waitForTimeout(200);
  const theme2 = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  expect(theme2).toBeNull();
});

test('banner font size controls work', async ({ page }) => {
  const fsInput = page.locator('#fsInput');
  await expect(fsInput).toBeVisible();
  // Click decrease
  await page.click('#fsDec');
  await page.waitForTimeout(200);
  const val = await fsInput.inputValue();
  expect(parseInt(val)).toBe(14);
  // Click reset
  await page.click('#fsReset');
  await page.waitForTimeout(200);
  const val2 = await fsInput.inputValue();
  expect(parseInt(val2)).toBe(16);
});

test('banner font size direct input works', async ({ page }) => {
  const fsInput = page.locator('#fsInput');
  await expect(fsInput).toBeVisible();
  // Type a custom value
  await fsInput.fill('20');
  await fsInput.press('Enter');
  await page.waitForTimeout(200);
  const val = await fsInput.inputValue();
  expect(parseInt(val)).toBe(20);
  // Verify it clamps to max 28
  await fsInput.fill('30');
  await fsInput.press('Enter');
  await page.waitForTimeout(200);
  const val2 = await fsInput.inputValue();
  expect(parseInt(val2)).toBe(28);
  // Verify it clamps to min 12
  await fsInput.fill('5');
  await fsInput.press('Enter');
  await page.waitForTimeout(200);
  const val3 = await fsInput.inputValue();
  expect(parseInt(val3)).toBe(12);
});

test('banner scrollbar width controls work', async ({ page }) => {
  const sbInput = page.locator('#sbInput');
  await expect(sbInput).toBeVisible();
  // Click decrease
  await page.click('#sbDec');
  await page.waitForTimeout(200);
  const val = await sbInput.inputValue();
  expect(parseInt(val)).toBe(12);
  // Click reset
  await page.click('#sbReset');
  await page.waitForTimeout(200);
  const val2 = await sbInput.inputValue();
  expect(parseInt(val2)).toBe(16);
});

test('banner scrollbar direct input works', async ({ page }) => {
  const sbInput = page.locator('#sbInput');
  await expect(sbInput).toBeVisible();
  // Type a custom value
  await sbInput.fill('24');
  await sbInput.press('Enter');
  await page.waitForTimeout(200);
  const val = await sbInput.inputValue();
  expect(parseInt(val)).toBe(24);
});

test('banner max width direct input works', async ({ page }) => {
  const mwInput = page.locator('#mwInput');
  await expect(mwInput).toBeVisible();
  // Type a custom value
  await mwInput.fill('600');
  await mwInput.press('Enter');
  await page.waitForTimeout(200);
  const val = await mwInput.inputValue();
  expect(parseInt(val)).toBe(600);
  // Verify 0 means no limit
  await mwInput.fill('0');
  await mwInput.press('Enter');
  await page.waitForTimeout(200);
  const val2 = await mwInput.inputValue();
  expect(parseInt(val2)).toBe(0);
});

test('files toggle collapses and expands panel', async ({ page }) => {
  const filesSide = page.locator('#filesSide');
  const toggle = page.locator('#filesResizer .panel-toggle');
  await expect(toggle).toBeVisible();

  // Click toggle to collapse
  await toggle.click();
  await page.waitForTimeout(300);
  const isCollapsed = await filesSide.evaluate(el => el.classList.contains('collapsed'));
  expect(isCollapsed).toBe(true);

  // Click edge handle to expand
  const edgeHandle = page.locator('#edgeHandles [data-panel="files"]');
  await expect(edgeHandle).toBeVisible();
  await edgeHandle.click();
  await page.waitForTimeout(300);
  const isCollapsed2 = await filesSide.evaluate(el => el.classList.contains('collapsed'));
  expect(isCollapsed2).toBe(false);
});

test('toc toggle collapses and expands panel', async ({ page }) => {
  const tocCol = page.locator('#tocCol');
  const toggle = page.locator('#tocResizer .panel-toggle');
  await expect(toggle).toBeVisible();

  // Click toggle to collapse
  await toggle.click();
  await page.waitForTimeout(300);
  const isCollapsed = await tocCol.evaluate(el => el.classList.contains('collapsed'));
  expect(isCollapsed).toBe(true);

  // Click edge handle to expand
  const edgeHandle = page.locator('#edgeHandles [data-panel="toc"]');
  await expect(edgeHandle).toBeVisible();
  await edgeHandle.click();
  await page.waitForTimeout(300);
  const isCollapsed2 = await tocCol.evaluate(el => el.classList.contains('collapsed'));
  expect(isCollapsed2).toBe(false);
});

test('files resizer drag changes width', async ({ page }) => {
  const filesSide = page.locator('#filesSide');
  const resizer = page.locator('#filesResizer');
  await expect(resizer).toBeVisible();

  const beforeWidth = await filesSide.evaluate(el => el.offsetWidth);
  // Drag resizer to the right
  const box = await resizer.boundingBox();
  if (!box) throw new Error('resizer not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 50, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(200);

  const afterWidth = await filesSide.evaluate(el => el.offsetWidth);
  expect(afterWidth).toBeGreaterThan(beforeWidth);
});
