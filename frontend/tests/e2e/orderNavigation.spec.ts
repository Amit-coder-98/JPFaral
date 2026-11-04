import { expect, test, type Page } from "@playwright/test";

// Populate only the explicit local mock repository; no hosted records are used.
async function studentOrders(page: Page) {
  await page.goto("/students");
  return page.evaluate(async () => {
    const modulePath = "/src/services/repository.ts";
    const { repository } = await import(/* @vite-ignore */ modulePath);
    const data = repository.getSnapshot();
    const student = data.students.find((item: { id: string }) => item.id === "s2");
    const product = data.products[0];
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const receipts: { number: string; id: string }[] = [];
    for (let index = 0; index < 35; index++) {
      const order = await repository.saveOrder({ studentId: student.id,
        customerName: index === 0 ? "Anita collection test" : `Collection customer ${index + 1}`,
        customerPhone: "9876543210", items: [{ productId: product.id, name: product.name, price: product.price, quantity: 0.25 }],
        advance: 20, paymentMethod: "Cash", utr: "", collectionDate: day,
        collectorType: "Student", collectorName: student.name }, "u1", "Confirmed");
      receipts.push({ number: order.number, id: order.id });
    }
    return { student, receipts, day };
  });
}

async function collect(page: Page) {
  await page.getByRole("button", { name: "Collect order & settle payment", exact: true }).click();
  await expect(page.getByLabel("Amount received now", { exact: false })).toHaveValue("90");
  await page.getByRole("button", { name: "Receive balance & collect", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".bill .balance")).toContainText("₹0.00");
  await expect(page.locator(".bill")).toContainText("Collected");
}

for (const width of [1440, 390]) test(`collecting multiple orders returns to the same student's complete list at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const { student, receipts } = await studentOrders(page);
  await page.getByLabel("Search students", { exact: true }).fill(student.name);
  await page.getByRole("button", { name: `View ${student.name}`, exact: true }).click();
  await expect(page.getByRole("dialog").locator("tbody tr")).toHaveCount(35);
  await page.getByRole("dialog").getByRole("link", { name: receipts[0].number, exact: true }).click();
  await collect(page);
  await page.getByRole("link", { name: "Orders", exact: true }).click();
  await expect(page).toHaveURL(/\/orders\?student=s2$/);
  await expect(page.locator("main h1")).toHaveText(`${student.name} · orders`);
  await expect(page.locator("tbody tr")).toHaveCount(35);
  await expect(page.locator(".summary-pills")).toContainText("Awaiting collection 34");
  await expect(page.locator(".summary-pills")).toContainText("Collected 1");
  await expect(page.locator("tbody")).not.toContainText("JP-0001");
  await page.getByRole("link", { name: receipts[1].number, exact: true }).click();
  await collect(page);
  await page.getByRole("link", { name: "Orders", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(35);
  await expect(page.locator(".summary-pills")).toContainText("Awaiting collection 33");
  await expect(page.locator(".summary-pills")).toContainText("Collected 2");
  if (width === 390) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/student-collection-return-phone.png", fullPage: true });
  }
  await page.locator("main").getByRole("link", { name: "All orders", exact: true }).click();
  await expect(page.locator("main h1")).toHaveText("All orders");
  await expect(page.locator("tbody tr")).toHaveCount(121);
});

test("previous orders opened from the order-entry student selection return to that student's list", async ({ page }) => {
  const { student, receipts } = await studentOrders(page);
  await page.getByLabel("Search students", { exact: true }).fill(student.name);
  await page.getByRole("button", { name: `View ${student.name}`, exact: true }).click();
  await page.getByRole("link", { name: "Create an order for this student", exact: true }).click();
  await expect(page.locator(".selected-student")).toContainText(student.name);
  await page.getByRole("button", { name: "35 previous orders", exact: true }).click();
  await page.getByRole("dialog").getByRole("link", { name: receipts[0].number, exact: true }).click();
  await collect(page);
  await page.getByRole("link", { name: "Orders", exact: true }).click();
  await expect(page).toHaveURL(/\/orders\?student=s2$/);
  await expect(page.locator("tbody tr")).toHaveCount(35);
});

test("list filters survive receipt editing, a missed payment and the return to orders", async ({ page }) => {
  const { receipts, day } = await studentOrders(page);
  await page.locator('nav a[href="/orders"]').click();
  await page.getByLabel("Orders on day", { exact: true }).fill(day);
  await page.getByLabel("Orders per page", { exact: true }).selectOption("25");
  await page.getByLabel("Filter by status", { exact: true }).selectOption("Confirmed");
  await page.getByLabel("Filter order source", { exact: true }).selectOption("Student");
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByLabel("Standard", { exact: true }).selectOption("5th");
  await page.getByLabel("Division", { exact: true }).selectOption("Devi Padmini");
  await page.getByLabel("Created by", { exact: true }).selectOption("u1");
  await page.getByLabel("Payment method", { exact: true }).selectOption("Cash");
  await page.getByLabel("Search orders", { exact: true }).fill("Anita collection test");
  await page.getByRole("link", { name: receipts[0].number, exact: true }).click();
  await page.getByRole("link", { name: "Edit order", exact: true }).click();
  await page.getByLabel("Customer name", { exact: false }).fill("Anita collection test edited");
  await page.getByRole("button", { name: "Save changes", exact: true }).last().click();
  await page.getByRole("button", { name: "View order", exact: true }).click();
  await page.getByRole("button", { name: "Record payment", exact: true }).click();
  await page.getByLabel("Payment amount", { exact: false }).fill("10");
  await page.getByRole("button", { name: "Save transaction", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "Orders", exact: true }).click();
  await expect(page.getByLabel("Search orders", { exact: true })).toHaveValue("Anita collection test");
  await expect(page.getByLabel("Orders per page", { exact: true })).toHaveValue("25");
  await expect(page.getByLabel("Orders on day", { exact: true })).toHaveValue(day);
  await expect(page.getByLabel("Filter by status", { exact: true })).toHaveValue("Confirmed");
  await expect(page.getByLabel("Filter order source", { exact: true })).toHaveValue("Student");
  await expect(page.getByLabel("Standard", { exact: true })).toHaveValue("5th");
  await expect(page.getByLabel("Division", { exact: true })).toHaveValue("Devi Padmini");
  await expect(page.getByLabel("Created by", { exact: true })).toHaveValue("u1");
  await expect(page.getByLabel("Payment method", { exact: true })).toHaveValue("Cash");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("₹30.00");
  await expect(page.locator("tbody")).toContainText("₹80.00");
});

test("a directly opened receipt retains its student's context across refresh and Stall uses all orders", async ({ page }) => {
  await page.goto("/orders/o2");
  await expect(page.locator(".bill")).toBeVisible();
  await page.reload();
  await page.getByRole("link", { name: "Orders", exact: true }).click();
  await expect(page).toHaveURL(/\/orders\?student=s8$/);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("JP-0002");
  await page.getByRole("link", { name: "Create Order", exact: true }).click();
  await page.getByRole("button", { name: "Stall", exact: true }).click();
  await page.getByRole("link", { name: "Back to orders", exact: true }).click();
  await expect(page).toHaveURL(/\/orders$/);
  await expect(page.locator("main h1")).toHaveText("All orders");
});
