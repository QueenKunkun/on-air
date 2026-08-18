import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const infoPath = path.join(__dirname, '.server-info.json');
let baseUrl: string;
let mathId: string;

test.beforeAll(() => {
	const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
	baseUrl = info.baseUrl;
	mathId = info.mathId;
});

test.beforeEach(async ({ page }) => {
	await page.goto(`${baseUrl}/preview/${mathId}`);
	await page.waitForSelector('.katex', { timeout: 5000 });
});

test('hovering inline math shows the original LaTeX source', async ({ page }) => {
	const inline = page.locator('#content .katex-html').first();
	await inline.hover();
	const pop = page.locator('#annot-pop.math');
	await expect(pop).toBeVisible();
	await expect(pop.locator('code')).toHaveText('$E = mc^2$');
});

test('hovering display math shows source with $$ delimiters and tag', async ({ page }) => {
	const block = page.locator('#content .katex-display .katex-html').first();
	await block.hover();
	const pop = page.locator('#annot-pop.math');
	await expect(pop).toBeVisible();
	await expect(pop.locator('code')).toContainText('\\Gamma \\vdash t : T_{\\mathit{effect}} \\tag{1}');
	await expect(pop.locator('code')).toHaveText(/\$\$.+\$\$/);
});

test('copy button copies the LaTeX source to the clipboard', async ({ page }) => {
	await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.locator('#content .katex-html').first().hover();
	const pop = page.locator('#annot-pop.math');
	await expect(pop).toBeVisible();

	const copy = pop.locator('.math-copy');
	await copy.click();
	await expect(copy).toHaveText('Copied');

	const clip = await page.evaluate(() => navigator.clipboard.readText());
	expect(clip).toBe('$E = mc^2$');
});

test('math popover hides when the mouse leaves the formula', async ({ page }) => {
	await page.locator('#content .katex-html').first().hover();
	await expect(page.locator('#annot-pop.math')).toBeVisible();
	await page.mouse.move(0, 0);
	await expect(page.locator('#annot-pop.math')).not.toBeVisible();
});

test('popover appears after a short hover delay', async ({ page }) => {
	const inline = page.locator('#content .katex-html').first();
	await inline.hover();
	await expect(page.locator('#annot-pop.math')).not.toBeVisible({ timeout: 150 });
	await expect(page.locator('#annot-pop.math')).toBeVisible({ timeout: 3000 });
});

test('quick pass over a formula does not flash the popover', async ({ page }) => {
	const inline = page.locator('#content .katex-html').first();
	await inline.hover();
	await page.waitForTimeout(120);
	await page.mouse.move(0, 0);
	await expect(page.locator('#annot-pop.math')).not.toBeVisible({ timeout: 1000 });
});

test('sliding to another formula waits the hover delay instead of flashing', async ({ page }) => {
	const first = page.locator('#content .katex-html').first();
	const second = page.locator('#content .katex-html').nth(1);
	const popCode = page.locator('#annot-pop.math code');

	await first.hover();
	await expect(popCode).toHaveText('$E = mc^2$');

	await second.hover();
	await expect(popCode).not.toHaveText(/\$\\Gamma/, { timeout: 150 });
	await expect(popCode).toHaveText(/\$\\Gamma/, { timeout: 3000 });
	await expect(page.locator('#annot-pop.math')).toBeVisible({ timeout: 500 });
});