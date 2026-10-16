import { selectProduct, productQuantity, collectOrder } from "./helpers/orderProducts";
import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function create(page: Page, name: string, advance = 0, draft = false) {
  if (page.url().startsWith("http")) await page.getByRole("link", { name:"Create Order",exact:true }).click();
  else await page.goto("/orders/new");
  await page.getByRole("button", { name: "5th", exact: true }).click();
  await page.getByRole("button", { name: "Devi Padmini", exact: true }).click();
  await page.getByRole("combobox", { name: "Search student" }).fill("Aarav");
  await page.getByRole("listbox").getByRole("option").first().click();
  await page.getByLabel("Customer name", { exact: false }).fill(name);
  await selectProduct(page, "p1");
  await productQuantity(page, "p1").fill("0.25");
  await page.getByLabel("Advance amount (optional)", { exact: true }).fill(String(advance));
  await page.getByRole("button", { name: draft ? "Save draft" : "Save order", exact: true }).last().click();
  await page.getByRole("button", { name: "View order", exact: true }).click();
  await expect(page.locator(".bill")).toBeVisible();
  return { url:page.url(), number:(await page.locator("main h1").innerText()).trim() };
}

test("single delete requires a reason and confirmation, preserves history and prevents editing", async ({ page }) => {
  const order = await create(page,"Deletion test customer");
  await page.getByRole("link", { name:"Orders",exact:true }).click();
  await page.getByLabel("Search orders",{exact:true}).fill("Deletion test customer");
  await page.getByRole("button",{name:`Delete ${order.number}`,exact:true}).click();
  await expect(page.getByRole("dialog")).toContainText(order.number);
  await expect(page.getByRole("button",{name:"Confirm delete",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"Cancel",exact:true}).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button",{name:`Delete ${order.number}`,exact:true}).click();
  await page.getByLabel("Reason for deletion",{exact:false}).fill("Testing a duplicate entry");
  await page.getByRole("button",{name:"Confirm delete",exact:true}).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("No results found",{exact:true})).toBeVisible();
  await expect(page.locator(".summary-pills")).toContainText("0 active orders");
  await page.getByRole("link",{name:"Activity & Audit Logs",exact:true}).click();
  await page.getByLabel("Filter activity action").selectOption("Deleted");
  await page.getByRole("link",{name:order.number,exact:true}).click();
  await expect(page.locator(".bill")).toContainText("Deleted order");
  await expect(page.locator(".bill")).toContainText("₹110.00");
  await expect(page.locator(".bill .balance")).toContainText("₹0.00");
  await expect(page.getByRole("link",{name:"Edit order",exact:true})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Record payment",exact:true})).toHaveCount(0);
  await page.goto(`${order.url}/edit`);
  await expect(page.getByText("Order not found",{exact:true})).toBeVisible();
});

test("bulk selections persist across pages, clear on filtering, and remove only confirmed targets", async ({ page }) => {
  test.setTimeout(120000);
  const orders = [];
  for (let i=1;i<=3;i++) orders.push(await create(page,`Bulk cleanup ${i}`));
  await page.getByRole("link",{name:"Orders",exact:true}).click();
  await page.getByLabel("Search orders",{exact:true}).fill("Bulk cleanup");
  await page.setViewportSize({width:1280,height:650});
  const firstRowNumbers = await page.locator("tbody .order-link").allTextContents();
  await page.getByLabel("Select all eligible orders on this page").check();
  await expect(page.locator(".order-selection-bar")).toContainText(`${firstRowNumbers.length} ${firstRowNumbers.length === 1 ? "order" : "orders"} selected`);
  const next = page.getByRole("button",{name:"Next page",exact:true});
  while (await next.isEnabled()) {
    await next.click();
    await page.getByLabel("Select all eligible orders on this page").check();
  }
  await expect(page.locator(".order-selection-bar")).toContainText("3 orders selected");
  await page.getByLabel("Search orders",{exact:true}).fill("Bulk cleanup 1");
  await expect(page.locator(".order-selection-bar")).toHaveCount(0);
  await page.getByLabel("Search orders",{exact:true}).fill("Bulk cleanup");
  while (true) {
    await page.getByLabel("Select all eligible orders on this page").check();
    if (await next.isDisabled()) break;
    await next.click();
  }
  await page.getByRole("button",{name:"Delete selected",exact:true}).click();
  await expect(page.locator(".deletion-preview li")).toHaveCount(3);
  await page.getByLabel("Reason for deletion",{exact:false}).fill("Three temporary test orders");
  await page.getByRole("button",{name:"Delete 3 orders",exact:true}).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("No results found",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Clear",exact:true}).click();
  await expect(page.locator(".summary-pills")).toContainText("86 active orders");
});

test("deleted orders free their receipt number while new and archived bills keep separate history", async ({ page }) => {
  const first = await create(page, "Numbering regression temporary");
  await page.getByRole("link", { name: "Orders", exact: true }).click();
  await page.getByLabel("Search orders", { exact: true }).fill("Numbering regression");
  await page.getByRole("button", { name: `Delete ${first.number}`, exact: true }).click();
  await page.getByLabel("Reason for deletion", { exact: false }).fill("Temporary numbering check");
  await page.getByRole("button", { name: "Confirm delete", exact: true }).click();
  await expect(page.locator(".summary-pills")).toContainText("0 active orders");

  const next = await create(page, "Numbering regression live");
  expect(next.number).toBe(first.number);
  expect(next.url).not.toBe(first.url);
  await expect(page.locator(".bill-receipt-label")).toHaveText("Receipt no.");
  await expect(page.locator(".bill h2")).toHaveText(next.number);
  await page.getByRole("link", { name: "Orders", exact: true }).click();
  await page.getByLabel("Search orders", { exact: true }).fill("Numbering regression");
  await expect(page.locator(".summary-pills")).toContainText("1 active order in this view");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "List no.", exact: false })).toBeVisible();
  await expect(page.locator("tbody tr td").nth(1)).toHaveText("1");
  await expect(page.locator("tbody .order-link")).toHaveText(next.number);
  await expect(page.locator(".order-numbering-note")).toContainText("receipt numbers become available");
  await expect(page.locator(".pagination")).toContainText("Showing 1–1 of 1");
  await page.getByRole("link", { name: "Activity & Audit Logs", exact: true }).click();
  await page.getByLabel("Filter activity action").selectOption("Deleted");
  await page.getByRole("link", { name: first.number, exact: true }).click();
  await expect(page).toHaveURL(first.url);
  await expect(page.locator(".bill")).toContainText("Numbering regression temporary");
  await expect(page.locator(".bill")).toContainText("Deleted order");
  await page.getByRole("link", { name: "Orders", exact: true }).click();
  await page.getByLabel("Search orders", { exact: true }).fill("Numbering regression live");
  await page.getByRole("link", { name: next.number, exact: true }).click();
  await expect(page).toHaveURL(next.url);
  await expect(page.locator(".bill")).toContainText("Numbering regression live");
  await expect(page.locator(".audit-history")).not.toContainText("Temporary numbering check");
});

