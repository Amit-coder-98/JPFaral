import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { selectProduct, productQuantity } from "./helpers/orderProducts";

async function fillStall(page: Page, name="Stall customer") {
  await page.getByRole("button",{name:"Stall",exact:true}).click();
  await page.getByLabel("Customer name",{exact:false}).fill(name);
  await page.getByLabel("Customer phone number",{exact:false}).fill("9876543210");
  await selectProduct(page,"p1");
  await productQuantity(page,"p1").fill("0.75");
}
async function save(page: Page) {
  await page.getByRole("button",{name:"Save order",exact:true}).last().click();
  await page.getByRole("button",{name:"View order",exact:true}).click();
  await expect(page.locator(".bill")).toContainText("Direct customer order");
}

test("Stall follows 10th, requires real contact details, and appears on the bill and complete filtered export",async({page})=>{
  await page.goto("/orders/new");
  await expect(page.locator(".standard-buttons button")).toHaveText(["5th","6th","7th","8th","9th","10th","Stall"]);
  await page.getByRole("button",{name:"Stall",exact:true}).click();
  await expect(page.getByRole("combobox",{name:"Search student"})).toHaveCount(0);
  await expect(page.locator(".division-buttons")).toHaveCount(0);
  await page.getByRole("button",{name:"Save order",exact:true}).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Enter the customer’s name",{exact:true})).toBeVisible();
  await fillStall(page);
  await expect(page.getByLabel("Order collected by",{exact:false})).toHaveValue("Customer");
  await expect(page.getByLabel("Collector name",{exact:false})).toHaveValue("Stall customer");
  await expect(page.locator(".item-subtotal")).toContainText("₹330.00");
  await save(page);
  await expect(page.locator(".bill .balance")).toContainText("₹330.00");
  await expect(page.locator(".bill")).not.toContainText("undefined");
  await page.getByRole("link",{name:"Orders",exact:true}).click();
  await page.getByLabel("Filter order source").selectOption("Stall");
  await expect(page.locator(".summary-pills")).toContainText("1 active order");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("Stall / direct order");
  const downloaded=page.waitForEvent("download");
  await page.getByRole("button",{name:"Export CSV",exact:true}).click();
  const csv=await readFile(await (await downloaded).path(),"utf8");
  expect(csv).toContain('"Order source"'); expect(csv).toContain('"Stall"');
  expect(csv.split(/\r?\n/).filter(Boolean)).toHaveLength(2);
  await page.getByLabel("Filter order source").selectOption("Student");
  await expect(page.locator(".summary-pills")).toContainText("86 active orders");
});

test("Stall drafts reopen with their source; missed advances and collection stay on the same receipt",async({page})=>{
  await page.goto("/orders/new");
  await page.getByRole("button",{name:"Stall",exact:true}).click();
  await selectProduct(page,"p1");
  await productQuantity(page,"p1").fill("0.75");
  await page.getByRole("button",{name:"Save draft",exact:true}).click();
  await page.getByRole("button",{name:"View draft",exact:true}).click();
  await expect(page.locator("main h1")).toHaveText(/^JP-/);
  const url=page.url(), number=await page.locator("main h1").innerText();
  await page.getByRole("link",{name:/Resume draft|Edit order/}).click();
  await expect(page.getByRole("button",{name:"Stall",exact:true})).toHaveAttribute("aria-pressed","true");
  await fillStall(page);
  await save(page);
  await expect(page).toHaveURL(url);
  await page.getByRole("link",{name:"Edit order",exact:true}).click();
  await page.getByRole("button",{name:"Add advance / payment",exact:true}).click();
  await page.getByLabel("Payment amount",{exact:false}).fill("100");
  await page.getByRole("button",{name:"Save transaction",exact:true}).click();
  await expect(page).toHaveURL(url);
  await expect(page.locator(".bill .balance")).toContainText("₹230.00");
  await page.getByRole("button",{name:"Collect order & settle payment",exact:true}).click();
  await page.getByLabel("Collection payment method").selectOption("Online");
  await page.getByLabel("Collection payment reference / UTR",{exact:false}).fill("STALL-SETTLEMENT");
  await page.getByRole("button",{name:"Receive balance & collect",exact:true}).click();
  await expect(page.locator(".bill .balance")).toContainText("₹0.00");
  await expect(page.locator("main h1")).toHaveText(number);
  await expect(page.locator(".order-payment-history tbody tr")).toHaveCount(2);
});

test("switching source removes student attribution and Create another retains Stall with empty contacts",async({page})=>{
  await page.goto("/orders/new");
  await page.getByRole("button",{name:"5th",exact:true}).click();
  await page.getByRole("button",{name:"Devi Padmini",exact:true}).click();
  await page.getByRole("combobox",{name:"Search student"}).fill("Aarav");
  await page.getByRole("listbox").getByRole("option").first().click();
  await page.getByRole("button",{name:"Stall",exact:true}).click();
  await expect(page.locator(".selected-student")).toHaveCount(0);
  await expect(page.getByLabel("Customer name",{exact:false})).toHaveValue("");
  await fillStall(page,"First walk-in");
  await page.getByRole("button",{name:"Save order",exact:true}).last().click();
  await page.getByRole("button",{name:"Create another",exact:true}).click();
  await expect(page.getByRole("button",{name:"Stall",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(page.getByLabel("Customer name",{exact:false})).toHaveValue("");
  await expect(page.getByLabel("Customer phone number",{exact:false})).toHaveValue("");
  await fillStall(page,"Second walk-in"); await save(page);
  await page.getByRole("link",{name:"Orders",exact:true}).click();
  await page.getByLabel("Filter order source").selectOption("Stall");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(page.locator("tbody")).toContainText("First walk-in");
  await expect(page.locator("tbody")).toContainText("Second walk-in");
});

test("reusing an existing school customer keeps Stall selected and the controls fit a phone",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto("/orders/new");
  await page.getByRole("button",{name:"Stall",exact:true}).click();
  await page.getByRole("button",{name:"Find an existing customer & previous orders",exact:true}).click();
  await page.getByLabel("Search existing customers").fill("0000000001");
  await page.getByRole("button",{name:"Use details",exact:true}).first().click();
  await expect(page.getByRole("button",{name:"Stall",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(page.locator(".selected-student")).toHaveCount(0);
  await expect(page.getByLabel("Customer name",{exact:false})).not.toHaveValue("");
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:"test-results/stall-phone.png",fullPage:true});
  await page.getByRole("button",{name:"10th",exact:true}).click();
  await expect(page.getByLabel("Order collected by",{exact:false})).toHaveValue("Student");
  await expect(page.locator(".division-buttons")).toBeVisible();
});
