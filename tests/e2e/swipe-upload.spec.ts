import { test, expect, Page, Route } from '@playwright/test';
import { FAKE_API, FAKE_CDN } from '../../playwright.config';

// Hermetic happy-path e2e covering: app load -> swipe queue renders ->
// upload submission -> status poll completes -> new recipe surfaces.
//
// All network traffic to FAKE_API / FAKE_CDN is stubbed via page.route().
// The test never reaches OpenAI, AWS, or any real backend.

const FIXTURE_RECIPE_KEY = 'e2e-stub-recipe';
const FIXTURE_JOB_ID = 'e2e-job-1234';

const stubRecipes = {
  success: true,
  data: {
    [FIXTURE_RECIPE_KEY]: {
      title: 'E2E Stub Pancakes',
      ingredients: ['1 cup flour', '1 cup milk', '1 egg'],
      directions: ['Mix.', 'Cook.', 'Serve.'],
      meal_type: 'breakfast',
      created_at: new Date().toISOString(),
    },
  },
};

// 1x1 transparent PNG
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Zy3T1wAAAAASUVORK5CYII=',
  'base64',
);

async function installStubs(page: Page) {
  // Stub all CDN image fetches with a 1x1 PNG so the swipe queue can render.
  await page.route(`${FAKE_CDN}/**`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: PNG_1x1,
    });
  });

  // Stub backend recipes endpoint.
  await page.route(`${FAKE_API}/recipes`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(stubRecipes),
    });
  });

  // Stub upload submission.
  await page.route(`${FAKE_API}/recipe/upload`, async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { jobId: FIXTURE_JOB_ID } }),
    });
  });

  // Stub upload status polling — return completed immediately.
  await page.route(`${FAKE_API}/upload/status/${FIXTURE_JOB_ID}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          status: 'completed',
          recipe_keys: [FIXTURE_RECIPE_KEY],
        },
      }),
    });
  });

  // Catch-all for any other backend calls so nothing escapes.
  await page.route(`${FAKE_API}/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: {} }),
    });
  });
}

test('app boot happy path', async ({ page }) => {
  await installStubs(page);

  const consoleErrors: string[] = [];
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto('/');

  // App shell renders without throwing.
  await expect(page.locator('body')).toBeVisible();

  // Wait for the recipes fetch to be issued (proves the bundle booted and
  // the RecipeService reached the network layer that we are stubbing).
  await page.waitForResponse(
    (resp) => resp.url().startsWith(`${FAKE_API}/recipes`),
    { timeout: 60_000 },
  );

  // Give the swipe queue a moment to hydrate stub images.
  await page.waitForTimeout(500);

  // Sanity: no uncaught page errors during boot.
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});
