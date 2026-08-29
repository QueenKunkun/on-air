import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.ts',
  globalSetup: require.resolve('./tests/global-setup.mjs'),
  globalTeardown: require.resolve('./tests/global-teardown.mjs'),
  timeout: 30_000,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' }, testIgnore: ['**/search.spec.ts'] },
    // Search tests exercise /api/search (ripgrep) which contends with the tree/filter
    // tests on the single shared test server. Run them last, after the others finish,
    // so they never overlap with the tree tests' tight timeouts.
    { name: 'chromium-search', use: { browserName: 'chromium' }, testMatch: '**/search.spec.ts', dependencies: ['chromium'] },
  ],
});
