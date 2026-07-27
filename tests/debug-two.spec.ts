import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const infoPath = path.join(__dirname, '.server-info.json');
let baseUrl: string;
let docId: string;
let docId2: string;

test.beforeAll(() => {
  const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
  baseUrl = info.baseUrl;
  docId = info.id;
  docId2 = info.id2;
});

test('debug: image click', async ({ page }) => {
  await page.goto(`${baseUrl}/preview/${docId}`);
  await page.waitForSelector('.ft-list', { timeout: 5000 });

  // Expand programming
  await page.click('.ft-list > .ft-item.ft-directory:has(.ft-name:text("programming"))');
  await page.waitForTimeout(500);

  // Expand react
  await page.click('.ft-item.ft-directory:has(.ft-name:text("react"))');
  await page.waitForTimeout(500);

  // Expand images
  await page.click('.ft-item.ft-directory:has(.ft-name:text("images"))');
  await page.waitForTimeout(500);

  // Check if photo.png is visible
  const imgFile = page.locator('.ft-item.ft-file:has(.ft-name:text("photo.png"))');
  const visible = await imgFile.isVisible();
  console.log('photo.png visible:', visible);

  if (visible) {
    await imgFile.click();
    await page.waitForTimeout(1000);

    // Check what's in #content
    const contentHtml = await page.evaluate(() => {
      const el = document.getElementById('content');
      return el ? el.innerHTML.slice(0, 500) : 'NO #content';
    });
    console.log('content innerHTML:', contentHtml);

    const fileViewCount = await page.locator('#content .file-view').count();
    console.log('.file-view count:', fileViewCount);
  }
});

test('debug: expand scroll', async ({ page }) => {
  await page.goto(`${baseUrl}/preview/${docId2}`);
  await page.waitForSelector('.ft-list', { timeout: 5000 });

  // Wait for expansion
  await expect(page.locator('.ft-item.ft-current')).toHaveCount(1, { timeout: 5000 });

  const scrollContainer = page.locator('.ft-scroll');
  const scrollInfo = await scrollContainer.evaluate(el => ({
    scrollTop: el.scrollTop,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  console.log('scroll info:', JSON.stringify(scrollInfo));

  // Check current file position
  const currentBox = await page.locator('.ft-item.ft-current').boundingBox();
  const scrollBox = await scrollContainer.boundingBox();
  console.log('currentBox:', JSON.stringify(currentBox));
  console.log('scrollBox:', JSON.stringify(scrollBox));
});
