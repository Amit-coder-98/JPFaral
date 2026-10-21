import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { rateCard } from "../../src/data/rateCard";
import { seedData } from "../../src/data/mock";
import { dayKey, money } from "../../src/utils/format";
import { dailyPayments } from "../../src/utils/dailyPayments";

test("the full order list and selected day show every matching receipt, with optional pagination", async ({page}) => {
  await page.goto("/orders");
  await expect(page.getByLabel("Orders per page")).toHaveValue("all");
  await expect(page.locator("main tbody tr")).toHaveCount(86);
  await page.getByLabel("Orders per page").selectOption("8");
  await expect(page.locator("main tbody tr")).toHaveCount(8);
  await page.getByRole("button",{name:"Next page",exact:true}).click();
  await expect(page.locator(".pagination")).toContainText("Page 2 of 11");
  await page.getByLabel("Orders per page").selectOption("all");
  await page.getByRole("button",{name:"Today’s orders",exact:true}).click();
  const expected = seedData().orders.filter(order=>dayKey(order.createdAt)==="2026-10-11");
  await expect(page.locator("main tbody tr")).toHaveCount(expected.length);
  expect(new Set(await page.locator("tbody .order-link").allTextContents())).toEqual(new Set(expected.map(order=>order.number)));
  const download = page.waitForEvent("download");
  await page.getByRole("button",{name:"Export CSV",exact:true}).click();
  const csv = await readFile((await (await download).path())!,"utf8");
  for(const order of expected) expect(csv).toContain(order.number);
  expect(csv).not.toContain('"JP-0001"');
  await page.screenshot({path:"test-results/full-day-orders-desktop.png",fullPage:true});
  await page.getByLabel("Orders on day").fill("2026-10-01");
  await expect(page.locator("main tbody tr")).toHaveCount(8);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("button",{name:"All dates",exact:true}).click();
  await expect(page.locator("main tbody tr")).toHaveCount(86);
});

test("product checklist follows all 26 printed positions and displays the revised rate",async({page})=>{
  await page.goto("/orders/new");
  const rows=page.locator(".product-checklist tbody tr");
  await expect(rows).toHaveCount(26);
  for(let i=0;i<26;i++) await expect(rows.nth(i).locator("td").first()).toContainText(rateCard[i].name);
  await expect(rows.nth(3).locator("td").nth(1)).toContainText("₹175.00");
  await expect(rows.nth(0).getByRole("spinbutton")).toBeDisabled();
  await rows.nth(0).getByRole("checkbox").check();
  await expect(rows.nth(0).getByRole("spinbutton")).toBeEnabled();
});

test("daily cash and online totals reconcile and a day opens the complete transaction list",async({page})=>{
  await page.goto("/payments");
  await expect(page.getByRole("button",{name:"Daily summary",exact:true})).toHaveAttribute("aria-pressed","true");
  const expected=dailyPayments(seedData().payments);
  await expect(page.locator("main tbody tr")).toHaveCount(expected.length);
  const first=page.locator("main tbody tr").first();
  await expect(first.locator("td").nth(1)).toHaveText(money(expected[0].cash));
  await expect(first.locator("td").nth(2)).toHaveText(money(expected[0].online));
  const download=page.waitForEvent("download");
  await page.getByRole("button",{name:"Export daily summary",exact:true}).click();
  const csv=await readFile((await(await download).path())!,"utf8");
  expect(csv).toContain("Payment day (IST)");
  for(const day of expected) expect(csv).toContain(day.id);
  await page.screenshot({path:"test-results/daily-payments-desktop.png",fullPage:true});
  await page.getByRole("button",{name:`View payments on ${expected[0].id}`,exact:true}).click();
  await expect(page.getByLabel("Payments from")).toHaveValue(expected[0].id);
  await expect(page.locator("main tbody tr")).toHaveCount(expected[0].transactions);
  await page.getByRole("button",{name:"All dates",exact:true}).click();
  await expect(page.locator("main tbody tr")).toHaveCount(seedData().payments.length);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path:"test-results/daily-payment-transactions-phone.png",fullPage:true});
});
