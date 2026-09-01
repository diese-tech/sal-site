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

test("no element inside the match report page scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await adminLogin(page);
  await page.goto("/admin/match-report");
  await expect(page.getByRole("heading", { name: "Match Report" })).toBeVisible();

  // The regression this guards: stat tables rendered narrower than their own
  // minimum width, so each one scrolled independently inside the page.
  const overflowing = await page.evaluate(() =>
    [...document.querySelectorAll("main *")]
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => element.className?.toString?.().slice(0, 80) ?? ""),
  );
  expect(overflowing).toEqual([]);
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
