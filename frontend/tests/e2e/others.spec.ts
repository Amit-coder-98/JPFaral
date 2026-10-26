import {test,expect,type Page} from "@playwright/test";
import { selectProduct,productQuantity } from "./helpers/orderProducts";
import {readFile} from "node:fs/promises";
import * as xlsx from "xlsx";

async function newStudent(page:Page,name="Junior test student",standard="2nd",phone="") {
  await page.getByRole("button",{name:"Others",exact:true}).click();
  await page.getByRole("combobox",{name:"Others student name",exact:false}).fill(name);
  await page.getByLabel("Others standard",{exact:false}).selectOption(standard);
  await page.getByLabel("Student phone (optional)",{exact:false}).fill(phone);
  await page.getByRole("button",{name:"Save student & use",exact:true}).click();
  await expect(page.locator(".selected-student")).toContainText(name);
}
async function saveOrder(page:Page) {
  await page.getByLabel("Customer phone number",{exact:false}).fill("9876543210");
  await selectProduct(page,"p1");await productQuantity(page,"p1").fill("0.5");
  await page.getByRole("button",{name:"Save order",exact:true}).last().click();
  await page.getByRole("button",{name:"View order",exact:true}).click();
  await expect(page.locator(".bill")).toContainText("OTHERS");
}

test("Others follows Stall, saves a student without a phone and reuses that student for subsequent orders",async({page})=>{
  await page.goto("/orders/new");
  await expect(page.locator(".standard-buttons button")).toHaveText(["5th","6th","7th","8th","9th","10th","Stall","Others"]);
  await newStudent(page);
  await expect(page.getByLabel("Customer phone number",{exact:false})).toHaveValue("");
  await page.getByRole("button",{name:"Save order",exact:true}).last().click();
  await expect(page.getByText("Enter a 10-digit phone number",{exact:true})).toBeVisible();
  await saveOrder(page);
  await expect(page.locator(".bill")).toContainText("2nd");
  const number=await page.locator("main h1").innerText();
  await page.getByRole("link",{name:"Create Order",exact:true}).click();
  await page.getByRole("button",{name:"Others",exact:true}).click();
  await page.getByRole("combobox",{name:"Others student name",exact:false}).fill("Junior test");
  await page.getByRole("listbox").getByRole("option").click();
  await expect(page.getByLabel("Others standard",{exact:false})).toHaveValue("2nd");
  await saveOrder(page);
  await expect(page.locator("main h1")).not.toHaveText(number);
  await page.getByRole("link",{name:"Orders",exact:true}).click();
  await page.getByLabel("Filter order source").selectOption("Others");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  const csvDownload=page.waitForEvent("download");
  await page.getByRole("button",{name:"Export CSV",exact:true}).click();
  const csv=await readFile(await (await csvDownload).path(),"utf8");
  expect(csv).toContain('"Others"');expect(csv).toContain('"2nd"');
  const excelDownload=page.waitForEvent("download");
  await page.getByRole("button",{name:"Export Excel",exact:true}).click();
  const book=xlsx.read(await readFile(await (await excelDownload).path()),{type:"buffer"});
  const rows=xlsx.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
  expect(rows).toHaveLength(2);expect(rows[0]).toMatchObject({Student:"Junior test student",Standard:"2nd","Order source":"Others"});
  await page.locator('nav a[href="/students"]').click();
  await page.getByLabel("Search students").fill("Junior test student");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("Not provided");
});