test("paid orders explain the refund requirement and keep their ledger after deletion", async ({ page }) => {
  const order = await create(page,"Paid cleanup test",20);
  await page.getByRole("link",{name:"Orders",exact:true}).click();
  await page.getByLabel("Search orders",{exact:true}).fill("Paid cleanup test");
  await page.getByLabel(`Select ${order.number}`,{exact:true}).check();
  await expect(page.locator(".order-selection-bar")).toContainText("1 order selected");
  await page.getByRole("button",{name:`Delete ${order.number}`,exact:true}).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Refund received payments");
  await expect(page.getByRole("button",{name:"Confirm delete",exact:true})).toBeDisabled();
  await page.getByRole("link",{name:"Review order",exact:true}).click();
  await page.getByRole("button",{name:"Record payment",exact:true}).click();
  await page.getByLabel("Transaction type").selectOption("refund");
  await page.getByLabel("Payment amount",{exact:false}).fill("20");
  await page.getByRole("button",{name:"Save transaction",exact:true}).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link",{name:"Orders",exact:true}).click();
  await page.getByLabel("Search orders",{exact:true}).fill("Paid cleanup test");
  await page.getByRole("button",{name:`Delete ${order.number}`,exact:true}).click();
  await page.getByLabel("Reason for deletion",{exact:false}).fill("Refunded temporary test order");
  await page.getByRole("button",{name:"Confirm delete",exact:true}).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link",{name:"Payments",exact:true}).click();
  await page.getByLabel("Search payments",{exact:true}).fill(order.number);
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(page.locator("tbody")).toContainText("Paid cleanup test");
  await expect(page.locator("tbody")).toContainText("Refund");
});

test("paid collected orders keep the refund rule and staff do not receive deletion controls", async ({ page }) => {
  await page.goto("/orders");
  await page.getByLabel("Search orders",{exact:true}).fill("JP-0001");
  await page.getByRole("button",{name:"Delete JP-0001",exact:true}).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Refund");
  await page.getByRole("button",{name:"Cancel",exact:true}).click();
  await page.getByLabel("Demo role").selectOption("Data Entry Staff");
  await page.goto("/orders");
  await expect(page.getByRole("button",{name:/^Delete JP-/})).toHaveCount(0);
  await expect(page.getByLabel("Select all eligible orders on this page")).toHaveCount(0);
});

