import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const infoPath = path.join(__dirname, '.server-info.json');
let baseUrl: string;
let pdfId: string;

test.beforeAll(() => {
	const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
	baseUrl = info.baseUrl;
	pdfId = info.pdfId;
});

test('PDF preview page loads with fallback iframe', async ({ page }) => {
	// Stub pdf.js so tests never hit the CDN
	await page.addInitScript(() => {
		(window as any).__pdfJsLoaded = false;
		// Do NOT define pdfjsLib — let it fail so fallback activates
	});

	await page.goto(`${baseUrl}/preview/${pdfId}`);
	await page.waitForLoadState('domcontentloaded');

	// Page should have the PDF container elements
	const container = page.locator('#pdf-container');
	await expect(container).toBeAttached();
	const fallback = page.locator('#pdf-fallback');
	await expect(fallback).toBeAttached();
});

test('PDF raw bytes are served at __raw_pdf__ endpoint', async ({ request }) => {
	const response = await request.get(`${baseUrl}/preview/${pdfId}/__raw_pdf__`);
	expect(response.status()).toBe(200);
	expect(response.headers()['content-type']).toBe('application/pdf');
	const body = await response.body();
	expect(body.length).toBeGreaterThan(0);
});

test('PDF preview page has correct title', async ({ page }) => {
	await page.goto(`${baseUrl}/preview/${pdfId}`);
	await expect(page).toHaveTitle(/Test PDF.*OnAir/);
});
