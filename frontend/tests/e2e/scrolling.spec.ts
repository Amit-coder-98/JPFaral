import { productQuantity } from "./helpers/orderProducts";
import { expect, test } from "@playwright/test";

// Orders and payment transactions intentionally offer the full day list now.
const lists = ["/students", "/staff", "/activity"];
for (const viewport of [
  { width: 1280, height: 720 }, { width: 1440, height: 900 },
  { width: 768, height: 1024 }, { width: 390, height: 844 },
]) {
  test(`list pagination fits ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    for (const route of lists) {
      await page.goto(route);
      const pager = page.locator("main .pagination");
      await expect(pager).toBeVisible();
      await expect.poll(async () => pager.evaluate((element) => element.getBoundingClientRect().bottom))
        .toBeLessThanOrEqual(viewport.height + (viewport.width < 640 ? 120 : 0));
      const size = await page.locator("main tbody tr").count();
      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThanOrEqual(8);
      // Scrolling must not change the records per page.
      await page.evaluate(() => window.scrollTo(0, 300));
      await expect(page.locator("main tbody tr")).toHaveCount(size);
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    await page.goto("/students");
    await expect(page.locator("main .pagination")).toBeVisible();
    await expect(page.locator(".page-skeleton")).toHaveCount(0);
    await page.screenshot({ path: `test-results/students-scroll-${viewport.width}.png`, fullPage: true });
  });
}

test("resizing, pagination, sorting and filtering preserve the complete directory", async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/students");
  await expect.poll(async () => page.locator(".pagination").evaluate((element) => element.getBoundingClientRect().bottom))
    .toBeLessThanOrEqual(720);
  const total = Number(await page.locator(".directory-summary > strong").innerText());
  const first = await page.locator("tbody tr").first().innerText();
  const next = page.getByRole("button", { name: "Next page", exact: true });
  await next.click();
  await expect(page.locator(".pagination")).toContainText("Page 2 of");
  expect(await page.locator("tbody tr").first().innerText()).not.toBe(first);
  await page.getByRole("button", { name: "Previous page", exact: true }).click();
  await expect.poll(() => page.locator("tbody tr").first().innerText()).toBe(first);
  await page.getByRole("button", { name: /^Student/ }).click();
  const names: string[] = [];
  while (true) {
    names.push(...await page.locator(".student-name-button strong").allTextContents());
    if (await next.isDisabled()) break;
    await next.click();
  }
  expect(names).toHaveLength(total);
  expect(new Set(names).size).toBe(total);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel("Filter student standard").selectOption("8th");
  await page.getByLabel("Filter student division").selectOption("Rani Laxmibai");
  await expect(page.locator(".pagination")).toContainText("Page 1 of");
  await expect(page.locator("tbody")).toContainText("Rani Laxmibai");
  await page.getByLabel("Search students", { exact: true }).fill("no such student");
  await expect(page.getByText("No results found", { exact: true })).toBeVisible();
  await expect(page.locator(".pagination")).toHaveCount(0);
});

for (const width of [390, 1440]) {
  test(`catalogue pages keep all 26 products accessible at ${width}px`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/products");
    await expect(page.locator(".product-card")).toHaveCount(width === 390 ? 1 : 3);
    const names: string[] = [];
    const next = page.getByRole("button", { name: "Next page", exact: true });
    while (true) {
      names.push(...await page.locator(".product-card h2").allTextContents());
      if (await next.isDisabled()) break;
      await next.click();
    }
    expect(names).toHaveLength(26);
    expect(new Set(names).size).toBe(26);
    await page.getByLabel("Search products", { exact: true }).fill(names[0]);
    await expect(page.locator(".product-card")).toHaveCount(1);
    await expect(page.locator(".pagination")).toContainText("Page 1 of 1");
    await page.getByLabel("Search products", { exact: true }).fill("no such product");
    await expect(page.getByText("No results found", { exact: true })).toBeVisible();
    await expect(page.locator(".pagination")).toHaveCount(0);
  });
}

test("opening another page resets the previous page's scroll position", async ({ page }) => {
  await page.goto("/orders/new");
  await expect(productQuantity(page, "p1")).toBeVisible();
  await expect(page.locator(".page-skeleton")).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.getByRole("link", { name: "Students", exact: true }).click();
  await expect(page.locator("main h1")).toHaveText("Students");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});
