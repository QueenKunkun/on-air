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

async function openSearch(page: Page) {
	await page.locator('.ft-tab', { hasText: 'Search' }).click();
	await expect(page.locator('.fs-root .fs-input')).toBeVisible({ timeout: 3000 });
}

test('search tab: typing a query returns grouped file results', async ({ page }) => {
	await openSearch(page);
	await page.fill('.fs-root .fs-input', 'file');
	await page.waitForSelector('.fs-root .fs-match', { timeout: 10000 });
	const matchCount = await page.locator('.fs-root .fs-match').count();
	expect(matchCount).toBeGreaterThan(0);
	// Results are grouped under file headers.
	const fileHeaders = await page.locator('.fs-root .fs-file').count();
	expect(fileHeaders).toBeGreaterThan(0);
	// The matched term is highlighted.
	await expect(page.locator('.fs-root .fs-text mark').first()).toBeVisible();
});

test('search tab: glob filter restricts matches to matching extensions', async ({ page }) => {
	await openSearch(page);
	await page.fill('.fs-root .fs-input', 'file');
	await page.waitForSelector('.fs-root .fs-match', { timeout: 10000 });
	const before = await page.locator('.fs-root .fs-match').count();
	expect(before).toBeGreaterThan(0);

	await page.fill('.fs-root .fs-glob', '*.md');
	await page.waitForTimeout(600);
	const after = await page.locator('.fs-root .fs-match').count();
	expect(after).toBeLessThan(before);
	const afterFiles = await page.locator('.fs-root .fs-file-path').allTextContents();
	for (const p of afterFiles) {
		expect(p.trim().endsWith('.md')).toBeTruthy();
	}
});

test('search tab: clicking a match opens the file at the highlighted line', async ({ page }) => {
	await openSearch(page);
	await page.fill('.fs-root .fs-input', 'file');
	await page.waitForSelector('.fs-root .fs-match', { timeout: 10000 });
	await page.locator('.fs-root .fs-match').first().click();
	// The content pane switches to the raw code view with the matched line highlighted.
	await expect(page.locator('.file-code')).toBeVisible({ timeout: 5000 });
	await expect(page.locator('.fl-hl')).toHaveCount(1, { timeout: 5000 });
	// Back button returns to the rendered preview.
	await page.locator('.file-view-header button').click();
	await expect(page.locator('.markdown-body')).toBeVisible({ timeout: 5000 });
});
