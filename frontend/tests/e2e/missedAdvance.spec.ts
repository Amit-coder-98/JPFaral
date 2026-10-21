import { test, expect, type Page } from "@playwright/test";
import { selectProduct, productQuantity } from "./helpers/orderProducts";

async function create(page: Page, advance = 0) {
  await page.goto("/orders/new");
  await page.getByRole("button",{name:"5th",exact:true}).click();
  await page.getByRole("button",{name:"Devi Padmini",exact:true}).click();
  await page.getByRole("combobox",{name:"Search student"}).fill("Aarav");
  await page.getByRole("listbox").getByRole("option").first().click();
  await selectProduct(page,"p1");
  await productQuantity(page,"p1").fill("1");
  await page.getByLabel("Advance amount (optional)",{exact:true}).fill(String(advance));
  await page.getByRole("button",{name:"Save order",exact:true}).last().click();
  await page.getByRole("button",{name:"View order",exact:true}).click();
  await expect(page.locator(".bill")).toBeVisible();
  return page.url();
}

test("a forgotten cash advance is added from Edit to the same receipt without deleting or recreating the order",async({page})=>{
  const url=await create(page);
  const number=await page.locator("main h1").innerText();
  await page.getByRole("link",{name:"Edit order",exact:true}).click();
  await expect(page.getByLabel("Total received (recorded)",{exact:true})).toHaveAttribute("readonly", "");
  await page.getByRole("button",{name:"Add advance / payment",exact:true}).click();
  await expect(page.getByRole("dialog")).toContainText("Outstanding: ₹440.00");
  await page.getByLabel("Payment amount",{exact:false}).fill("100");
  await page.getByRole("button",{name:"Save transaction",exact:true}).click();
  await expect(page).toHaveURL(url);
  await expect(page.locator("main h1")).toHaveText(number);
  await expect(page.locator(".bill .balance")).toContainText("₹340.00");
  await expect(page.locator(".order-payment-history tbody tr")).toHaveCount(1);
  await page.getByRole("link",{name:"Orders",exact:true}).click();
  await expect(page.locator(".summary-pills")).toContainText("87 active orders");
});

test("unsaved item edits save before a missed online advance; later edits preserve both receipts",async({page})=>{
  const url=await create(page,100);
  await page.getByRole("link",{name:"Edit order",exact:true}).click();
  await productQuantity(page,"p1").fill("2");
  await page.getByRole("button",{name:"Save changes & add payment",exact:true}).click();
  const dialog=page.getByRole("dialog");
  await expect(dialog).toContainText("Outstanding: ₹780.00");
  await page.getByLabel("Payment amount",{exact:false}).fill("200");
  await page.getByLabel("Receipt method").selectOption("Online");
  await expect(page.getByLabel("Payment reference / UTR",{exact:false})).toHaveAttribute("required", "");
  await page.getByLabel("Payment reference / UTR",{exact:false}).fill("MISSED-ADVANCE-200");
  await page.getByRole("button",{name:"Save transaction",exact:true}).click();
  await expect(page).toHaveURL(url);
  await expect(page.locator(".bill .balance")).toContainText("₹580.00");
  await expect(page.locator(".order-payment-history tbody tr")).toHaveCount(2);
  const history=await page.locator(".order-payment-history tbody td").allTextContents();
  await page.getByRole("link",{name:"Edit order",exact:true}).click();
  await page.getByLabel("Customer name",{exact:false}).fill("Corrected customer");
  await page.getByRole("button",{name:"Save changes",exact:true}).last().click();
  await page.getByRole("button",{name:"View order",exact:true}).click();
  await expect(page.locator(".order-payment-history tbody td")).toHaveText(history);
  await expect(page.locator(".bill .balance")).toContainText("₹580.00");
});

test("cancelling a payment preserves the editor and does not create a receipt on a phone",async({page})=>{
  const url=await create(page);
  await page.getByRole("link",{name:"Edit order",exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await page.getByRole("button",{name:"Add advance / payment",exact:true}).click();
  await page.getByLabel("Payment amount",{exact:false}).fill("100");
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("dialog").getByRole("button",{name:"Cancel",exact:true}).click();
  await expect(page).toHaveURL(url+"/edit");
  await expect(page.getByLabel("Total received (recorded)",{exact:true})).toHaveValue("");
  await page.getByRole("button",{name:"Add advance / payment",exact:true}).click();
  await expect(page.getByLabel("Payment amount",{exact:false})).toHaveValue("");
});