test("junior classes, Others and Stall show separate dashboard counts and gift standings",async({page})=>{
  await page.goto("/orders/new"); await newStudent(page); await saveOrder(page);
  await page.getByRole("link",{name:"Create Order",exact:true}).click();
  await newStudent(page,"Younger learner","4th","9876543211"); await saveOrder(page);
  await page.locator('nav a[href="/dashboard"]').click();
  const cards=page.locator(".order-source-totals");
  await expect(cards.getByRole("button",{name:/Others/})).toContainText("2 orders");
  await expect(cards.getByRole("button",{name:/Others/})).toContainText("2 students");
  const choices=await page.getByLabel("Dashboard standard",{exact:true}).locator("option").allTextContents();
  expect(choices.slice(-2)).toEqual(["Stall","Others"]);
  await page.getByLabel("Dashboard standard",{exact:true}).selectOption("2nd");
  const classPanel=page.locator(".school-overview .panel").first();
  await expect(classPanel.locator("tbody tr")).toHaveCount(1);
  await expect(classPanel.locator("tbody")).toContainText("₹220.00");
  await page.getByLabel("Dashboard standard",{exact:true}).selectOption("Others");
  await expect(classPanel.locator("tbody")).toContainText("1st–4th total");
  await expect(classPanel.locator("tbody")).toContainText("₹440.00");
  await expect(page.locator(".school-overview .panel").last()).toContainText("Junior test student");
  await expect(page.locator(".school-overview .panel").last()).toContainText("Younger learner");
  await page.getByLabel("Dashboard standard",{exact:true}).selectOption("Stall");
  await expect(classPanel.locator("tbody")).toContainText("Direct customer total");
});

test("Others drafts reopen correctly; changing a saved name requires saving/selecting a student again",async({page})=>{
  await page.goto("/orders/new"); await newStudent(page,"Draft junior","3rd");
  await page.getByRole("button",{name:"Save draft",exact:true}).click();
  await page.getByRole("button",{name:"View draft",exact:true}).click();
  await expect(page.locator("main h1")).toHaveText(/^JP-/);
  await page.getByRole("link",{name:"Edit order",exact:true}).click();
  await expect(page.getByRole("button",{name:"Others",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(page.getByRole("combobox",{name:"Others student name",exact:false})).toHaveValue("Draft junior");
  await page.getByRole("combobox",{name:"Others student name",exact:false}).fill("Draft junior sibling");
  await expect(page.getByRole("combobox",{name:"Others student name",exact:false})).toHaveValue("Draft junior sibling");
  await expect(page.locator(".selected-student")).toHaveCount(0);
  await page.getByRole("button",{name:"Save student & use",exact:true}).click();
  await saveOrder(page);
  await expect(page.locator(".bill")).toContainText("Draft junior sibling");
  await expect(page.locator(".bill")).toContainText("3rd");
});

test("Others student inputs, suggestions and dashboard source totals fit a phone",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto("/orders/new");await newStudent(page,"Phone learner","1st");
  await page.getByRole("combobox",{name:"Others student name",exact:false}).fill("Phone");
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("listbox").getByRole("option").click();
  await page.getByRole("button",{name:"Others",exact:true}).click();
  await page.evaluate(()=>document.fonts.ready);
  await page.locator(".form-section").first().screenshot({path:"test-results/others-source-phone.png"});
  await page.screenshot({path:"test-results/others-phone.png",fullPage:true});
});

test("Create another keeps Others selected while clearing the previous student's form",async({page})=>{
  await page.goto("/orders/new");await newStudent(page,"Repeat learner","1st","9876543211");
  await selectProduct(page,"p1");await productQuantity(page,"p1").fill("0.25");
  await page.getByRole("button",{name:"Save order",exact:true}).last().click();
  await page.getByRole("button",{name:"Create another",exact:true}).click();
  await expect(page.getByRole("button",{name:"Others",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(page.getByRole("combobox",{name:"Others student name",exact:false})).toHaveValue("");
  await expect(page.getByLabel("Others standard",{exact:false})).toHaveValue("");
  await expect(page.locator(".selected-student")).toHaveCount(0);
  await page.getByRole("combobox",{name:"Others student name",exact:false}).fill("Repeat learner");
  await page.getByRole("listbox").getByRole("option").click();
  await expect(page.getByLabel("Others standard",{exact:false})).toHaveValue("1st");
  await page.getByRole("button",{name:"Stall",exact:true}).click();
  await expect(page.getByRole("combobox",{name:"Others student name",exact:false})).toHaveCount(0);
  await expect(page.getByLabel("Order collected by",{exact:false})).toHaveValue("Customer");
});
