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

test('filename search: typing a query returns matching files', async ({ page }) => {
	await openSearch(page);
	await page.fill('.fs-root .fs-input', '.md');
	await page.waitForSelector('.fs-root .fs-file', { timeout: 5000 });
	const fileCount = await page.locator('.fs-root .fs-file').count();
	expect(fileCount).toBeGreaterThan(0);
	// The matched part is highlighted.
	await expect(page.locator('.fs-root .fs-file-name mark').first()).toBeVisible();
});

test('filename search: no results shows empty state', async ({ page }) => {
	await openSearch(page);
	await page.fill('.fs-root .fs-input', 'zzz_nonexistent_zzz');
	await expect(page.locator('.fs-root .fs-empty')).toBeVisible({ timeout: 5000 });
});

test('filename search: clicking a result opens the file', async ({ page }) => {
	await openSearch(page);
	await page.fill('.fs-root .fs-input', 'README');
	await page.waitForSelector('.fs-root .fs-file', { timeout: 5000 });
	await page.locator('.fs-root .fs-file').first().click();
	await expect(page.locator('.markdown-body, .file-code')).toBeVisible({ timeout: 5000 });
});