test("collected test orders can be deleted after an explicit reason and admin acknowledgement", async ({ page }) => {
  const order = await create(page,"Collected test cleanup");
  await collectOrder(page);
  await page.getByRole("button",{name:"Record payment",exact:true}).click();
  await page.getByLabel("Transaction type").selectOption("refund");
  await page.getByLabel("Payment amount",{exact:false}).fill("110");
  await page.getByRole("button",{name:"Save transaction",exact:true}).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});
  await page.getByRole("link",{name:"Orders",exact:true}).click();
  await page.getByLabel("Search orders",{exact:true}).fill("Collected test cleanup");
  await page.getByLabel(`Select ${order.number}`,{exact:true}).check();
  await page.getByRole("button",{name:"Delete selected",exact:true}).click();
  await page.getByLabel("Reason for deletion",{exact:false}).fill("Temporary order used to test collection");
  const confirm = page.getByRole("button",{name:"Confirm delete",exact:true});
  await expect(confirm).toBeDisabled();
  await page.getByLabel("I confirm these collected orders are test or mistaken entries and should be removed.").check();
  await expect(confirm).toBeEnabled();
  await expect(page.getByRole("dialog")).toHaveCSS("opacity","1");
  await page.screenshot({path:"test-results/collected-order-deletion-phone.png",fullPage:true});
  await confirm.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("No results found",{exact:true})).toBeVisible();
});

test("phone deletion dialog and selectors remain inside the viewport", async ({ page }) => {
  const order = await create(page,"Phone deletion test");
  await page.setViewportSize({width:390,height:844});
  await page.getByRole("link",{name:"Orders",exact:true}).click();
  await page.getByLabel("Search orders",{exact:true}).fill("Phone deletion test");
  await page.getByLabel(`Select ${order.number}`,{exact:true}).check();
  await page.getByRole("button",{name:"Delete selected",exact:true}).click();
  const bounds = await page.getByRole("dialog").boundingBox();
  expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.getByRole("dialog")).toHaveCSS("opacity","1");
  await expect(page.locator(".modal-backdrop")).toHaveCSS("opacity","1");
  await page.screenshot({path:"test-results/order-deletion-phone.png",fullPage:true});
  await page.getByRole("button",{name:"Cancel",exact:true}).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
});

test("paid collected test orders allow bulk checkbox cleanup and keep separately labelled test payment history",async({page})=>{
  const order=await create(page,"Paid collected test cleanup",110);
  await collectOrder(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});
  await page.getByRole("link",{name:"Orders",exact:true}).click();
  await page.getByLabel("Search orders",{exact:true}).fill("Paid collected test cleanup");
  await page.getByLabel("Select all eligible orders on this page").check();
  await expect(page.locator(".order-selection-bar")).toContainText("1 order selected");
  await page.getByRole("button",{name:"Delete selected",exact:true}).click();
  await expect(page.getByRole("dialog")).toContainText("Recorded payments ₹110.00");
  await page.getByLabel("Reason for deletion",{exact:false}).fill("Testing only, no real money received");
  const confirm=page.getByRole("button",{name:"Confirm delete",exact:true});
  await expect(confirm).toBeDisabled();
  const acknowledgement=page.getByLabel("These are test entries only; no real money was received.");
  await acknowledgement.check();
  await expect(confirm).toBeEnabled();
  await acknowledgement.uncheck();
  await expect(confirm).toBeDisabled();
  await acknowledgement.check();
  await expect(page.getByRole("dialog")).toHaveCSS("opacity","1");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path:"test-results/paid-test-cleanup-phone.png",fullPage:true});
  await confirm.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("No results found",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Open navigation",exact:true}).click();
  await page.getByRole("link",{name:"Payments",exact:true}).click();
  await page.getByLabel("Search payments",{exact:true}).fill(order.number);
  await expect(page.getByText("No results found",{exact:true})).toBeVisible();
  await page.getByLabel("Payment records").selectOption("test");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("Receipt");
  await expect(page.locator("tbody")).not.toContainText("Refund");
  await expect(page.locator(".stats-grid")).toContainText("Recorded test amount");
  await expect(page.locator(".stats-grid")).toContainText("₹110.00");
  const [download]=await Promise.all([page.waitForEvent("download"),page.getByRole("button",{name:"Export CSV",exact:true}).click()]);
  expect(download.suggestedFilename()).toBe("JPfaral-test-payment-history.csv");
  const csv=await readFile((await download.path())!,"utf8");
  expect(csv).toContain("Record classification");
  expect(csv).toContain("Deleted test order");
  expect(csv).toContain("110");
  expect(csv).not.toContain("refund");
  await page.getByRole("link",{name:`${order.number} · Test`,exact:true}).click();
  await expect(page.locator(".bill")).toContainText("Deleted test order · No real payment received");
  await expect(page.locator(".bill")).toContainText("Recorded test payments");
  await expect(page.locator(".bill .balance")).toContainText("₹0.00");
  await expect(page.getByRole("button",{name:"Record payment",exact:true})).toHaveCount(0);
});
