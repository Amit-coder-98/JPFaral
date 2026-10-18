import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { products } from "../../src/data/mock";
import { collectOrder, productQuantity, selectProduct } from "./helpers/orderProducts";

const stat = (page: Page, title: string) => page.locator(".inventory-stats .stat-card").filter({ has: page.getByText(title, { exact: true }) }).locator("strong");
async function makeOrder(page: Page, name: string, items: { id: string; quantity: string }[]) {
  if (!page.url().startsWith("http")) await page.goto("/orders/new");
  else await page.getByRole("link", { name: "Create Order", exact: true }).click();
  await page.getByRole("button", { name: "5th", exact: true }).click();
  await page.getByRole("button", { name: "Devi Padmini", exact: true }).click();
  await page.getByRole("combobox", { name: "Search student" }).fill("Aarav");
  await page.getByRole("listbox").getByRole("option").first().click();
  await page.getByLabel("Customer name", { exact: false }).fill(name);
  for (const item of items) { await selectProduct(page, item.id); await productQuantity(page, item.id).fill(item.quantity); }
  await page.getByLabel("Delivery / collection date", { exact: false }).fill("2026-10-20");
  await page.getByRole("button", { name: "Save order", exact: true }).last().click();
  await page.getByRole("button", { name: "View order", exact: true }).click();
  await expect(page.locator(".bill")).toBeVisible();
}
async function planForNewOrders(page: Page) {
  await page.getByRole("link", { name: "Inventory & Cooking", exact: true }).click();
  await page.getByLabel("Plan by", { exact: true }).selectOption("collection");
  await page.getByLabel("From date", { exact: true }).fill("2026-10-20");
  await page.getByLabel("To date", { exact: true }).fill("2026-10-20");
}

test("inventory defaults to today's orders, switches to collection dates and rejects reversed date ranges", async ({ page }) => {
  await page.goto("/inventory");
  await expect(page.getByRole("heading", { name: "Inventory & cooking plan", exact: true })).toBeVisible();
  await expect(page.getByLabel("Plan by", { exact: true })).toHaveValue("order");
  await expect(page.getByLabel("From date", { exact: true })).toHaveValue("2026-10-11");
  await expect(stat(page, "Orders in view")).toHaveText("6");
  await page.getByRole("button", { name: "Due today", exact: true }).click();
  await expect(page.getByLabel("Plan by", { exact: true })).toHaveValue("collection");
  await expect(stat(page, "Awaiting collection")).toHaveText("0 kg");
  await expect(page.getByRole("button", { name: "Print cook sheet", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Due tomorrow", exact: true }).click();
  await expect(page.getByLabel("From date", { exact: true })).toHaveValue("2026-10-12");
  await expect(page.getByText("No confirmed orders for these filters", { exact: true })).toBeVisible();
  await page.getByLabel("From date", { exact: true }).fill("2026-10-20");
  await page.getByLabel("To date", { exact: true }).fill("2026-10-19");
  await expect(page.getByRole("alert")).toContainText("end date must be on or after");
  await expect(page.getByRole("button", { name: "Export kitchen CSV", exact: true })).toBeDisabled();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#print-area")).toContainText("Cook sheet unavailable");
  await expect(page.locator("#print-area tbody tr")).toHaveCount(0);
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("button", { name: "Reset filters", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(stat(page, "Orders in view")).toHaveText("6");
});

test("cooking totals separate collections, expose receipt breakdowns, and share only pending quantities on phone and print", async ({ page }) => {
  await makeOrder(page, "Kitchen customer A", [{ id: "p1", quantity: "0.25" }, { id: "p16", quantity: "10" }]);
  await makeOrder(page, "Kitchen customer B", [{ id: "p1", quantity: "0.75" }, { id: "p16", quantity: "10" }]);
  await collectOrder(page);
  await planForNewOrders(page);
  await expect(stat(page, "Orders in view")).toHaveText("2");
  await expect(stat(page, "Total ordered")).toHaveText("21 kg");
  await expect(stat(page, "Awaiting collection")).toHaveText("10.25 kg");
  await expect(stat(page, "Already collected")).toHaveText("10.75 kg");
  const laddu = page.locator(".inventory-screen tbody tr").filter({ hasText: "मोतीचूर लाडू" });
  await expect(laddu.locator("td").nth(1)).toHaveText("0.25 kg");
  await expect(laddu).toContainText("1 × 0.25 kg");
  await page.getByRole("button", { name: "View orders for बारीक शेव", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Total 20 kg");
  await expect(page.getByRole("dialog").locator("tbody tr")).toHaveCount(2);
  await expect(page.getByRole("dialog")).toContainText("Collected");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.screenshot({ path: "test-results/inventory-desktop.png", fullPage: true });

  await page.getByLabel("Product category", { exact: true }).selectOption("Savoury");
  await expect(stat(page, "Total ordered")).toHaveText("20 kg");
  await expect(page.locator(".inventory-screen tbody tr")).toHaveCount(1);
  await page.getByLabel("Search cooking products", { exact: true }).fill("लाडू");
  await expect(page.getByText("No confirmed orders for these filters", { exact: true })).toBeVisible();
  await page.getByLabel("Search cooking products", { exact: true }).fill("");
  await page.getByLabel("Product category", { exact: true }).selectOption("");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export kitchen CSV", exact: true }).click();
  const csv = await readFile((await (await downloadPromise).path())!, "utf8");
  expect(csv).toContain("Collection date"); expect(csv).toContain("2026-10-20");
  expect(csv).toContain('"मोतीचूर लाडू","0.25"'); expect(csv).toContain('"बारीक शेव","10"');
  expect(csv).not.toMatch(/Kitchen customer|0000000001|Student|Customer|UTR|Price/);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/inventory-phone.png", fullPage: true });
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".inventory-screen")).not.toBeVisible();
  await expect(page.locator("#print-area")).toBeVisible();
  await expect(page.locator("#print-area tbody tr")).toHaveCount(2);
  await expect(page.locator(".cooking-print-total")).toContainText("10.25 kg");
  expect(await page.locator("#print-area").innerText()).not.toMatch(/Kitchen customer|0000000001|UTR|Total ordered/);
  const pdf = await page.pdf({ path: "test-results/cook-sheet.pdf", format: "A4", printBackground: true });
  expect(pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length).toBe(1);
  await page.screenshot({ path: "test-results/cook-sheet-print.png", fullPage: true });
});

test("kitchen exports and print include all 26 ordered products across table pages", async ({ page }) => {
  await makeOrder(page, "All products kitchen test", products.map(product => ({ id: product.id, quantity: "0.25" })));
  await planForNewOrders(page);
  await expect(stat(page, "Awaiting collection")).toHaveText("6.5 kg");
  await expect(page.locator(".inventory-screen tbody tr")).toHaveCount(8);
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.locator(".pagination")).toContainText("Page 2 of 4");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export kitchen CSV", exact: true }).click();
  const csv = await readFile((await (await downloadPromise).path())!, "utf8");
  expect(csv.trim().split(/\r?\n/)).toHaveLength(27);
  for (const product of products) expect(csv).toContain(product.name);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#print-area tbody tr")).toHaveCount(26);
  await expect(page.locator(".cooking-print-total")).toContainText("6.5 kg");
  await expect(page.locator("#print-area thead")).toHaveCSS("display", "table-header-group");
});
