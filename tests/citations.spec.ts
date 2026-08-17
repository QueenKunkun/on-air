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
		localStorage.removeItem('onair-annot-hover');
	});
	await page.goto(`${baseUrl}/preview/${docId}`);
	await page.waitForSelector('.onair-citation', { timeout: 5000 });
});

test('citations render as inline links by default', async ({ page }) => {
	await expect(page.locator('.onair-citation').first()).toBeVisible();
	await expect(page.locator('sup.cite-ref').first()).not.toBeVisible();
	// References section stays in place.
	await expect(page.locator('#references')).toBeVisible();
});

test('cite style toggle switches to superscript cite-refs via WebSocket', async ({ page }) => {
	const btn = page.locator('#citeStyleBtn');
	await expect(btn).toBeVisible();
	await btn.click();
	await page.waitForSelector('sup.cite-ref', { timeout: 5000 });
	await expect(page.locator('sup.cite-ref').first()).toBeVisible();
	// Original numbers preserved, no footnote refs.
	await expect(page.locator('sup.cite-ref a[href="#ref-3"]')).toBeVisible();
	await expect(page.locator('.footnote-ref').first()).not.toBeVisible();
	// References section still in place, not converted to footnotes.
	await expect(page.locator('#references')).toBeVisible();
	// Button reflects the active style.
	await expect(btn).toHaveText('¹');
});

test('cite style toggle switches back to inline links', async ({ page }) => {
	const btn = page.locator('#citeStyleBtn');
	await btn.click();
	await page.waitForSelector('sup.cite-ref', { timeout: 5000 });
	await btn.click();
	await page.waitForSelector('.onair-citation', { timeout: 5000 });
	await expect(page.locator('sup.cite-ref').first()).not.toBeVisible();
	await expect(btn).toHaveText('[1]');
});

test('cite style persists across reloads', async ({ page }) => {
	const btn = page.locator('#citeStyleBtn');
	await btn.click();
	await page.waitForSelector('sup.cite-ref', { timeout: 5000 });

	await page.reload();
	await page.waitForSelector('sup.cite-ref', { timeout: 5000 });
	await expect(page.locator('#citeStyleBtn')).toHaveText('¹');
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

test('hovering a citation in footnotes mode shows the reference entry', async ({ page }) => {
	await page.locator('#citeStyleBtn').click();
	await page.waitForSelector('sup.cite-ref', { timeout: 5000 });

	const hoverBtn = page.locator('#hoverBtn');
	await hoverBtn.click();
	await page.waitForTimeout(200);

	const cite = page.locator('sup.cite-ref a.onair-citation[href="#ref-3"]').first();
	await cite.hover();
	await page.waitForSelector('#annot-pop', { timeout: 5000 });
	await expect(page.locator('#annot-pop')).toBeVisible();
	await expect(page.locator('#annot-pop')).toContainText('Ref three');
});
