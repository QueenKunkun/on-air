import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const infoPath = path.join(__dirname, '.server-info.json');
let baseUrl: string;
let mermaidId: string;

// Stub mermaid so tests never hit the CDN. Mimics the real API surface the
// component uses: initialize({...}) + run({ nodes }) that renders an <svg> into
// each node and marks it data-processed.
async function openWithStub(page: import('@playwright/test').Page) {
	await page.addInitScript(() => {
		(window as any).__mmRenders = 0;
		(window as any).__mmTheme = null;
		(window as any).mermaid = {
			initialize(opts: { theme?: string }) { (window as any).__mmTheme = opts?.theme ?? null; },
			run({ nodes }: { nodes: HTMLElement[] }) {
				for (const n of nodes) {
					n.setAttribute('data-processed', 'true');
					n.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="mm-svg"></svg>';
				}
				(window as any).__mmRenders += 1;
				return Promise.resolve();
			}
		};
	});
	await page.goto(`${baseUrl}/preview/${mermaidId}`);
	await page.waitForSelector('div.mermaid[data-processed]', { timeout: 5000 });
}

test.beforeAll(() => {
	const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
	baseUrl = info.baseUrl;
	mermaidId = info.mermaidId;
});

test('mermaid fences render into svg diagrams', async ({ page }) => {
	await openWithStub(page);
	await expect(page.locator('#content pre.mermaid')).toHaveCount(0);
	const divs = page.locator('#content div.mermaid');
	await expect(divs).toHaveCount(2);
	await expect(divs.first().locator('svg.mm-svg')).toBeAttached();
	// Source is preserved for theme re-renders
	await expect(divs.first()).toHaveAttribute('data-mermaid-src', /flowchart/);
});

test('non-mermaid code blocks are unaffected', async ({ page }) => {
	await openWithStub(page);
	const block = page.locator('#content pre.hljs');
	await expect(block).toHaveCount(1);
	await expect(block.locator('code')).toContainText('print("hello")');
});

test('mermaid re-renders with the matching theme on theme change', async ({ page }) => {
	await openWithStub(page);
	await expect.poll(() => page.evaluate(() => (window as any).__mmTheme)).toBe('default');
	const rendersBefore = await page.evaluate(() => (window as any).__mmRenders);

	await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'vscode-dark'));
	await expect.poll(() => page.evaluate(() => (window as any).__mmTheme)).toBe('dark');
	await expect.poll(() => page.evaluate(() => (window as any).__mmRenders)).toBeGreaterThan(rendersBefore);

	// Diagrams still carry their source and a fresh svg
	await expect(page.locator('#content div.mermaid[data-processed]')).toHaveCount(2);
	await expect(page.locator('#content div.mermaid svg.mm-svg')).toHaveCount(2);
});

test('mermaid falls back to raw source when the library cannot load', async ({ page }) => {
	await page.route('**/mermaid*.js', route => route.abort());
	await page.goto(`${baseUrl}/preview/${mermaidId}`);
	await expect(page.locator('#content pre.mermaid')).toHaveCount(2);
	await expect(page.locator('#content pre.mermaid').first()).toContainText('flowchart TB');
	await expect(page.locator('#content div.mermaid')).toHaveCount(0);
});