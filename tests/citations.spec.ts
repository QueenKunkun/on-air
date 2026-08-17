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
		localStorage.removeItem('onair-annot-hover');
	});
	await page.goto(`${baseUrl}/preview/${docId}`);
	await page.waitForSelector('.onair-citation', { timeout: 5000 });
});

test('citations render as inline links', async ({ page }) => {
	await expect(page.locator('.onair-citation').first()).toBeVisible();
	await expect(page.locator('sup.cite-ref').first()).not.toBeVisible();
	// References section stays in place.
	await expect(page.locator('#references')).toBeVisible();
});

test('hovering a citation shows the reference entry in a popover', async ({ page }) => {
	// Enable hover preview.
	const hoverBtn = page.locator('#hoverBtn');
	await hoverBtn.click();
	await page.waitForTimeout(200);

	const cite = page.locator('a.onair-citation[href="#ref-3"]').first();
	await cite.hover();
	await page.waitForSelector('#annot-pop', { timeout: 5000 });
	await expect(page.locator('#annot-pop')).toBeVisible();
	await expect(page.locator('#annot-pop')).toContainText('Ref three');
});
