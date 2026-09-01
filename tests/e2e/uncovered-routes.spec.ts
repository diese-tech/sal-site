import { expect, test, type Page } from "@playwright/test";

/**
 * Routes that had no end-to-end coverage.
 *
 * Most are token-bound private pages or dynamic detail pages. Without a
 * configured database they cannot show real content, but they must still
 * render their shell and fail honestly instead of 500-ing or hanging — which
 * is exactly what an unguarded route regresses to.
 */

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 1000 },
];

async function adminLogin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Password").fill("test-admin-password");
  await page.getByRole("button", { name: "Enter admin" }).click();
  await expect(page).toHaveURL("/admin");
}

async function hasHorizontalOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
}

// --- Private, token-bound pages ---

const privateRoutes = [
  { path: "/match-reports/not-a-real-report/review", heading: /Correct match statistics/i },
  { path: "/report-a-bug/tickets/not-a-real-ticket", heading: /Private ticket status/i },
];

for (const route of privateRoutes) {
  test(`private route ${route.path} renders its shell for an unknown id`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(route.path);
    await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("auth error page explains a failed sign-in", async ({ page }) => {
  await page.goto("/auth/error");
  await expect(page.getByRole("heading", { name: /Sign-in failed/i })).toBeVisible();
});

test("god draft session page renders for an unknown session", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("/draft/god/not-a-real-session");
  await expect(page.locator("body")).toBeVisible();
  expect(errors).toEqual([]);
});

test("unknown announcement and scouter ids return 404 rather than an error page", async ({ request }) => {
  expect((await request.get("/announcements/not-a-real-announcement")).status()).toBe(404);
  expect((await request.get("/scouters/not-a-real-match")).status()).toBe(404);
});

// --- Admin areas that had no rendering coverage ---

const adminAreas = [
  { path: "/admin/audit", heading: /Pending Deletions/i },
  { path: "/admin/teams", heading: /Teams/i },
  { path: "/admin/seasons", heading: /Seasons/i },
  { path: "/admin/registrations", heading: /Registrations/i },
  { path: "/admin/form-fields", heading: /Form Fields/i },
  { path: "/admin/draft", heading: /Draft/i },
  { path: "/admin/import", heading: /Import/i },
];

for (const area of adminAreas) {
  test(`admin area ${area.path} renders its heading`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await adminLogin(page);
    await page.goto(area.path);
    await expect(page.getByRole("heading", { name: area.heading }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
}

for (const area of adminAreas) {
  for (const viewport of viewports) {
    test(`admin area ${area.path} has no page overflow at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await adminLogin(page);
      await page.goto(area.path);
      await expect(page.getByRole("heading", { name: area.heading }).first()).toBeVisible();
      await expect.poll(() => hasHorizontalOverflow(page)).toBe(false);
    });
  }
}
