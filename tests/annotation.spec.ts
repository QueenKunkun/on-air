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
	await page.waitForSelector('.annot-mark', { timeout: 5000 });
});

test('annotations render as right-margin cards anchored to highlights', async ({ page }) => {
	// 5 annotated highlights in the demo (plain highlight has no card).
	const marks = page.locator('.annot-mark');
	await expect(marks).toHaveCount(5);
	await expect(page.locator('.annot-card')).toHaveCount(5);
	// Card content matches the note body.
	await expect(page.locator('.annot-card').first()).toContainText('short inline annotation');
	// The annotation footnote markers keep no visible number (design).
	await expect(page.locator('a[href="#fn4"]')).toHaveCount(1);
	await expect(page.locator('a[href="#fn4"]')).toBeHidden();
});

test('rich annotation card includes all paragraphs', async ({ page }) => {
	const richCard = page.locator('.annot-card', { hasText: 'First paragraph of the rich annotation' });
	await expect(richCard).toContainText('Second paragraph of the same note');
});

test('annotation definitions are removed from the bottom footnote block', async ({ page }) => {
	await expect(page.locator('#footnotes-block li.footnote-item')).toHaveCount(3);
	await expect(page.locator('#fn1, #fn2, #fn3')).toHaveCount(3);
	await expect(page.locator('#fn4, #fn5, #fn6, #fn7, #fn8')).toHaveCount(0);
});

test('plain highlight without a note has no card', async ({ page }) => {
	const plain = page.locator('#content mark', { hasText: 'plain highlight' });
	await expect(plain).toHaveCount(1);
	await expect(plain).not.toHaveClass(/annot-mark/);
});

test('hovering an annotation mark highlights its card', async ({ page }) => {
	await page.locator('#hoverBtn').click();
	await expect(page.locator('#hoverBtn')).toHaveClass(/on/);
	const mark = page.locator('.annot-mark', { hasText: 'first one' });
	await mark.hover();
	await expect(page.locator('.annot-card.active')).toHaveCount(1);
	await expect(page.locator('.annot-card.active')).toContainText('Note A');
});

test('annotation column collapses and expands', async ({ page }) => {
	const side = page.locator('#annotSide');
	await expect(side).toBeVisible();
	await page.locator('#annotToggle').click();
	await expect(side).toHaveClass(/collapsed/);
	await page.locator('#annotToggle').click();
	await expect(side).not.toHaveClass(/collapsed/);
	await expect(side).toBeVisible();
});