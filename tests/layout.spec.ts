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
  // Clear persisted panel state before navigating
  await page.goto(`${baseUrl}/preview/${docId}`);
  await page.evaluate(() => {
    localStorage.removeItem('onair-files-collapsed');
    localStorage.removeItem('onair-toc-collapsed');
    localStorage.removeItem('onair-files-width');
    localStorage.removeItem('onair-toc-width');
  });
  await page.goto(`${baseUrl}/preview/${docId}`);
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
  // Click increase multiple times
  await page.click('#fsInc');
  await page.waitForTimeout(200);
  expect(parseInt(await fsInput.inputValue())).toBe(16);
  await page.click('#fsInc');
  await page.waitForTimeout(200);
  expect(parseInt(await fsInput.inputValue())).toBe(18);
  await page.click('#fsInc');
  await page.waitForTimeout(200);
  expect(parseInt(await fsInput.inputValue())).toBe(20);
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
  const toggle = page.locator('#toggle-layer [data-panel="files"]');
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
  const toggle = page.locator('#toggle-layer [data-panel="toc"]');
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
  // Drag resizer to the right (from near top to avoid sticky positioning issues)
  const box = await resizer.boundingBox();
  if (!box) throw new Error('resizer not visible');
  const startY = box.y + 60;
  await page.mouse.move(box.x + box.width / 2, startY);
  await page.mouse.down();
  await page.mouse.move(box.x + 50, startY, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(200);

  const afterWidth = await filesSide.evaluate(el => el.offsetWidth);
  expect(afterWidth).toBeGreaterThan(beforeWidth);
});

test('file tree has visible items with proper scroll height', async ({ page }) => {
  // ft-scroll should have non-zero height (flex layout working)
  const ftScrollHeight = await page.evaluate(() => {
    const el = document.querySelector('.ft-scroll');
    return el ? el.getBoundingClientRect().height : 0;
  });
  expect(ftScrollHeight).toBeGreaterThan(0);

  // ft-scroll height should be most of the filesSide height (not collapsed to just padding)
  const filesSideHeight = await page.evaluate(() => {
    const el = document.getElementById('filesSide');
    return el ? el.getBoundingClientRect().height : 0;
  });
  // ft-scroll should be at least 50% of filesSide (filter bar takes ~30px)
  expect(ftScrollHeight).toBeGreaterThan(filesSideHeight * 0.5);

  // ft-list should be visible with items
  const ftList = page.locator('.ft-list');
  await expect(ftList).toBeVisible();
  const itemCount = await ftList.locator('> .ft-item').count();
  expect(itemCount).toBeGreaterThan(0);
});

test('edge handles are vertically centered and fixed when visible', async ({ page }) => {
  // Collapse files panel to make edge handles visible
  const filesToggle = page.locator('#toggle-layer [data-panel="files"]');
  await filesToggle.click();
  await page.waitForTimeout(300);

  // Edge handles should be visible
  const edgeFiles = page.locator('#edgeHandles [data-panel="files"]');
  await expect(edgeFiles).toBeVisible();

  // Check positioning: should be fixed, centered vertically
  const handleInfo = await page.evaluate(() => {
    const el = document.getElementById('edgeHandles');
    if (!el) return null;
    const s = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      position: s.position,
      display: s.display,
      centerY: rect.top + rect.height / 2,
    };
  });
  expect(handleInfo).not.toBeNull();
  expect(handleInfo!.position).toBe('fixed');
  expect(handleInfo!.display).toBe('flex');

  // Should be vertically centered (within 5px tolerance)
  const winHeight = await page.evaluate(() => window.innerHeight);
  expect(Math.abs(handleInfo!.centerY - winHeight / 2)).toBeLessThan(5);
});

test('toc has scrollable content when headings exist', async ({ page }) => {
  // The test fixture has only 1 heading, so toc-list won't be created
  // But we can verify the TOC container structure is correct
  const tocCol = page.locator('#tocCol');
  await expect(tocCol).toBeVisible();

  // TOC should have the header
  const tocHeader = page.locator('#toc-header');
  await expect(tocHeader).toBeVisible();

  // When toc-list exists, it should be scrollable
  const tocStyles = await page.evaluate(() => {
    const toc = document.getElementById('toc');
    if (!toc) return null;
    const s = getComputedStyle(toc);
    return {
      overflow: s.overflow,
      display: s.display,
      flexDirection: s.flexDirection,
    };
  });
  expect(tocStyles).not.toBeNull();
  expect(tocStyles!.display).toBe('flex');
  expect(tocStyles!.flexDirection).toBe('column');
});

test('TOC rebuilds when content updates via WebSocket', async ({ page }) => {
  const toc = page.locator('#toc');
  await expect(toc).toBeAttached();

  // Initial page has only 1 heading → no tree items (class 'r' = toc row)
  const initialTocItems = await toc.locator('.r').count();
  expect(initialTocItems).toBe(0);

  // Update content via the test endpoint to include 3 headings (1 h1 + 2 h2)
  const newMd = '# Test Project\n\n## Section One\n\nHello world.\n\n## Section Two\n\nMore content.\n';
  const resp = await page.request.post(`${baseUrl}/test/update`, {
    data: JSON.stringify({ html: newMd }),
  });
  expect(resp.ok()).toBeTruthy();

  // Wait for TOC to rebuild with the new headings (3 total: h1 + 2 h2)
  await expect(async () => {
    const items = await toc.locator('.r').count();
    expect(items).toBe(3);
  }).toPass({ timeout: 5000 });

  // Verify section headings are in the TOC
  await expect(toc.locator('.r').nth(1).locator('a')).toContainText('Section One');
  await expect(toc.locator('.r').nth(2).locator('a')).toContainText('Section Two');
});
