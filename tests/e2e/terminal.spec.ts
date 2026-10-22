import { expect, test, type Page } from "@playwright/test";
import { NAV_ITEMS } from "../../src/lib/nav";
import { udiffCsv } from "../fixtures/eod";

const USER = { username: "e2e_owner", password: "e2e-password-123" };

test.describe.configure({ mode: "serial" });

// Reuse one session across tests: the login endpoint is rate limited
// (8 attempts, then 1 per 15 s per user and IP), which a fast suite would trip.
let sessionCookies: Awaited<ReturnType<ReturnType<Page["context"]>["cookies"]>> | null = null;

async function login(page: Page) {
  if (sessionCookies) {
    await page.context().addCookies(sessionCookies);
    await page.goto("/");
    if (!page.url().includes("/login")) return;
  }
  await page.goto("/login");
  await page.fill("#username", USER.username);
  await page.fill("#password", USER.password);
  await page.click("button[type=submit]");
  await page.waitForURL("/");
  sessionCookies = await page.context().cookies();
}

test("first run: redirects to setup, creates the owner account, shows demo-labelled dashboard", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);
  await page.fill("#username", USER.username);
  await page.fill("#displayName", "E2E Owner");
  await page.fill("#password", USER.password);
  await page.fill("#confirm", USER.password);
  await page.click("button[type=submit]");
  await page.waitForURL("/");
  await expect(page.getByText("DEMO DATA — NOT REAL MARKET PRICES")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("link", { name: /NIFTY 50/ }).first()).toBeVisible();
  await expect(page.getByText("Top gainers")).toBeVisible();
  // Setup cannot be used again once an owner exists.
  const res = await page.request.post("/api/auth/setup", { data: { username: "intruder", password: "another-pass-1" } });
  expect(res.status()).toBe(403);
});

test("unauthenticated access is blocked", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/portfolio");
  await expect(page).toHaveURL(/\/login/);
  const api = await page.request.get("/api/watchlists");
  expect(api.status()).toBe(401);
  await ctx.close();
});

test("every navigation item opens a working page", async ({ page }) => {
  await login(page);
  for (const item of NAV_ITEMS) {
    await page.goto(item.href);
    const title = item.label === "Help & Documentation" ? "Help & Documentation" : item.label;
    await expect(page.getByRole("heading", { level: 1, name: title }), `${item.href} heading`).toBeVisible();
    await expect(page.getByText("This view could not be loaded")).toHaveCount(0);
  }
});

test("keyboard search opens a security page with a rendered chart", async ({ page }) => {
  await login(page);
  const input = page.getByRole("combobox", { name: /search securities/i }).or(page.getByPlaceholder(/Search symbol, company, ISIN/));
  // The shortcut only works once the page has hydrated; retry until it opens.
  await expect(async () => {
    await page.keyboard.press("/");
    await expect(input.first()).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await input.first().fill("kaveri");
  await expect(page.getByRole("option", { name: /KVRBANK/ }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/security\/NSE\/KVRBANK$/);
  await expect(page.getByRole("heading", { name: "KVRBANK" })).toBeVisible();
  await expect(page.locator("canvas").first()).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: /search/i })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /search/i })).toHaveCount(0);
});

test("watchlist additions persist across reloads", async ({ page }) => {
  await login(page);
  await page.goto("/security/NSE/NIRMTECH");
  await page.getByRole("button", { name: "Add to watchlist" }).click();
  await page.getByRole("menuitemcheckbox", { name: "My Watchlist" }).click();
  await expect(page.getByRole("button", { name: /In 1 watchlist/ })).toBeVisible();
  await page.goto("/watchlists");
  await expect(page.getByRole("link", { name: "NIRMTECH" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: "NIRMTECH" })).toBeVisible();
  await page.getByRole("button", { name: "Remove NIRMTECH" }).click();
  await expect(page.getByRole("link", { name: "NIRMTECH" })).toHaveCount(0);
});

test("portfolio: record a buy, value the holding, reject an oversell", async ({ page }) => {
  await login(page);
  await page.goto("/portfolio");
  await page.getByRole("button", { name: "Add transaction" }).first().click();
  const form = page.getByRole("form", { name: "Add transaction" });
  await form.getByPlaceholder("Search symbol or company…").fill("URJAOIL");
  await page.getByRole("option", { name: /URJAOIL/ }).first().click();
  await form.locator("#tx-date").fill("2026-03-02");
  await form.locator("#tx-qty").fill("10");
  await form.locator("#tx-price").fill("2500");
  await form.locator("#tx-fees").fill("20");
  await form.getByRole("button", { name: "Add transaction" }).click();
  await expect(page.getByRole("link", { name: "URJAOIL" })).toBeVisible();
  await expect(page.getByText("₹25,020").first()).toBeVisible();

  await page.getByRole("button", { name: "Add transaction" }).first().click();
  const sell = page.getByRole("form", { name: "Add transaction" });
  await sell.getByPlaceholder("Search symbol or company…").fill("URJAOIL");
  await page.getByRole("option", { name: /URJAOIL/ }).first().click();
  await sell.locator("#tx-type").selectOption("SELL");
  await sell.locator("#tx-date").fill("2026-04-01");
  await sell.locator("#tx-qty").fill("50");
  await sell.locator("#tx-price").fill("2600");
  await sell.getByRole("button", { name: "Add transaction" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /exceeds holding/ })).toBeVisible();
});

