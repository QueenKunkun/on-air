import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const infoPath = path.join(__dirname, '.server-info.json');
let baseUrl: string;
let docId: string;

test.beforeAll(() => {
	const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
	baseUrl = info.baseUrl;
	docId = info.citeId;
});

test.beforeEach(async ({ page }) => {
	await page.goto(`${baseUrl}/preview/${docId}`);
	await page.evaluate(() => {
		localStorage.removeItem('onair-cite-style');
	});
	await page.goto(`${baseUrl}/preview/${docId}`);
	await page.waitForSelector('.onair-citation', { timeout: 5000 });
});

test('citations render as links by default', async ({ page }) => {
	await expect(page.locator('.onair-citation').first()).toBeVisible();
	await expect(page.locator('.footnote-ref').first()).not.toBeVisible();
});

test('cite style toggle switches to footnote refs via WebSocket', async ({ page }) => {
	const btn = page.locator('#citeStyleBtn');
	await expect(btn).toBeVisible();
	await btn.click();
	await page.waitForSelector('.footnote-ref', { timeout: 5000 });
	await expect(page.locator('.onair-citation').first()).not.toBeVisible();
	// Footnote bodies appear with reference text.
	await expect(page.locator('.footnote-item').first()).toContainText('Ref three');
	// The button reflects the active style.
	await expect(btn).toHaveText('¹');
});

test('cite style toggle switches back to links', async ({ page }) => {
	const btn = page.locator('#citeStyleBtn');
	await btn.click();
	await page.waitForSelector('.footnote-ref', { timeout: 5000 });
	await btn.click();
	await page.waitForSelector('.onair-citation', { timeout: 5000 });
	await expect(page.locator('.footnote-ref').first()).not.toBeVisible();
	await expect(btn).toHaveText('[1]');
});

test('cite style persists across reloads', async ({ page }) => {
	const btn = page.locator('#citeStyleBtn');
	await btn.click();
	await page.waitForSelector('.footnote-ref', { timeout: 5000 });

	await page.reload();
	// Stored style is re-synced to the server and re-applied.
	await page.waitForSelector('.footnote-ref', { timeout: 5000 });
	await expect(page.locator('.onair-citation').first()).not.toBeVisible();
	await expect(page.locator('#citeStyleBtn')).toHaveText('¹');
});
