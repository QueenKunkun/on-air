import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const infoPath = path.join(__dirname, '.server-info.json');
let baseUrl: string;
let docId: string;

test.beforeAll(() => {
	const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
	baseUrl = info.baseUrl;
	docId = info.demoId;
});

test.beforeEach(async ({ page }) => {
	await page.goto(`${baseUrl}/preview/${docId}`);
	await page.evaluate(() => {
		localStorage.removeItem('onair-annot-collapsed');
		localStorage.removeItem('onair-annot-hover');
		localStorage.removeItem('onair-footnotes-collapsed');
	});
	await page.goto(`${baseUrl}/preview/${docId}`);
	// Wait for the annotation column to be built (client-side routing)
	await page.waitForSelector('.annot-mark', { timeout: 5000 });
});

test('clicking a footnote ref scrolls in place without reloading the page', async ({ page }) => {
	// A reload wipes window state; if the marker survives, no full navigation happened.
	await page.evaluate(() => { (window as any).__noReload = 42; });
	const fn1 = page.locator('a[href="#fn1"]').first();
	await expect(fn1).toBeVisible();
	await fn1.click();
	await page.waitForTimeout(400);
	expect(await page.evaluate(() => (window as any).__noReload)).toBe(42);
	expect(await page.evaluate(() => location.hash)).toBe('#fn1');
	// The footnote body should be scrolled into view.
	const fnBody = page.locator('#fn1');
	await expect(fnBody).toBeInViewport();
});

test('clicking a footnote backref scrolls back without reloading the page', async ({ page }) => {
	await page.evaluate(() => { (window as any).__noReload = 42; });
	// Backref lives in the footnote block at the bottom; click it to jump back up.
	const backref = page.locator('#fn1 a.footnote-backref').first();
	await backref.scrollIntoViewIfNeeded();
	await backref.click();
	await page.waitForTimeout(400);
	expect(await page.evaluate(() => (window as any).__noReload)).toBe(42);
	expect(await page.evaluate(() => location.hash)).toBe('#fnref1');
});