test("screener filters run on the server and screens can be saved", async ({ page }) => {
  await login(page);
  await page.goto("/screener");
  const summary = page.getByText(/of \d+ match/).locator("..");
  await expect(summary).toContainText(/(\d+) of (\d+) match/);
  const before = Number((await summary.innerText()).match(/(\d+) of/)![1]);
  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByLabel("Field").first().selectOption("pe");
  await page.getByLabel("Operator").first().selectOption("lt");
  await page.getByLabel("Value", { exact: true }).first().fill("15");
  await expect.poll(async () => Number((await summary.innerText()).match(/(\d+) of/)![1])).toBeLessThan(before);
  await page.getByLabel("Screen name").fill("Low PE");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved “Low PE”")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Low PE", exact: true })).toBeVisible();
});

test("valuation lab computes a DCF and flags invalid assumptions", async ({ page }) => {
  await login(page);
  await page.goto("/valuation");
  await expect(page.getByText("Value per share", { exact: true })).toBeVisible();
  await page.getByLabel(/Terminal growth/).fill("30");
  await expect(page.getByText(/Discount rate must exceed the terminal growth rate/)).toBeVisible();
  await page.getByRole("tab", { name: "SIP" }).click();
  await expect(page.getByText("Projected value").first()).toBeVisible();
});

test("alerts fire once on demo data and are labelled DEMO", async ({ page }) => {
  await login(page);
  await page.goto("/alerts");
  await page.getByRole("form", { name: "Create alert" }).getByPlaceholder("Search symbol or company…").fill("KVRBANK");
  await page.getByRole("option", { name: /KVRBANK/ }).first().click();
  await page.locator("#al-kind").selectOption("PRICE_ABOVE");
  await page.locator("#al-th").fill("1");
  await page.getByRole("button", { name: "Create alert" }).click();
  await expect(page.getByRole("cell", { name: /KVRBANK/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "Check now" }).click();
  await expect(page.getByText(/1 triggered/)).toBeVisible();
  await expect(page.getByText(/^\[DEMO\] KVRBANK/).first()).toBeVisible();
  await page.getByRole("button", { name: "Check now" }).click();
  await expect(page.getByText(/0 triggered/)).toBeVisible();
});

test("CSV exports are attachments with formula-safe content", async ({ page }) => {
  await login(page);
  const search = await page.request.get("/api/search?q=KVRBANK&limit=1");
  const id = (await search.json()).results[0].id as number;
  const res = await page.request.get(`/api/instruments/${id}/export?range=1M`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  expect(res.headers()["content-disposition"]).toContain("attachment");
  const body = await res.text();
  expect(body.split("\r\n")[0]).toBe("date,symbol,exchange,open,high,low,close,volume,data_status,source");
  expect(body).toContain(",demo,");
});

test("cross-site state changes are rejected", async ({ page }) => {
  await login(page);
  const res = await page.request.post("/api/watchlists", { data: { name: "csrf" }, headers: { Origin: "https://evil.example" } });
  expect(res.status()).toBe(403);
});

test("signing out ends the session", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: /E2E Owner/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});

test("mobile layout exposes navigation through the menu button", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await login(page);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("dialog", { name: "Navigation" }).getByRole("link", { name: "Stock Screener" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Stock Screener" })).toBeVisible();
  await ctx.close();
});

test("owner can import an official bhavcopy file and see its provenance", async ({ page }) => {
  await login(page);
  await page.goto("/providers");
  await page.waitForLoadState("networkidle"); // the upload handler is attached on hydration
  // Invented values in the official UDiFF layout.
  const csv = udiffCsv([{ date: "2026-09-30", symbol: "E2ETESTCO", isin: "INE999Z01011", o: 10, h: 12, l: 9, c: 11, prev: 10, vol: 1234 }]);
  await page.locator("#eod-files").setInputFiles({ name: "BhavCopy_NSE_CM_0_0_0_20260930_F_0000.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByText("1 of 1 file(s) imported")).toBeVisible();
  await expect(page.getByRole("cell", { name: "BhavCopy_NSE_CM_0_0_0_20260930_F_0000.csv" }).first()).toBeVisible();
  // The same file again is recognised and skipped.
  await page.locator("#eod-files").setInputFiles({ name: "again.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByText(/Already imported/).first()).toBeVisible();
  // Non-data files are refused by the API.
  const res = await page.request.post("/api/eod/import", { multipart: { files: { name: "x.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") } } });
  expect(res.status()).toBe(400);
});
