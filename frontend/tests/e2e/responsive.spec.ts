import { selectProduct, productQuantity, productRow } from "./helpers/orderProducts";
import { expect, test, type Page } from "@playwright/test";

const devices = [
  { width: 320, height: 640 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 820, height: 1180 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
];
const routes = [
  "/dashboard", "/orders/new", "/orders", "/inventory", "/students", "/products",
  "/staff", "/payments", "/reports", "/activity", "/settings",
  "/orders/o1", "/orders/o1/edit",
];

async function checkViewport(page: Page, label: string) {
  const result = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const outside = [...document.querySelectorAll<HTMLElement>(
      "main input, main select, main button, main .button, main .table-scroll, .topbar, .workspace-toolbar, .modal input, .modal select, .modal button",
    )].filter((element) => {
      if (!element.getClientRects().length || element.closest(".table-scroll") && !element.matches(".table-scroll")) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && (rect.right > width + 1 || rect.left < -1);
    }).map((element) => ({
      element: element.tagName,
      name: element.getAttribute("aria-label") || element.textContent?.trim().slice(0,60),
      width: Math.round(element.getBoundingClientRect().width),
    }));
    return { viewport: width, pageWidth: document.documentElement.scrollWidth, outside };
  });
  expect.soft(result.pageWidth, `${label}: page must not scroll sideways`).toBeLessThanOrEqual(result.viewport + 1);
  expect.soft(result.outside, `${label}: controls must stay in the viewport`).toEqual([]);
}

for (const device of devices) {
  test.describe(`responsive ${device.width}x${device.height}`, () => {
    test.use({ viewport: device, hasTouch: device.width <= 1024 });
    test("all pages, quantity entry and import dialog fit", async ({ page }) => {
      test.setTimeout(180000);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      for (const route of routes) {
        await page.goto(route);
        await expect(page.locator("main h1").first()).toBeVisible();
        await expect(page.locator(".page-skeleton")).toHaveCount(0);
        await checkViewport(page, `${device.width} ${route}`);
      }
      await page.goto("/orders/new");
      await selectProduct(page, "p1");
      await productQuantity(page, "p1").fill("9999.75");
      await expect(page.locator(".item-subtotal")).toContainText("₹43,99,890.00");
      await checkViewport(page, `${device.width} large gram quantity`);
      await productQuantity(page, "p1").fill("0.3");
      await expect(page.locator("#quantity-error-0")).toContainText("250 ग्रॅम");
      await checkViewport(page, `${device.width} quantity error`);
      await productQuantity(page, "p1").fill("0.75");
      const quantityBounds = await productQuantity(page, "p1").boundingBox();
      expect(quantityBounds!.width, "quantity digits must have space beside the unit selector").toBeGreaterThanOrEqual(90);
      await expect(page.locator(".item-subtotal")).toContainText("₹330.00");
      if (device.width <= 640) {
        await expect(page.locator(".order-items tbody tr").first()).toHaveCSS("display", "grid");
        const product = await productRow(page,"p1").locator(".product-checkbox-label").boundingBox();
        expect(product!.width).toBeGreaterThan(150);
      }
      if (device.width <= 1024) {
        await expect(productQuantity(page, "p1")).toHaveCSS("font-size","16px");
        await page.getByRole("button", {name:"Open navigation",exact:true}).click();
        const drawer = page.getByRole("dialog", {name:"Workspace navigation",exact:true});
        await expect(drawer).toBeVisible();
        await expect(page.locator("body")).toHaveCSS("overflow","hidden");
        await expect(drawer.getByRole("button", {name:"Close navigation",exact:true})).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(drawer).toHaveCount(0);
        await expect(page.getByRole("button", {name:"Open navigation",exact:true})).toBeFocused();
      }
      await checkViewport(page, `${device.width} gram quantity`);
      await page.screenshot({ path: `test-results/responsive-order-${device.width}.png`, fullPage: true });
      await page.locator(".order-items").screenshot({path:`test-results/responsive-items-${device.width}.png`});
      await page.goto("/students");
      await page.getByRole("button", { name: "Import students", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByLabel("Student import file").setInputFiles({
        name:"responsive-students.csv", mimeType:"text/csv",
        buffer:Buffer.from("Student name,Phone,Standard,Division\nResponsive Child,,8th,B-Rani Laxmi\n"),
      });
      await expect(page.getByRole("dialog").getByText("1 valid students", {exact:true})).toBeVisible();
      await checkViewport(page, `${device.width} import dialog`);
      const bounds = await page.getByRole("dialog").boundingBox();
      expect.soft(bounds!.x + bounds!.width).toBeLessThanOrEqual(device.width);
      expect.soft(bounds!.y + bounds!.height).toBeLessThanOrEqual(device.height + 1);
      await page.getByRole("button", { name: "Close dialog" }).click();
      expect(errors).toEqual([]);
    });
  });
}

test("landscape navigation, dialogs, login and desktop resizing remain usable", async ({page}) => {
  await page.setViewportSize({width:1440,height:900});
  await page.goto("/dashboard");
  await page.getByRole("button",{name:"Collapse sidebar",exact:true}).click();
  await page.setViewportSize({width:844,height:390});
  const menu = page.getByRole("button",{name:"Open navigation",exact:true});
  await menu.click();
  const drawer = page.getByRole("dialog",{name:"Workspace navigation",exact:true});
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("link",{name:"Students",exact:true})).toBeVisible();
  await drawer.getByRole("link",{name:"Students",exact:true}).click();
  await expect(drawer).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveCSS("overflow","hidden");
  await page.getByRole("button",{name:"Import students",exact:true}).click();
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  const bounds = await modal.boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(390);
  await modal.getByRole("button",{name:"Cancel",exact:true}).click();
  await expect(modal).toHaveCount(0);
  await menu.click();
  await page.setViewportSize({width:1440,height:900});
  await expect(page.locator(".drawer-shade")).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveCSS("overflow","hidden");
  await expect(page.locator(".sidebar")).toHaveCSS("visibility","visible");
  await page.getByRole("button",{name:"Sign out",exact:true}).click();
  for (const viewport of [{width:320,height:640},{width:768,height:1024},{width:844,height:390}]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("button",{name:"Sign in to workspace",exact:true})).toBeVisible();
    const width = await page.evaluate(()=>document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(viewport.width + 1);
    await page.screenshot({path:`test-results/responsive-login-${viewport.width}.png`,fullPage:true});
  }
});
