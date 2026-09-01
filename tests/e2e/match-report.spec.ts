import { expect, test, type Page } from "@playwright/test";

/**
 * Match report flow.
 *
 * This area had no end-to-end coverage at all, which is how the review screen
 * shipped with two independently side-scrolling stat tables and 40px inputs.
 * The overflow assertions below are the direct regression guard for that.
 *
 * Steps past match selection need a configured database (creating a report is
 * a Supabase write), so this suite covers everything reachable without one:
 * authorization, the selection step, search, responsive layout, and honest
 * failure when the write cannot happen. The review, submit, and correction
 * steps are covered by the database contract suites in diese-tech/sal-database
 * and by the unit tests around MatchReportClient.
 */

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 1000 },
  { name: "wide", width: 1920, height: 1080 },
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

test("match report requires an admin session", async ({ page }) => {
  await page.goto("/admin/match-report");
  await expect(page).toHaveURL(/\/admin\/login(\?next=|$)/);
});

test("match report page renders its heading and selection step", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/match-report");
  await expect(page.getByRole("heading", { name: "Match Report" })).toBeVisible();
  await expect(page.getByText("Select a match to report")).toBeVisible();
  await expect(page.getByPlaceholder("Search by team name…")).toBeVisible();
});

test("match report lists selectable matches grouped by division", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/match-report");
  const divisionHeadings = page.getByText(/(Terra|Solar|Lunar) Division/);
  await expect(divisionHeadings.first()).toBeVisible();
  // Every listed match is a button that starts a report.
  const matchButtons = page.getByRole("button", { name: /\bvs\b/ });
  expect(await matchButtons.count()).toBeGreaterThan(0);
});

test("match report search filters the selectable matches", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/match-report");
  const matchButtons = page.getByRole("button", { name: /\bvs\b/ });
  const before = await matchButtons.count();
  expect(before).toBeGreaterThan(0);

  await page.getByPlaceholder("Search by team name…").fill("zzzz-no-such-team");
  await expect.poll(() => matchButtons.count()).toBe(0);

  await page.getByPlaceholder("Search by team name…").fill("");
  await expect.poll(() => matchButtons.count()).toBe(before);
});

test("selecting a match surfaces a readable failure when the write cannot happen", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/match-report");
  await page.getByRole("button", { name: /\bvs\b/ }).first().click();
  // Without a configured database the create call fails; the screen must say so
  // rather than hanging on a spinner or throwing.
  await expect(page.locator("body")).toContainText(/not configured|Unauthorized|Failed|error|unavailable/i, {
    timeout: 15_000,
  });
  await expect(page.getByRole("heading", { name: "Match Report" })).toBeVisible();
});

for (const viewport of viewports) {
  test(`match report has no horizontal overflow at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await adminLogin(page);
    await page.goto("/admin/match-report");
    await expect(page.getByRole("heading", { name: "Match Report" })).toBeVisible();
    await expect.poll(() => hasHorizontalOverflow(page)).toBe(false);
  });
}

/**
 * Drives the client into the review step, where the stat editors actually
 * render. Creating a report is the one Supabase write on the path, so it is
 * stubbed; everything after it — building the blank roster rows, the game
 * tabs, the stat grid — is real client code running against the mock league
 * data the server already serves. Without this the overflow scan below would
 * only ever see the selection step and would pass through the regression it
 * claims to guard.
 */
async function openReviewStep(page: Page) {
  await page.route("**/api/admin/match-reports", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "11111111-1111-4111-8111-111111111111" }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/admin/match-report");
  await page.getByRole("button", { name: /\bvs\b/ }).first().click();
  await page.getByRole("button", { name: /Skip.*Manual Entry/i }).click();
  await expect(page.getByRole("button", { name: /^G1/ })).toBeVisible();
}

test("manual entry reaches the review step and renders both team stat editors", async ({ page }) => {
  await adminLogin(page);
  await openReviewStep(page);

  // Ten roster rows: five a side, each with its stat fields.
  await expect(page.locator('input[aria-label$="IGN"]')).toHaveCount(10);
  await expect(page.locator('input[aria-label$="kills"]')).toHaveCount(10);
  await expect(page.getByRole("button", { name: /Mark winner|✓ Winner/ })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Submit Result" })).toBeVisible();
});

test("review step stat fields are real form controls, not micro-inputs", async ({ page }) => {
  await adminLogin(page);
  await openReviewStep(page);

  // The regression: 0.75rem text in boxes ~40px wide and ~20px tall.
  const box = await page.locator('input[aria-label$="kills"]').first().boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(32);
  expect(box!.width).toBeGreaterThanOrEqual(36);
});

for (const viewport of viewports) {
  test(`no element in the review step scrolls sideways at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await adminLogin(page);
    await openReviewStep(page);

    // The regression this guards: two stat tables rendered narrower than their
    // own min-width, each scrolling independently inside the page.
    const overflowing = await page.evaluate(() =>
      [...document.querySelectorAll("main *")]
        .filter((element) => element.scrollWidth > element.clientWidth + 1)
        .map((element) => element.className?.toString?.().slice(0, 80) ?? ""),
    );
    expect(overflowing).toEqual([]);
    await expect.poll(() => hasHorizontalOverflow(page)).toBe(false);
  });
}

test("review step adds and removes games without breaking the layout", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await adminLogin(page);
  await openReviewStep(page);

  await page.getByRole("button", { name: "+ Game" }).click();
  await expect(page.getByRole("button", { name: /^G2/ })).toBeVisible();
  await expect.poll(() => hasHorizontalOverflow(page)).toBe(false);
});

test("match report page renders no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await adminLogin(page);
  await page.goto("/admin/match-report");
  await expect(page.getByRole("heading", { name: "Match Report" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("private host match review page loads without a valid capability", async ({ page }) => {
  // The host link is one-time and token-bound; an unknown id must render the
  // review shell and fail honestly rather than 500.
  await page.goto("/match-reports/not-a-real-report/review");
  await expect(page.getByRole("heading", { name: /Correct match statistics/i })).toBeVisible();
});
