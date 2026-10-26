import { test, expect, type Page } from "@playwright/test";
import { selectProduct, productQuantity } from "../e2e/helpers/orderProducts";

// UI integration with simulated service responses. Actual Auth/RLS behavior is
// covered separately by database tests and still needs hosted-project acceptance.
const id = "a1111111-1111-4111-8111-111111111111";
async function service(page: Page, role = "super_admin") {
  let active = true,
    invalid = false,
    expired = false;
  const identity = {
    id,
    aud: "authenticated",
    role: "authenticated",
    email: "member@test.invalid",
    email_confirmed_at: "2026-10-11T10:00:00Z",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: "2026-10-11T10:00:00Z",
    updated_at: "2026-10-11T10:00:00Z",
  };
  const encoded = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encoded({ alg: "HS256", typ: "JWT" })}.${encoded({ sub: id, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
  await page.route("https://fixture.supabase.co/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const send = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (url.pathname.endsWith("/token"))
      return invalid
        ? send(
            {
              error: "invalid_grant",
              error_description: "Invalid login credentials",
              code: "invalid_credentials",
            },
            400,
          )
        : send({
            access_token: token,
            refresh_token: "test-refresh-token",
            expires_in: 3600,
            token_type: "bearer",
            user: identity,
          });
    if (url.pathname.endsWith("/user"))
      return expired
        ? send({ message: "JWT expired", code: "bad_jwt" }, 401)
        : send(identity);
    if (url.pathname.endsWith("/logout")) return route.fulfill({ status: 204 });
    if (url.pathname.includes("/rest/v1/")) {
      const table = url.pathname.split("/").at(-1);
      const rows =
        table === "profiles"
          ? [
              {
                id,
                full_name: "Test Member",
                email: identity.email,
                role,
                active,
                preferences: {},
              },
            ]
          : table === "organization_settings"
            ? [
                {
                  id: true,
                  organization: "Test school",
                  address: "",
                  contact: "",
                },
              ]
            : [];
      return send(
        request.headers().accept?.includes("object") ? rows[0] : rows,
      );
    }
    return send({ error: "Unhandled simulated service request" }, 400);
  });
  return {
    deactivate: () => {
      active = false;
    },
    invalid: () => {
      invalid = true;
    },
    expire: () => {
      expired = true;
    },
    setupLink: () =>
      `/auth/setup#access_token=${token}&refresh_token=test-refresh-token&expires_in=3600&token_type=bearer&type=recovery`,
  };
}
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("member@test.invalid");
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "Sign in to workspace", exact: true })
    .click();
}
test("staff can save consecutive Stall orders through the Supabase adapter with distinct request IDs and NULL student rows",async({page})=>{
  await service(page,"staff");
  const products=[{id:"stall-product",name:"मोतीचूर लाडू",price_per_kg:"440.00",active:true,category:"Sweet",description:""}];
  const orders:Record<string,unknown>[]=[],items:Record<string,unknown>[]=[], requests=new Set<string>();
  for(const [table,rows] of [["products",products],["orders",orders],["order_items",items]] as const)
    await page.route(`https://fixture.supabase.co/rest/v1/${table}*`,route=>route.fulfill({contentType:"application/json",body:JSON.stringify(rows)}));
  await page.route("https://fixture.supabase.co/rest/v1/rpc/save_order",async route=>{
    const body=route.request().postDataJSON(), data=body.p_input;
    expect(data.studentId).toBe(""); expect(data.collectorType).toBe("Customer");
    expect(body.p_id).toBe(null); expect(body.p_status).toBe("Confirmed");
    expect(body).not.toHaveProperty("actor"); expect(data.advance).toBe(0);
    expect(requests.has(body.p_request_id)).toBe(false); requests.add(body.p_request_id);
    const orderId=`b1111111-1111-4111-8111-${String(orders.length+1).padStart(12,"0")}`;
    orders.push({id:orderId,order_number:`JP-000${orders.length+1}`,receipt_number:`JP-000${orders.length+1}`,version:1,status:"Confirmed",
      student_id:null,student_name:"",student_standard:"",student_division:"",customer_name:data.customerName,customer_phone:data.customerPhone,
      total_amount:"110.00",collection_date:data.collectionDate,collector_type:"Customer",collector_name:data.collectorName,
      created_by:id,updated_by:id,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),deleted_at:null});
    items.push({id:`item-${orders.length}`,order_id:orderId,product_id:"stall-product",product_name:products[0].name,price_per_kg:"440.00",quantity_kg:"0.25",position:0});
    return route.fulfill({contentType:"application/json",body:JSON.stringify(orderId)});
  });
  await login(page);
  await page.getByRole("link",{name:"Create Order",exact:true}).click();
  for(const name of ["First direct customer","Second direct customer"]) {
    await page.getByRole("button",{name:"Stall",exact:true}).click();
    await page.getByLabel("Customer name",{exact:false}).fill(name);
    await page.getByLabel("Customer phone number",{exact:false}).fill("9876543210");
    await selectProduct(page,"stall-product"); await productQuantity(page,"stall-product").fill("0.25");
    await page.getByRole("button",{name:"Save order",exact:true}).last().click();
    if(name.startsWith("First")) await page.getByRole("button",{name:"Create another",exact:true}).click();
    else await page.getByRole("button",{name:"View order",exact:true}).click();
  }
  await expect(page.locator(".bill")).toContainText("Direct customer order");
  await expect(page.locator(".bill .balance")).toContainText("₹110.00");
  await page.reload();
  await expect(page.locator(".bill")).toContainText("Direct customer order");
  await page.getByRole("link",{name:"Orders",exact:true}).click();
  await page.getByLabel("Filter order source").selectOption("Stall");
  await expect(page.locator("tbody tr")).toHaveCount(2); expect(requests.size).toBe(2);
});
test("staff save and reuse an Others student through Supabase, with optional student phone and persisted junior snapshots",async({page})=>{
  await service(page,"staff");
  const students:Record<string,unknown>[]=[],orders:Record<string,unknown>[]=[],items:Record<string,unknown>[]= [];
  const juniorId="c1111111-1111-4111-8111-111111111111";
  let studentCalls=0;
  const product={id:"junior-product",name:"मोतीचूर लाडू",price_per_kg:"440.00",active:true,category:"Sweet",description:""};
  for(const [table,rows] of [["students",students],["orders",orders],["order_items",items],["products",[product]]] as const)
    await page.route(`https://fixture.supabase.co/rest/v1/${table}*`,route=>route.fulfill({contentType:"application/json",body:JSON.stringify(rows)}));
  await page.route("https://fixture.supabase.co/rest/v1/rpc/save_other_student",async route=>{
    const body=route.request().postDataJSON();
    expect(body).toEqual({p_name:"Persistent junior",p_standard:"3rd",p_division:"A",p_phone:null});
    studentCalls++;
    students.push({id:juniorId,name:body.p_name,standard:"3rd",division_id:null,other_division:"A",phone:null});
    return route.fulfill({contentType:"application/json",body:JSON.stringify(juniorId)});
  });
  await page.route("https://fixture.supabase.co/rest/v1/rpc/save_order",async route=>{
    const body=route.request().postDataJSON(),data=body.p_input;
    expect(data.studentId).toBe(juniorId);expect(data.customerPhone).toBe("9876543210");expect(body).not.toHaveProperty("actor");
    const orderId=`d1111111-1111-4111-8111-${String(orders.length+1).padStart(12,"0")}`;
    orders.push({id:orderId,order_number:`JP-000${orders.length+1}`,version:1,status:"Confirmed",student_id:juniorId,
      student_name:"Persistent junior",student_standard:"3rd",student_division:"A",customer_name:data.customerName,customer_phone:data.customerPhone,
      total_amount:"220.00",collection_date:data.collectionDate,collector_type:"Student",collector_name:data.collectorName,
      created_by:id,updated_by:id,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),deleted_at:null});
    items.push({id:`junior-item-${orders.length}`,order_id:orderId,product_id:product.id,product_name:product.name,price_per_kg:"440.00",quantity_kg:"0.50",position:1});
    return route.fulfill({contentType:"application/json",body:JSON.stringify(orderId)});
  });
  await login(page);
  for(let turn=0;turn<2;turn++) {
    await page.getByRole("link",{name:"Create Order",exact:true}).click();
    await page.getByRole("button",{name:"Others",exact:true}).click();
    const name=page.getByRole("combobox",{name:"Others student name",exact:false});
    await name.fill("Persistent junior");
    if(turn===0) {
      await page.getByLabel("Others standard",{exact:false}).selectOption("3rd");
      await page.getByLabel("Others division (optional)",{exact:false}).fill("A");
      await page.getByRole("button",{name:"Save student & use",exact:true}).click();
    } else await page.getByRole("listbox").getByRole("option").click();
    await expect(page.getByLabel("Student phone (optional)",{exact:false})).toHaveValue("");
    await expect(page.getByLabel("Others standard",{exact:false})).toHaveValue("3rd");
    await page.getByLabel("Customer phone number",{exact:false}).fill("9876543210");
    await selectProduct(page,product.id);await productQuantity(page,product.id).fill("0.5");
    await page.getByRole("button",{name:"Save order",exact:true}).last().click();
    await page.getByRole("button",{name:"View order",exact:true}).click();
    await expect(page.locator(".bill")).toContainText("OTHERS");
    await expect(page.locator(".bill")).toContainText("3rd · A");
    await page.reload();await expect(page.locator(".bill")).toContainText("Persistent junior");
  }
  expect(studentCalls).toBe(1);expect(students).toHaveLength(1);expect(orders).toHaveLength(2);
  await page.getByRole("link",{name:"Dashboard",exact:true}).click();
  await expect(page.locator(".order-source-totals").getByRole("button",{name:/Others/})).toContainText("2 orders");
  await expect(page.locator(".order-source-totals").getByRole("button",{name:/Others/})).toContainText("1 student");
});

