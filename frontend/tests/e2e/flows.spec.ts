import { selectProduct, productQuantity, productRow, collectOrder } from "./helpers/orderProducts";
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import * as xlsx from "xlsx";
const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page)).toEqual([]);
});
async function chooseStudent(page: Page) {
  await page.getByRole("button", { name: "5th", exact: true }).click();
  await page.getByRole("button", { name: "Devi Padmini", exact: true }).click();
  await page.getByRole("combobox", { name: "Search student" }).fill("Aarav");
  await page.getByRole("listbox").getByRole("option").first().click();
}
async function orderForm(page: Page) {
  await page.goto("/orders/new");
  await chooseStudent(page);
  await selectProduct(page, "p1");
  await productQuantity(page, "p1").fill("0.5");
  await page
    .getByLabel("Advance amount (optional)", { exact: true })
    .fill("100");
}
test("additional receipts and refunds preserve separate ledger transactions", async ({
  page,
}) => {
  await orderForm(page);
  await page
    .getByRole("button", { name: "Save order", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "View order", exact: true }).click();
  await page
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  await page.getByLabel("Payment amount", { exact: false }).fill("25");
  await page
    .getByRole("button", { name: "Save transaction", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".bill")).toContainText("₹95.00");
  await page
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  await page.getByLabel("Transaction type").selectOption("refund");
  await page.getByLabel("Payment amount", { exact: false }).fill("10");
  await page
    .getByRole("button", { name: "Save transaction", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".bill")).toContainText("₹105.00");
  await page.getByRole("link", { name: "Payments", exact: true }).click();
  await page.getByRole("textbox", { name: "Search payments" }).fill("JP-0087");
  await page.getByRole("button", { name: "Transactions", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await expect(page.locator("tbody")).toContainText("Refund");
  await expect(page.locator("tbody")).toContainText("-₹10.00");
});

test("shared-family phone imports require review and preserve both students", async ({
  page,
}) => {
  await page.goto("/students");
  await page
    .getByRole("button", { name: "Import students", exact: true })
    .click();
  await page.getByLabel("Student import file").setInputFiles({
    name: "siblings.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Student name,Phone,Standard,Division\nSibling First,0123456789,5th,Devi Padmini\nSibling Second,0123456789,5th,Devi Padmini\n",
    ),
  });
  await expect(
    page.getByText("2 valid students", { exact: true }),
  ).toBeVisible();
  const importButton = page.getByRole("button", {
    name: "Import 2 students",
    exact: true,
  });
  await expect(importButton).toBeDisabled();
  await page
    .getByLabel("I reviewed these shared phone numbers and student identities.")
    .check();
  await importButton.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Search students" }).fill("Sibling");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(page.locator("tbody")).toContainText("0123456789");
});
test("editable kg quantities update quarter-rate totals and reject invalid rows", async ({
  page,
}) => {
  await orderForm(page);
  const quantity = productQuantity(page, "p1");
  await expect(quantity).toHaveAttribute("type", "number");
  await expect(quantity).toHaveAttribute(
    "placeholder",
    "उदा. 0.25, 0.5, 1, 10",
  );
  for (const [value, total] of [
    ["0.25", "₹110.00"],
    ["0.5", "₹220.00"],
    ["0.75", "₹330.00"],
    ["1", "₹440.00"],
    ["10", "₹4,400.00"],
    ["100.25", "₹44,110.00"],
  ]) {
    await quantity.fill(value);
    await expect(
      page.locator(".order-items tbody tr").first().locator("td").last(),
    ).toHaveText(total);
  }
  for (const value of ["0.3", "0", "-1", ""]) {
    await quantity.fill(value);
    await page
      .getByRole("button", { name: "Save order", exact: true })
      .last()
      .click();
    await expect(page.locator("#quantity-error-0")).toContainText("प्रमाण");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await quantity.fill("10");
  await page.screenshot({
    path: "test-results/quarter-quantity-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Save order", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "View order", exact: true }).click();
  await expect(page.locator(".bill")).toContainText("₹4,400.00");
  await expect(page.locator(".bill")).toContainText("₹4,300.00");
  await expect(page.locator(".bill-table")).toContainText("दर पाव किलो");
  await expect(page.locator(".bill-table")).toContainText("मोतीचूर लाडू");
  await expect(page.locator(".bill-table")).toContainText("₹110.00");
  await page.getByRole("link", { name: "Edit order", exact: true }).click();
  await expect(quantity).toHaveValue("10");
  await quantity.fill("1.25");
  await page
    .getByRole("button", { name: "Save changes", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "View order", exact: true }).click();
  await expect(page.locator(".bill")).toContainText("₹550.00");
  await expect(page.locator(".bill")).toContainText("₹450.00");
  await page.getByRole("link", { name: "All Orders", exact: false }).click();
  await page.getByRole("textbox", { name: "Search orders" }).fill("JP-0087");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const download = await downloadPromise;
  const csv = await fs.readFile((await download.path())!, "utf8");
  expect(csv).toContain("दर पाव किलो (250 ग्रॅम)");
  expect(csv).toContain(
    "मोतीचूर लाडू | ₹110.00 / 250 ग्रॅम | 1.25 kg | ₹550.00",
  );
});

test("desktop dashboard, school summaries, navigation and collapse", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Dashboard" }),
  ).toBeVisible();
  await expect(page.locator(".welcome-banner, .workspace-chip, .season-note")).toHaveCount(0);
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.locator(".app-shell")).toHaveClass(/is-collapsed/);
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  for (const route of [
    "/students",
    "/products",
    "/staff",
    "/payments",
    "/reports",
    "/activity",
    "/settings",
  ]) {
    await page.goto(route);
    await expect(page.locator("main .page-header h1")).toBeVisible();
    await expect(
      page.getByText("Something went wrong", { exact: true }),
    ).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
test("create, validate, preview, save, edit and reconcile an order", async ({
  page,
}) => {
  await orderForm(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/create-order-desktop.png",
    fullPage: true,
  });
  await expect(page.getByLabel("Customer name", { exact: false })).toHaveValue(
    "Aarav Deshmukh",
  );
  await expect(
    page.getByLabel("Customer phone number", { exact: false }),
  ).toHaveValue("0000000001");
  await expect(page.getByLabel("Collector name", { exact: false })).toHaveValue(
    "Aarav Deshmukh",
  );
  await selectProduct(page, "p2");
  await expect(productRow(page,"p1").getByRole("checkbox")).toBeChecked();
  await productRow(page,"p2").getByRole("checkbox").uncheck();
  await page.getByRole("radio", { name: "Online", exact: true }).check();
  await page
    .getByRole("button", { name: "Save order", exact: true })
    .last()
    .click();
  await expect(
    page.getByText("UTR is required for an online payment", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("UTR number", { exact: false }).fill("DEMO-TEST-123");
  await page
    .getByLabel("Advance amount (optional)", { exact: true })
    .fill("300");
  await page
    .getByRole("button", { name: "Save order", exact: true })
    .last()
    .click();
  await expect(
    page.getByText("Advance cannot exceed the order total"),
  ).toBeVisible();
  await page
    .getByLabel("Advance amount (optional)", { exact: true })
    .fill("100");
  await page
    .getByLabel("Customer name", { exact: false })
    .fill("Demo Test Customer");
  await page
    .getByLabel("Order collected by", { exact: true })
    .selectOption("Customer");
  await expect(page.getByLabel("Collector name", { exact: false })).toHaveValue(
    "Demo Test Customer",
  );
  await page.getByRole("button", { name: "Preview bill" }).click();
  await expect(page.getByRole("dialog")).toContainText("₹220.00");
  await expect(page.getByRole("dialog")).toContainText("₹120.00");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Save order", exact: true })
    .last()
    .click();
  await expect(page.getByRole("dialog")).toContainText("JP-0087");
  await page.getByRole("button", { name: "View order", exact: true }).click();
  await expect(page.locator(".bill")).toContainText("DEMO-TEST-123");
  await page.getByRole("link", { name: "Edit order", exact: true }).click();
  await expect(productQuantity(page, "p1")).toHaveValue("0.5");
  await expect(page.getByLabel("Total received (recorded)",{exact:true})).toHaveAttribute("readonly", "");
  await page.getByLabel("Customer name",{exact:false}).fill("Demo Edited Customer");
  await page
    .getByRole("button", { name: "Save changes", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "View order", exact: true }).click();
  await expect(page.locator(".bill")).toContainText("₹100.00");
  await expect(page.getByText("customerName", { exact: true })).toBeVisible();
  await collectOrder(page);
  await expect(page.locator(".bill")).toContainText("Collected");
  await page.getByRole("link", { name: "Payments", exact: true }).click();
  await page.getByRole("textbox", { name: "Search payments" }).fill("JP-0087");
  await page.getByRole("button", { name: "Transactions", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(page.locator("tbody")).toContainText("₹120.00");
  await page
    .getByRole("link", { name: "Activity & Audit Logs", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Search activity" }).fill("JP-0087");
  await expect(page.locator("tbody")).toContainText("Demo Test Customer");
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(
    page
      .locator(".stat-card")
      .filter({ hasText: "Total orders" })
      .locator("strong"),
  ).toHaveText("87");
  await expect(page.locator(".recent-orders")).toContainText("JP-0087");
});
test("drafts resume, student history and keyboard autocomplete", async ({
  page,
}) => {
  await page.goto("/orders/new");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Draft saved for later.",
  );
  await page.getByRole("button", { name: "View draft" }).click();
  await page.getByRole("link", { name: "Continue draft" }).click();
  await page.getByRole("button", { name: "5th", exact: true }).click();
  await page.getByRole("button", { name: "Devi Padmini", exact: true }).click();
  const input = page.getByRole("combobox", { name: "Search student" });
  await input.fill("Aarav");
  await input.press("Enter");
  await expect(page.getByLabel("Customer name", { exact: false })).toHaveValue(
    "Aarav Deshmukh",
  );
  await page
    .getByRole("button", { name: "1 previous orders", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("JP-0001");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await selectProduct(page, "p1");
  await page
    .getByRole("button", { name: "Save order", exact: true })
    .last()
    .click();
  await expect(page.getByRole("dialog")).toContainText("JP-0087");
});
test("filtered orders, sorting, pagination and actual CSV download", async ({
  page,
}) => {
  await page.goto("/orders");
  await page.getByLabel("Orders per page").selectOption("8");
  await expect(page.locator(".pagination")).toContainText(/Showing 1–\d+ of 86/);
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.locator(".pagination")).toContainText(/Page 2 of \d+/);
  await page.getByRole("button", { name: "Receipt no.", exact: false }).click();
  await page.getByRole("textbox", { name: "Search orders" }).fill("JP-0001");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  const content = await fs.readFile((await download.path())!, "utf8");
  expect(content).toContain("JP-0001");
  expect(content).not.toContain("JP-0002");
  const excelPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Excel", exact: true }).click();
  const workbookDownload = await excelPromise;
  const exported = xlsx.read(
    await fs.readFile((await workbookDownload.path())!),
    { type: "buffer" },
  );
  const exportedRows = xlsx.utils.sheet_to_json(
    exported.Sheets[exported.SheetNames[0]],
  );
  expect(exportedRows).toHaveLength(1);
  expect(exportedRows[0]).toMatchObject({
    "Order number": "JP-0001",
    Phone: "0000000001",
  });
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByLabel("Standard", { exact: true }).selectOption("5th");
  await page
    .getByLabel("Division", { exact: true })
    .selectOption("Devi Padmini");
  await expect(page.locator("tbody")).toContainText("Devi Padmini");
  await expect(page.locator("tbody")).not.toContainText("Kabir");
});
test("CSV and Excel import preview, mapping and duplicate validation", async ({
  page,
}) => {
  await page.goto("/students");
  await page.getByRole("button", { name: "Import students" }).click();
  await page.getByLabel("Student import file").setInputFiles({
    name: "students.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Student name,Phone,Standard,Division\nDemo Import Student,0000099999,5th,Devi Padmini\n",
    ),
  });
  await expect(
    page.getByText("1 valid students", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Import 1 students", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Search students" })
    .fill("Demo Import Student");
  await expect(page.locator("tbody")).toContainText("Demo Import Student");
  await page.getByRole("button", { name: "Import students" }).click();
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.json_to_sheet([
      {
        "Student name": "Excel Student",
        Phone: "0000088888",
        Standard: "6th",
        Division: "Gautam Buddha",
      },
    ]),
    "Students",
  );
  await page.getByLabel("Student import file").setInputFiles({
    name: "students.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: xlsx.write(workbook, { type: "buffer", bookType: "xlsx" }),
  });
  await expect(
    page.getByText("1 valid students", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Import 1 students", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Search students" })
    .fill("Excel Student");
  await expect(page.locator("tbody")).toContainText("Excel Student");
  await page.getByRole("button", { name: "Import students" }).click();
  await page.getByLabel("Student import file").setInputFiles({
    name: "duplicate.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Student name,Phone,Standard,Division\nDemo Import Student,0000099999,5th,Devi Padmini\n",
    ),
  });
  await expect(
    page.getByText(
      "Row 2: Duplicate student record; administrative review required",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Import students", exact: true }).last(),
  ).toBeDisabled();
});
test("school XLS reports skip title rows, use explicit division mappings and allow absent student phones", async ({
  page,
}) => {
  await page.goto("/students");
  await page
    .getByRole("button", { name: "Import students", exact: true })
    .click();
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.aoa_to_sheet([
      ["School"],
      ["School address"],
      ["Student report 2026"],
      [
        "Sr No",
        "Class",
        "Division",
        "पूर्ण नाव",
        "तुकडी",
        "वर्ग",
        "जन्म तारीख",
      ],
      [1, 5, "A", "Report child Alpha", 1, 1, "01/01/2016"],
      [2, 5, "B", "Report child Beta", 2, 1, "02/01/2016"],
      [3, 8, "B-Rani Laxmi", "Report child Gamma", 2, 4, "03/01/2013"],
      [4, 8, "A-Rani Channamma", "Report child Delta", 1, 4, "04/01/2013"],
    ]),
    "School report",
  );
  await page
    .getByLabel("Student import file")
    .setInputFiles({
      name: "school-report.xls",
      mimeType: "application/vnd.ms-excel",
      buffer: xlsx.write(workbook, { type: "buffer", bookType: "biff8" }),
    });
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Header row")).toHaveValue("4");
  await expect(dialog.getByLabel("Student name", { exact: false })).toHaveValue(
    "पूर्ण नाव",
  );
  await expect(dialog.getByLabel("Phone", { exact: true })).toHaveValue("");
  await expect(
    dialog.getByText("2 valid students", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Import 2 students", exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByText("Row 5: Division must match the selected standard", {
      exact: true,
    }),
  ).toBeVisible();
  await dialog
    .getByLabel("Map 5th / A", { exact: false })
    .selectOption("Rana Pratap");
  await dialog.getByLabel("Map 5th / B", {exact:false}).selectOption("Rana Pratap");
  await expect(dialog.getByText("Different report codes (A/B) must use different named divisions", {exact:false}).first()).toBeVisible();
  await expect(dialog.getByRole("button", {name:"Import 2 students",exact:true})).toBeDisabled();
  await dialog
    .getByLabel("Map 5th / B", { exact: false })
    .selectOption("Devi Padmini");
  await expect(dialog.getByLabel("Map 8th / A-Rani Channamma", {exact:false})).toHaveValue("Rani Channamma");
  await expect(dialog.getByLabel("Map 8th / B-Rani Laxmi", {exact:false})).toHaveValue("Rani Laxmibai");
  await dialog.getByLabel("Map 8th / B-Rani Laxmi", {exact:false}).selectOption("Rani Channamma");
  await expect(dialog.getByText("Row 7: Report names Rani Laxmibai; select that named division", {exact:true})).toBeVisible();
  await expect(dialog.getByRole("button",{name:"Import 3 students",exact:true})).toBeDisabled();
  await dialog.getByLabel("Map 8th / B-Rani Laxmi",{exact:false}).selectOption("Rani Laxmibai");
  await expect(
    dialog.getByText("4 valid students", { exact: true }),
  ).toBeVisible();
  await expect(dialog.locator(".import-errors")).toHaveCount(0);
  await dialog.screenshot({ path: "test-results/student-report-import.png" });
  await dialog
    .getByRole("button", { name: "Import 4 students", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("textbox",{name:"Search students"}).fill("Report child");
  await page.getByLabel("Filter student standard").selectOption("8th");
  for (const division of ["Rani Channamma","Rani Laxmibai"]) {
    await page.getByLabel("Filter student division").selectOption(division);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody")).toContainText(division);
  }
  await page.getByRole("button",{name:"Clear",exact:true}).click();
  await page
    .getByRole("textbox", { name: "Search students" })
    .fill("Report child Alpha");
  await expect(page.locator("tbody")).toContainText("Rana Pratap");
  await expect(page.locator("tbody")).toContainText("Not provided");
  await page
    .getByRole("button", { name: "View Report child Alpha", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Create an order for this student" })
    .click();
  await expect(
    page.getByLabel("Customer phone number", { exact: false }),
  ).toHaveValue("");
  await selectProduct(page, "p1");
  await page
    .getByRole("button", { name: "Save order", exact: true })
    .last()
    .click();
  await expect(
    page.getByText("Enter a 10-digit phone number", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("product price changes preserve old bills and affect new rows", async ({
  page,
}) => {
  await page.goto("/orders/o1");
  const oldBill = await page.locator(".bill").innerText();
  await page
    .getByRole("link", { name: "Products & Pricing", exact: true })
    .click();
  const card = page.locator(".product-card").filter({
    has: page.getByRole("heading", { name: "मोतीचूर लाडू", exact: true }),
  });
  await card.getByRole("button", { name: "Edit product" }).click();
  await page
    .getByLabel("दर पाव किलो (250 ग्रॅम)", { exact: false })
    .fill("500");
  await page.getByRole("button", { name: "Save product" }).click();
  await page.getByRole("link", { name: "All Orders", exact: false }).click();
  await page.getByRole("textbox", { name: "Search orders" }).fill("JP-0001");
  await page.getByRole("link", { name: "JP-0001", exact: true }).click();
  expect(await page.locator(".bill").innerText()).toBe(oldBill);
  await page.getByRole("link", { name: "Create Order", exact: true }).click();
  await chooseStudent(page);
  await selectProduct(page, "p1");
  await productQuantity(page,"p1").fill("1");
  await expect(page.locator(".order-items")).toContainText("₹500.00");
  await expect(
    page.locator(".order-items tbody tr").first().locator("td").last(),
  ).toContainText("₹2,000.00");
});
test("staff management, role navigation and demo login", async ({ page }) => {
  await page.goto("/staff");
  await page.getByRole("button", { name: "Create user",exact:true }).click();
  await page.getByLabel("User name", { exact: false }).fill("Demo Staff");
  await page
    .getByLabel("Email address", { exact: false })
    .fill("staff@jpfaral.demo");
  await page.getByLabel(/^Password/).fill("Demo@JPfaral1");
  await page.getByLabel("Confirm password",{exact:false}).fill("Demo@JPfaral1");
  await page.getByRole("dialog").getByRole("button", { name: "Create user",exact:true }).click();
  await expect(page.locator("tbody")).toContainText("Demo Staff");
  await page.getByLabel("Demo role").selectOption("Data Entry Staff");
  await expect(
    page.getByRole("heading", { name: "Dashboard" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Products & Pricing", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "My Activity", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "My activity", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your profile" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  if (await page.getByRole("button", { name: "Dismiss notification" }).count())
    await page.getByRole("button", { name: "Dismiss notification" }).click();
  await page.screenshot({
    path: "test-results/login-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Staff", exact: true }).click();
  await page.getByLabel("Password", { exact: true }).fill("wrongpass");
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(
    page.getByText("Use an active demo account with password diwali2026."),
  ).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("diwali2026");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Dashboard" }),
  ).toBeVisible();
});
test("mobile and tablet layouts, drawer and print bill", async ({ page }) => {
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("link", { name: "Create Order", exact: true }).click();
    await chooseStudent(page);
    await selectProduct(page, "p1");
    await productQuantity(page, "p1").fill("0.25");
    await expect(page.locator(".item-subtotal")).toContainText("₹110.00");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .locator(".order-items")
        .evaluate((el) => el.scrollWidth <= el.parentElement!.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/order-${width}.png`,
      fullPage: true,
    });
  }
  await page.goto("/orders/o1");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".bill")).toBeVisible();
  await page.screenshot({
    path: "test-results/bill-print.png",
    fullPage: true,
  });
  const pdf = await page.pdf({
    path: "test-results/sample-bill.pdf",
    format: "A4",
    printBackground: true,
  });
  expect(pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length).toBe(1);
});