test("an older backend clearly requests the Others migration and leaves the existing order modes available",async({page})=>{
  await service(page,"staff");
  await page.route("https://fixture.supabase.co/rest/v1/rpc/save_other_student",route=>route.fulfill({status:404,contentType:"application/json",body:JSON.stringify({code:"PGRST202",message:"Function not found"})}));
  await login(page);
  await page.getByRole("link",{name:"Create Order",exact:true}).click();
  await page.getByRole("button",{name:"Others",exact:true}).click();
  await page.getByRole("combobox",{name:"Others student name",exact:false}).fill("New junior");
  await page.getByLabel("Others standard",{exact:false}).selectOption("1st");
  await page.getByRole("button",{name:"Save student & use",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("202610260001_other_students.sql");
  await expect(page.locator(".selected-student")).toHaveCount(0);
  await page.getByRole("button",{name:"Stall",exact:true}).click();
  await expect(page.locator(".stall-order-notice")).toBeVisible();
  await page.getByRole("button",{name:"5th",exact:true}).click();
  await expect(page.getByRole("button",{name:"Devi Padmini",exact:true})).toBeVisible();
});

test("a slow Others save keeps a later Stall selection when the student response arrives",async({page})=>{
  await service(page,"staff");
  const juniorId="e1111111-1111-4111-8111-111111111111",students:Record<string,unknown>[]= [];
  await page.route("https://fixture.supabase.co/rest/v1/students*",route=>route.fulfill({contentType:"application/json",body:JSON.stringify(students)}));
  let release:()=>void=()=>{};
  const pending=new Promise<void>(resolve=>{release=resolve;});
  await page.route("https://fixture.supabase.co/rest/v1/rpc/save_other_student",async route=>{
    await pending;
    students.push({id:juniorId,name:"Slow junior",standard:"1st",division_id:null,other_division:"",phone:null});
    return route.fulfill({contentType:"application/json",body:JSON.stringify(juniorId)});
  });
  await login(page);
  await page.getByRole("link",{name:"Create Order",exact:true}).click();
  await page.getByRole("button",{name:"Others",exact:true}).click();
  await page.getByRole("combobox",{name:"Others student name",exact:false}).fill("Slow junior");
  await page.getByLabel("Others standard",{exact:false}).selectOption("1st");
  const request=page.waitForRequest("https://fixture.supabase.co/rest/v1/rpc/save_other_student");
  await page.getByRole("button",{name:"Save student & use",exact:true}).click();await request;
  await page.getByRole("button",{name:"Stall",exact:true}).click();
  const refreshed=page.waitForResponse(response=>response.url().includes("/rest/v1/students"));
  release();await refreshed;
  await expect(page.getByRole("button",{name:"Stall",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(page.locator(".selected-student")).toHaveCount(0);
  await expect(page.getByLabel("Customer name",{exact:false})).toHaveValue("");
});

test("missing configuration blocks the workspace without fictional records", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:5175/dashboard");
  await expect(
    page.getByText("Supabase configuration required", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("VITE_SUPABASE_URL", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveCount(0);
});

test("Supabase-mode paid collected test selection sends explicit cleanup and preserves separate history on refresh",async({page})=>{
  await service(page);
  const orderId="b1111111-1111-4111-8111-111111111111";
  const order:Record<string,unknown>={id:orderId,order_number:"JP-0001",version:4,status:"Collected",total_amount:"1320.00",
    student_name:"Test Student",student_standard:"5th",student_division:"Devi Padmini",customer_name:"Test Customer",
    customer_phone:"9876543210",collection_date:"2026-10-20",collector_type:"Student",collector_name:"Test Student",
    created_by:id,updated_by:id,created_at:"2026-10-14T10:00:00Z",updated_at:"2026-10-14T10:00:00Z",deleted_at:null};
  const payment={id:"test-payment",order_id:orderId,amount:"1320.00",kind:"receipt",method:"Cash",received_by:id,paid_at:"2026-10-14T10:00:00Z"};
  const item={id:"test-item",order_id:orderId,product_id:"test-product",product_name:"मोतीचूर लाडू",price_per_kg:"440.00",quantity_kg:"3.00",position:0};
  let requests=0;
  for(const [table,rows] of [['orders',[order]],['payments',[payment]],['order_items',[item]]] as const)
    await page.route(`https://fixture.supabase.co/rest/v1/${table}*`,route=>route.fulfill({contentType:"application/json",body:JSON.stringify(rows)}));
  await page.route("https://fixture.supabase.co/rest/v1/rpc/delete_orders",async route=>{
    const body=route.request().postDataJSON();
    expect(body.p_orders).toEqual([{id:orderId,version:4}]);
    expect(body.p_allow_collected).toBe(true);
    expect(body.p_test_cleanup).toBe(true);
    expect(body.p_reason).toBe("Test data only, no real money");
    expect(body).not.toHaveProperty("actor");
    requests++;
    Object.assign(order,{deleted_at:"2026-10-14T11:00:00Z",deleted_by:id,deletion_reason:body.p_reason,deletion_collected_override:true,deletion_test_data:true,version:5});
    return route.fulfill({contentType:"application/json",body:JSON.stringify({deleted:1})});
  });
  await login(page);
  await page.locator('nav a[href="/orders"]').click();
  await page.getByLabel("Select JP-0001",{exact:true}).check();
  await expect(page.getByLabel("Select JP-0001",{exact:true})).toBeChecked();
  await page.getByRole("button",{name:"Delete selected",exact:true}).click();
  await page.getByLabel("Reason for deletion",{exact:false}).fill("Test data only, no real money");
  await expect(page.getByRole("button",{name:"Confirm delete",exact:true})).toBeDisabled();
  expect(requests).toBe(0);
  await page.getByLabel("These are test entries only; no real money was received.").check();
  await page.getByRole("button",{name:"Confirm delete",exact:true}).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("No results found",{exact:true})).toBeVisible();
  expect(requests).toBe(1);
  await page.reload();
  await expect(page.getByText("No results found",{exact:true})).toBeVisible();
  await page.getByRole("link",{name:"Payments",exact:true}).click();
  await expect(page.getByText("No results found",{exact:true})).toBeVisible();
  await page.getByLabel("Payment records").selectOption("test");
  await page.getByRole("button",{name:"Transactions",exact:true}).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("₹1,320.00");
  await expect(page.locator("tbody")).not.toContainText("Refund");
  await page.getByRole("link",{name:"JP-0001 · Test",exact:true}).click();
  await expect(page.locator(".bill")).toContainText("Deleted test order");
  await expect(page.locator(".bill")).toContainText("₹1,320.00");
  await expect(page.locator(".bill .balance")).toContainText("₹0.00");
});
test("a missed advance from the Supabase edit page appends a receipt to the same order without rewriting the order",async({page})=>{
  await service(page);
  const orderId="c1111111-1111-4111-8111-111111111111";
  const order={id:orderId,order_number:"JP-0401",receipt_number:"JP-0401",version:1,status:"Confirmed",total_amount:"440.00",
    student_name:"Student",student_standard:"5th",student_division:"Devi Padmini",customer_name:"Existing customer",customer_phone:"9876543210",
    collection_date:"2026-10-25",collector_type:"Customer",collector_name:"Existing customer",created_by:id,updated_by:id,
    created_at:"2026-10-21T10:00:00Z",updated_at:"2026-10-21T10:00:00Z",deleted_at:null};
  const receipts:Record<string,unknown>[]=[];
  let writes=0;
  const items=[{id:"item",order_id:orderId,product_id:"product",product_name:"मोतीचूर लाडू",price_per_kg:"440.00",quantity_kg:"1.00",position:1}];
  for(const [table,rows] of [["orders",[order]],["order_items",items],["payments",receipts]] as const)
    await page.route(`https://fixture.supabase.co/rest/v1/${table}*`,route=>route.fulfill({contentType:"application/json",body:JSON.stringify(rows)}));
  await page.route("https://fixture.supabase.co/rest/v1/rpc/save_order",route=>{writes++;return route.fulfill({status:400,contentType:"application/json",body:JSON.stringify({message:"Unexpected order rewrite"})});});
  await page.route("https://fixture.supabase.co/rest/v1/rpc/record_payment",route=>{
    const body=route.request().postDataJSON();
    expect(body).toMatchObject({p_order_id:orderId,p_amount:100,p_method:"Cash",p_kind:"receipt"});
    expect(body).not.toHaveProperty("p_actor");
    expect(body.p_request_id).toMatch(/^[0-9a-f-]{36}$/);
    receipts.push({id:"missed-payment",order_id:orderId,amount:"100.00",method:"Cash",reference:"",kind:"receipt",received_by:id,paid_at:"2026-10-21T11:00:00Z"});
    order.version++;
    return route.fulfill({contentType:"application/json",body:JSON.stringify("missed-payment")});
  });
  await login(page);
  await page.goto(`/orders/${orderId}/edit`);
  await page.getByRole("button",{name:"Add advance / payment",exact:true}).click();
  await page.getByLabel("Payment amount",{exact:false}).fill("100");
  await page.getByRole("button",{name:"Save transaction",exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${orderId}$`));
  await expect(page.locator("main h1")).toHaveText("JP-0401");
  await expect(page.locator(".bill .balance")).toContainText("₹340.00");
  await expect(page.locator(".order-payment-history tbody tr")).toHaveCount(1);
  expect(writes).toBe(0);
  expect(receipts).toHaveLength(1);
});

test("Supabase login restores on refresh, shows empty real workspace, and signs out", async ({
  page,
}) => {
  await service(page);
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Dashboard" }),
  ).toBeVisible();
  await expect(page.getByLabel("Preview as")).toHaveCount(0);
  await expect(page.getByText("No orders yet", { exact: true })).toBeVisible();
  await expect(page.locator(".dashboard-charts, .welcome-banner, .workspace-chip, .season-note")).toHaveCount(0);
  await expect(page.locator(".demo-pill")).toHaveText("Super Admin");
  await expect(
    page
      .locator(".stat-card")
      .filter({ hasText: "Total orders" })
      .locator("strong"),
  ).toHaveText("0");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Dashboard" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in to workspace", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Sign in to workspace", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveCount(0);
});
test("staff navigation and route guards deny administrative screens", async ({
  page,
}) => {
  await service(page, "staff");
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Dashboard" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Staff", exact: true }),
  ).toHaveCount(0);
  await page.goto("/staff");
  await expect(
    page.getByRole("heading", { name: "Dashboard" }),
  ).toBeVisible();
  await page.goto("/students");
  await expect(
    page.getByRole("button", { name: "Import students", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Inventory & Cooking", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Inventory & cooking plan", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Print cook sheet", exact: true })).toBeDisabled();
  await expect(page.getByText("No confirmed orders for these filters", { exact: true })).toBeVisible();
});
test("deactivation clears an already-open workspace on refresh", async ({
  page,
}) => {
  const mock = await service(page);
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Dashboard" }),
  ).toBeVisible();
  mock.deactivate();
  await page.getByRole("button", { name: "Refresh records" }).click();
  await expect(
    page.getByRole("button", { name: "Sign in to workspace", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator("form")
      .getByText("This account is inactive", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveCount(0);
});
test("invalid credentials keep the user outside the workspace", async ({
  page,
}) => {
  const mock = await service(page);
  mock.invalid();
  await login(page);
  await expect(
    page.getByText("Unable to sign in. Check your credentials and try again."),
  ).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveCount(0);
});
test("expired identity verification clears cached business access", async ({
  page,
}) => {
  const mock = await service(page);
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Dashboard" }),
  ).toBeVisible();
  mock.expire();
  await page.getByRole("button", { name: "Refresh records" }).click();
  await expect(
    page.getByRole("button", { name: "Sign in to workspace", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("form").getByText("Your session expired", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveCount(0);
});
test("password recovery completes setup then requires a fresh login", async ({
  page,
}) => {
  const mock = await service(page);
  await page.goto(mock.setupLink());
  await expect(
    page.getByRole("heading", { name: "Set your password" }),
  ).toBeVisible();
  await page
    .getByLabel("New password", { exact: false })
    .fill("a-new-password-123");
  await page
    .getByLabel("Confirm password", { exact: false })
    .fill("a-new-password-123");
  await page
    .getByRole("button", { name: "Save password", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Sign in to workspace", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveCount(0);
});
